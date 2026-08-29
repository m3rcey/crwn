-- The social publishing queue learns every platform, and every kind of content.
--
-- WHAT THIS IS
-- Phase 3. The queue shipped Instagram-only with a single carousel shape. The founder wants the
-- engine to publish to Facebook, X, TikTok, YouTube and Threads as well, across video, photos,
-- carousels, text, threads and articles. This migration widens the model to carry that.
--
-- WHAT DOES NOT CHANGE
-- Every guard that made the Instagram queue safe survives intact: the claim-by-conditional-update,
-- the one-pending-per-target unique index, the published-has-id constraint, RLS with zero
-- policies, ALL revoked from anon and authenticated, no money and no credential columns.
--
-- THE SHAPE, AND WHY
--   social_posts        the CONTENT. One row per piece: what it is (kind), the ordered assets,
--                       and when it goes out. Unchanged in role, widened in shape.
--   social_post_targets one row per (post, platform). This is what makes a partial result
--                       representable: Instagram can succeed while X fails, and each carries its
--                       OWN caption, because Threads caps a post at 500 characters and X at 280
--                       while Instagram allows 2,200. A caption written for one cannot be reposted
--                       to another unchanged, so the caption lives on the target, not the post.
--
-- FAILING CLOSED ON AUDIT-GATED PLATFORMS. TikTok forces every post from an unaudited client to
-- private and YouTube locks unverified uploads to private, and BOTH return success. That is worse
-- than an error: the row would read published while nobody could see it. The gate lives in code
-- (src/lib/social/capabilities.ts) and the tick refuses before calling the provider; this schema
-- carries the status so the refusal is visible on the row rather than silent.
--
-- NATIVE SCHEDULING. Facebook can be handed a future timestamp and publish it itself. The target
-- records that with status 'handed_off' and the provider's own id, so the tick never publishes it
-- a second time and a reader can tell "Facebook owns this now" from "still waiting on us".

-- ---------------------------------------------------------------------------
-- 1. social_posts: widen from "an Instagram carousel" to "a piece of content"
-- ---------------------------------------------------------------------------

-- What the content IS, independent of where it goes. Mirrors PostKind in capabilities.ts.
ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'carousel'
    CHECK (kind IN ('image', 'carousel', 'video_short', 'video_long', 'text', 'thread', 'article'));

-- Platform-neutral extras that a kind may need: a video's title and duration, an article's body
-- blocks, a thread's ordered parts. Kept as jsonb rather than a column per feature so a new kind
-- does not need a migration. Validated in code before insert (src/lib/social/payload.ts).
ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

-- The old table made media mandatory (2 to 10 keys) because it only knew carousels. A text post,
-- a thread or an article has no media at all, and a video has exactly one. Relax the count and
-- move the per-kind rule into the CHECK below.
ALTER TABLE public.social_posts DROP CONSTRAINT IF EXISTS social_posts_media_count;
ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_media_for_kind CHECK (
    CASE kind
      WHEN 'image'       THEN jsonb_array_length(media_keys) = 1
      WHEN 'carousel'    THEN jsonb_array_length(media_keys) BETWEEN 2 AND 35
      WHEN 'video_short' THEN jsonb_array_length(media_keys) = 1
      WHEN 'video_long'  THEN jsonb_array_length(media_keys) = 1
      ELSE                    jsonb_array_length(media_keys) = 0
    END
  );

-- The post-level platform column is now the DEFAULT target for rows written before targets
-- existed. New ingests write targets directly. Widened so the backfill below can keep old rows.
ALTER TABLE public.social_posts DROP CONSTRAINT IF EXISTS social_posts_platform_check;
ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_platform_check
    CHECK (platform IN ('instagram', 'facebook', 'x', 'tiktok', 'youtube', 'threads'));

-- ---------------------------------------------------------------------------
-- 2. social_post_targets: one row per (post, platform)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.social_post_targets (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id               uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  platform              text NOT NULL
                          CHECK (platform IN ('instagram', 'facebook', 'x', 'tiktok', 'youtube', 'threads')),

  -- Per-target, on purpose. See the header: three different character ceilings.
  caption               text NOT NULL,

  -- Platform-specific overrides the adapter needs: a YouTube privacy status, an X reply chain's
  -- pieces, a Facebook scheduled_publish_time. Validated in code against the platform.
  payload               jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- 'handed_off' means the platform owns the clock now (Facebook native scheduling). The tick
  -- never touches a handed-off row again; a reader knows the provider will publish it.
  status                text NOT NULL DEFAULT 'queued'
                          CHECK (status IN ('queued', 'publishing', 'handed_off', 'published', 'failed', 'expired', 'refused')),

  attempt_count         integer NOT NULL DEFAULT 0,
  last_error            text,

  -- Filled on success. Its presence is an absolute bar on publishing this target again.
  provider_post_id      text,
  permalink             text,
  -- Whatever the provider handed back that is worth keeping for a debugger, with credentials
  -- stripped BEFORE it gets here (redactSecrets in the adapter).
  provider_response     jsonb,

  created_at            timestamptz NOT NULL DEFAULT now(),
  published_at          timestamptz,

  -- A published target must carry its evidence; an unpublished one must not claim any.
  -- 'handed_off' also carries a provider id (the scheduled object) without being published yet.
  CONSTRAINT social_post_targets_published_has_id CHECK (
    (status = 'published') = (provider_post_id IS NOT NULL AND published_at IS NOT NULL)
    OR (status = 'handed_off' AND provider_post_id IS NOT NULL)
  ),
  CONSTRAINT social_post_targets_caption_len CHECK (char_length(caption) BETWEEN 1 AND 63206)
);

-- The tick's only query on this table: due targets, oldest first, joined to the post's slot.
CREATE INDEX IF NOT EXISTS idx_social_post_targets_pending
  ON public.social_post_targets (post_id)
  WHERE status IN ('queued', 'publishing');

CREATE INDEX IF NOT EXISTS idx_social_post_targets_platform
  ON public.social_post_targets (platform, status);

-- One pending target per (post, platform). Re-running the ingest for a batch that is already
-- queued raises a unique violation instead of double-booking a platform.
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_post_targets_one_pending
  ON public.social_post_targets (post_id, platform)
  WHERE status IN ('queued', 'publishing', 'handed_off');

-- Same lockdown as social_posts: RLS on, ZERO policies, nothing reachable from a browser.
ALTER TABLE public.social_post_targets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.social_post_targets FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Backfill: every existing post becomes one Instagram target
-- ---------------------------------------------------------------------------

-- Rows written before this migration carry their platform and caption on the post itself. Give
-- each one the target row the new tick expects, carrying its outcome across so a published post
-- stays published and a queued one stays queued. Idempotent: the unique index above and the
-- NOT EXISTS guard mean re-running this inserts nothing twice.
INSERT INTO public.social_post_targets
  (post_id, platform, caption, status, attempt_count, last_error, provider_post_id, permalink, published_at)
SELECT
  p.id,
  p.platform,
  p.caption,
  CASE p.status
    WHEN 'publishing' THEN 'queued'   -- a claim in flight at migration time is released, never lost
    ELSE p.status
  END,
  p.attempt_count,
  p.last_error,
  p.ig_media_id,
  p.permalink,
  p.published_at
FROM public.social_posts p
WHERE NOT EXISTS (
  SELECT 1 FROM public.social_post_targets t WHERE t.post_id = p.id AND t.platform = p.platform
);

-- The post-level status now means "the whole post": it is derived from its targets by the tick.
-- Nothing here rewrites it; the existing values remain correct for single-target rows.

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Self-verify. A partial apply must fail loudly here.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  n integer;
BEGIN
  IF to_regclass('public.social_post_targets') IS NULL THEN
    RAISE EXCEPTION 'social_post_targets was not created';
  END IF;

  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'social_posts' AND column_name IN ('kind', 'payload');
  IF n <> 2 THEN
    RAISE EXCEPTION 'social_posts is missing kind or payload (found % of 2)', n;
  END IF;

  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'social_post_targets'
     AND indexname = 'idx_social_post_targets_one_pending';
  IF n <> 1 THEN
    RAISE EXCEPTION 'the one-pending-per-target unique index is missing; double publishing is possible';
  END IF;

  SELECT count(*) INTO n FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relname = 'social_post_targets' AND c.relrowsecurity;
  IF n <> 1 THEN
    RAISE EXCEPTION 'RLS is not enabled on social_post_targets';
  END IF;

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename IN ('social_posts', 'social_post_targets');
  IF n <> 0 THEN
    RAISE EXCEPTION 'social tables have % policies; they must have none (service role only)', n;
  END IF;

  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name IN ('social_posts', 'social_post_targets')
     AND column_name ~ '(amount|cents|payout|price|commission|revenue|earn|balance|fee|token|secret)';
  IF n <> 0 THEN
    RAISE EXCEPTION 'social tables have % money or credential columns; they must have none', n;
  END IF;

  -- Every pre-existing post must now have a target, or the new tick would skip it forever.
  SELECT count(*) INTO n FROM public.social_posts p
   WHERE NOT EXISTS (SELECT 1 FROM public.social_post_targets t WHERE t.post_id = p.id);
  IF n <> 0 THEN
    RAISE EXCEPTION '% existing posts have no target row after backfill', n;
  END IF;
END $$;

-- PROOF OF COMMIT, and the last statement on purpose. No grid means it did not commit.
-- Expect: both tables, kind+payload present, rls yes on both, policies 0, backfilled = post count,
-- money/credential columns 0.
SELECT 'A. THIS GRID IS FROM'::text AS what,
       'schema-phase3-social-publish-multiplatform.sql'::text AS detail
UNION ALL
SELECT 'B. table social_post_targets',
       COALESCE(to_regclass('public.social_post_targets')::text, 'MISSING - did not commit')
UNION ALL
SELECT 'C. social_posts.kind + payload', count(*)::text || ' of 2' FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'social_posts' AND column_name IN ('kind', 'payload')
UNION ALL
SELECT 'D. posts', count(*)::text FROM public.social_posts
UNION ALL
SELECT 'E. targets (must be >= posts)', count(*)::text FROM public.social_post_targets
UNION ALL
SELECT 'index: ' || indexname, 'present' FROM pg_indexes
 WHERE schemaname = 'public' AND tablename = 'social_post_targets'
UNION ALL
SELECT 'rls enabled: ' || c.relname, CASE WHEN c.relrowsecurity THEN 'yes' ELSE 'NO - stop and tell Claude' END
  FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
 WHERE ns.nspname = 'public' AND c.relname IN ('social_posts', 'social_post_targets')
UNION ALL
SELECT 'policies (must be 0)', count(*)::text FROM pg_policies
 WHERE schemaname = 'public' AND tablename IN ('social_posts', 'social_post_targets')
UNION ALL
SELECT 'money/credential columns (must be 0)', count(*)::text FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name IN ('social_posts', 'social_post_targets')
   AND column_name ~ '(amount|cents|payout|price|commission|revenue|earn|balance|fee|token|secret)'
 ORDER BY 1;
