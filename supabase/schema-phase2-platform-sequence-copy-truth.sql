-- Platform sequence copy: correct three things that are LIVE and wrong.
--
-- Run this in the Supabase SQL editor. It supersedes schema-phase2-fix-platform-sequence-copy.sql,
-- which was itself stale: that file's header says "the real Pro price is $9.99/mo", which stopped
-- being true when Pro moved to $49 on 2026-07-31. Running it did not fix the price, it re-asserted
-- the wrong one.
--
-- WHAT IS WRONG IN PRODUCTION RIGHT NOW (verified by query, 2026-08-15):
--
--   1. PRICE. The "you are ready for Pro" email quotes $9.99/mo. Pro is $49/mo
--      (TIER_PRICING.pro.monthlyDisplay). A live email understating the price by 5x is the worst
--      of the three: an artist who clicks through expecting $9.99 meets a $49 checkout.
--
--   2. A REMOVED FEATURE. Four steps promise "SMS marketing" / "SMS blasts". SMS was removed from
--      CRWN (Twilio dropped over A2P cost; there is no src/lib/sms and no twilio in src). Selling a
--      feature that does not exist is worse than selling one at the wrong price.
--
--   3. EM DASHES. 25 of 27 steps use them, against the standing copy rule in CLAUDE.md.
--
-- Targeted by trigger_type, never by hardcoded uuid, so it survives a reseed.
-- Idempotent: safe to run twice.

BEGIN;

-- ─── 1. Pro upgrade, step 1: real price, real fee, real features, no SMS ────────────────────────
UPDATE platform_sequence_steps s
SET body =
'Hey {{first_name}},

You have been putting in work in the CRWN app: uploading tracks, building your audience, making sales. That is exactly what Pro artists do.

On the Launch plan the CRWN app takes a 12% platform fee. On Pro ($49/mo, or $490 a year) that drops to 8%, and the tools that turn casual fans into paying ones unlock:
- 20 email campaigns a month instead of 1
- Live experiences with ticketing and tips
- Direct messages with your fans
- Scheduled releases and bundles
- Unlimited tracks and members

Pro pays for itself once you are doing about $1,225 a month in sales, because the 4% you stop paying in fees covers the subscription.

Upgrade: {{upgrade_url}}

The CRWN Team'
FROM platform_sequences q
WHERE s.sequence_id = q.id AND q.trigger_type = 'starter_upgrade_nudge' AND s.step_number = 1;

-- ─── 2. Pro upgrade, step 2: same feature truth ─────────────────────────────────────────────────
UPDATE platform_sequence_steps s
SET body =
'Hey {{first_name}},

On the Launch plan these stay locked:
- Email campaigns that bring fans back, 20 a month instead of 1
- Live experiences you can ticket and take tips during
- Direct messages, so your best fans can reach you
- Scheduled releases and bundles
- The clipper tools for turning moments into reach

Those are how artists in the CRWN app turn attention into recurring revenue, and Pro drops your platform fee from 12% to 8% at the same time.

Upgrade takes about a minute: {{upgrade_url}}

The CRWN Team'
FROM platform_sequences q
WHERE s.sequence_id = q.id AND q.trigger_type = 'starter_upgrade_nudge' AND s.step_number = 2;

-- ─── 3. Every remaining SMS promise, wherever it still appears ──────────────────────────────────
-- Bullet lines that are ENTIRELY an SMS promise are removed whole. `n` makes ^ match at each line
-- break; `g` replaces every occurrence. Written as two plain passes rather than one clever regex,
-- because this runs once by hand and a wrong regex silently mangles live email copy.
UPDATE platform_sequence_steps
SET body = regexp_replace(body, '^[-*][[:space:]]*SMS[^' || chr(10) || ']*' || chr(10) || '?', '', 'gn')
WHERE body ILIKE '%SMS%';

-- Any inline mention that survives the bullet removal, mapped to a feature Pro actually has.
UPDATE platform_sequence_steps
SET body = replace(replace(replace(body,
      'SMS marketing', 'live experiences'),
      'SMS blasts', 'email campaigns'),
      'SMS', 'email')
WHERE body ILIKE '%SMS%';

-- ─── 4. Em dashes and en dashes, in subjects and bodies ─────────────────────────────────────────
-- Spaced form first (the common one), then any bare survivor, then en dashes.
UPDATE platform_sequence_steps
SET subject = replace(replace(replace(subject, ' — ', ': '), '—', ': '), '–', '-'),
    body    = replace(replace(replace(body,    ' — ', ': '), '—', ': '), '–', '-')
WHERE subject ~ '[—–]' OR body ~ '[—–]';

-- ─── SELF-VERIFY. Raise loudly rather than reporting a silent half-apply. ───────────────────────
DO $$
DECLARE
  bad_price   int;
  bad_sms     int;
  bad_dash    int;
  pro_ok      int;
BEGIN
  SELECT count(*) INTO bad_price FROM platform_sequence_steps WHERE body LIKE '%9.99%';
  SELECT count(*) INTO bad_sms   FROM platform_sequence_steps WHERE body ILIKE '%SMS%';
  SELECT count(*) INTO bad_dash  FROM platform_sequence_steps WHERE subject ~ '[—–]' OR body ~ '[—–]';
  SELECT count(*) INTO pro_ok    FROM platform_sequence_steps s
    JOIN platform_sequences q ON q.id = s.sequence_id
    WHERE q.trigger_type = 'starter_upgrade_nudge' AND s.step_number = 1 AND s.body LIKE '%$49/mo%';

  IF bad_price > 0 THEN
    RAISE EXCEPTION 'platform sequence copy: % step(s) still quote 9.99', bad_price;
  END IF;
  IF bad_sms > 0 THEN
    RAISE EXCEPTION 'platform sequence copy: % step(s) still promise SMS, a removed feature', bad_sms;
  END IF;
  IF bad_dash > 0 THEN
    RAISE EXCEPTION 'platform sequence copy: % step(s) still contain an em or en dash', bad_dash;
  END IF;
  IF pro_ok <> 1 THEN
    RAISE EXCEPTION 'platform sequence copy: Pro step 1 does not quote $49/mo (found % matching)', pro_ok;
  END IF;

  RAISE NOTICE 'platform sequence copy OK: no 9.99, no SMS, no em dashes, Pro quotes $49/mo';
END $$;

COMMIT;
