-- The social publishing queue: one table, Instagram only, founder-operated.
--
-- WHAT THIS IS
-- The durable half of scheduled publishing. A local ingest command (scripts/queue-carousels.mjs)
-- transforms the generated slides, uploads them to R2, and writes ONE row per post here. A daily
-- fleet of Vercel cron ticks (/api/cron/publish-tick) asks "is anything due" and publishes it.
--
-- WHY A TABLE AND NOT A FILE
-- The assets are generated on the founder's machine, in Dropbox. A Vercel cron cannot see that
-- filesystem. This row plus the R2 objects it points at ARE the handoff: after ingest, the laptop
-- can be closed and the schedule still runs.
--
-- THE SCHEDULE IS HERE, NOT IN THE CRON. `scheduled_for` is an absolute UTC instant computed at
-- queue time from the wall-clock time the founder typed, in their own zone (src/lib/social/
-- schedule.ts). The cron entries are a dumb tick with no knowledge of the schedule, which is what
-- makes daylight saving a non-event: a fixed UTC cron would drift an hour twice a year, and a row
-- carrying an absolute instant cannot.
--
-- THERE IS NO MONEY COLUMN HERE AND NONE MAY BE ADDED. This table schedules content. It does not
-- price it, pay for it, or account for it. The self-verify grid at the bottom asserts that.
--
-- IDENTITY IS NOT STORED HERE. There is no account id, no access token and no user id. V1 publishes
-- to exactly one Instagram account, whose credentials live in server environment variables and
-- nowhere else. Putting a token in a database row would create a secret with a read path; keeping
-- it in the environment means the only way to read it is to already be the server.
--
-- IDEMPOTENCY, which is the property that matters most. Publishing twice produces a real, public,
-- duplicate post that only a human can delete. Three independent guards:
--   1. A tick CLAIMS a row with a conditional UPDATE (status 'queued' -> 'publishing'). A second
--      tick's UPDATE matches no row, so it does no work. This is the same insert-as-claim shape
--      used by acquisition_events and processed_webhook_events.
--   2. `ig_media_id` is set on success and is checked before any publish. A row that has one is
--      finished forever.
--   3. A partial unique index stops the same carousel being queued twice while one is still
--      pending, so a re-run of the ingest command cannot silently double-book a slot.

CREATE TABLE IF NOT EXISTS public.social_posts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which generated carousel this is. Matches the folder name and the repo markdown filename,
  -- so a row can always be traced back to the content that produced it.
  slug                  text NOT NULL,
  platform              text NOT NULL DEFAULT 'instagram'
                          CHECK (platform IN ('instagram')),

  caption               text NOT NULL,

  -- Ordered R2 object keys, one per slide: ["social/<slug>/<stamp>/slide-1.jpg", ...].
  -- ORDER IS MEANINGFUL. Publishing the right images in the wrong order is a real, public,
  -- wrong post, so the array position IS the carousel position and nothing re-sorts it.
  media_keys            jsonb NOT NULL,

  scheduled_for         timestamptz NOT NULL,

  status                text NOT NULL DEFAULT 'queued'
                          CHECK (status IN ('queued', 'publishing', 'published', 'failed', 'expired')),

  attempt_count         integer NOT NULL DEFAULT 0,
  last_error            text,

  -- Filled on success. Its presence is an absolute bar on publishing this row again.
  ig_media_id           text,
  permalink             text,

  -- Kept for debugging a partial failure. A container that was created but never published
  -- expires on Meta's side after 24 hours on its own; we never need to clean it up.
  carousel_container_id text,
  child_container_ids   jsonb,

  created_at            timestamptz NOT NULL DEFAULT now(),
  published_at          timestamptz,

  CONSTRAINT social_posts_media_is_array CHECK (jsonb_typeof(media_keys) = 'array'),
  -- Instagram carousels are 2 to 10 items. Refusing at the database means a malformed batch
  -- cannot sit in the queue looking fine until its slot arrives.
  CONSTRAINT social_posts_media_count CHECK (
    jsonb_array_length(media_keys) BETWEEN 2 AND 10
  ),
  -- Instagram rejects a caption over 2,200 characters. Nine of the first thirty one carousels
  -- shipped over that limit unnoticed, so the ceiling is enforced here as well as in the tools.
  CONSTRAINT social_posts_caption_len CHECK (char_length(caption) BETWEEN 1 AND 2200),
  -- A published row must carry its evidence, and an unpublished row must not claim any.
  CONSTRAINT social_posts_published_has_id CHECK (
    (status = 'published') = (ig_media_id IS NOT NULL)
  )
);

-- The tick's only query: due rows, oldest slot first.
CREATE INDEX IF NOT EXISTS idx_social_posts_due
  ON public.social_posts (scheduled_for)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_social_posts_slug
  ON public.social_posts (slug);

-- Guard 3 from the header. One pending post per carousel at a time. Re-running the ingest for a
-- batch that is already queued raises a unique violation instead of double-booking the slot.
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_posts_one_pending_per_slug
  ON public.social_posts (slug)
  WHERE status IN ('queued', 'publishing');

-- RLS on, and DELIBERATELY NO POLICIES. Nothing reachable from a browser has any business
-- reading or writing this table: the ingest runs locally with the service role and the tick runs
-- on the server with the service role. A table with RLS enabled and zero policies denies every
-- anon and authenticated request, which is exactly the intent. Do not add a policy to make an
-- admin screen easier; route that through an API route that establishes its own authority.
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.social_posts FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- Self-verify. A partial apply must fail loudly here rather than leave a half-built queue that
-- accepts rows and never publishes them.
DO $$
DECLARE
  n integer;
BEGIN
  IF to_regclass('public.social_posts') IS NULL THEN
    RAISE EXCEPTION 'social_posts table was not created';
  END IF;

  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'social_posts'
     AND indexname = 'idx_social_posts_one_pending_per_slug';
  IF n <> 1 THEN
    RAISE EXCEPTION 'the one-pending-per-slug unique index is missing; double publishing is possible';
  END IF;

  SELECT count(*) INTO n FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relname = 'social_posts' AND c.relrowsecurity;
  IF n <> 1 THEN
    RAISE EXCEPTION 'RLS is not enabled on social_posts';
  END IF;

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'social_posts';
  IF n <> 0 THEN
    RAISE EXCEPTION 'social_posts has % policies; it must have none (service role only)', n;
  END IF;

  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'social_posts'
     AND column_name ~ '(amount|cents|payout|price|commission|revenue|earn|balance|fee|token|secret)';
  IF n <> 0 THEN
    RAISE EXCEPTION 'social_posts has % money or credential columns; it must have none', n;
  END IF;
END $$;

-- PROOF OF COMMIT, and the last statement on purpose. No grid means it did not commit.
-- Expect: table present, rls = yes, policies = 0, indexes = 3, money/credential columns = 0.
SELECT 'A. THIS GRID IS FROM'::text AS what,
       'schema-phase3-social-publish-queue.sql (it creates social_posts)'::text AS detail
UNION ALL
SELECT 'B. table social_posts',
       COALESCE(to_regclass('public.social_posts')::text, 'MISSING - did not commit')
UNION ALL
SELECT 'index: ' || indexname, 'present' FROM pg_indexes
 WHERE schemaname = 'public' AND tablename = 'social_posts'
UNION ALL
SELECT 'rls enabled', CASE WHEN c.relrowsecurity THEN 'yes' ELSE 'NO - stop and tell Claude' END
  FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
 WHERE ns.nspname = 'public' AND c.relname = 'social_posts'
UNION ALL
SELECT 'policies (must be 0)', count(*)::text FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'social_posts'
UNION ALL
SELECT 'money/credential columns (must be 0)', count(*)::text FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'social_posts'
   AND column_name ~ '(amount|cents|payout|price|commission|revenue|earn|balance|fee|token|secret)'
 ORDER BY 1;
