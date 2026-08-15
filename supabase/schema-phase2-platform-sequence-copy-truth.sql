-- Platform sequence email copy: make every live claim true.
--
-- Run this in the Supabase SQL editor. It SUPERSEDES schema-phase2-fix-platform-sequence-copy.sql,
-- which was itself stale (its header asserts "the real Pro price is $9.99/mo", which stopped being
-- true on 2026-07-31). Do not run that file again.
--
-- WHAT IS WRONG IN PRODUCTION (verified by reading all 27 step bodies, 2026-08-15). Seven classes,
-- worst first:
--
--   1. FABRICATED STATISTICS. "4x more likely to get their first subscriber", "2x more subscribers
--      in month one", "most artists make back the cost in the first week". CRWN has no such data.
--      One of them is also arithmetically false: at $49/mo Pro, a single $10 subscriber does not
--      make back the cost in a week.
--   2. WRONG TIER LADDER. Two emails teach "Basic $10 / Middle $50 / Premium $200". The canonical
--      ladder is Bronze free / Silver $10 / Gold $25 / Platinum $100 (RECOMMENDED_LADDER in
--      src/lib/tierTemplate.ts, pinned by tierTemplate.test.ts). The live copy also omits the FREE
--      front door entirely and tells artists to start at $10, which is the opposite of the product:
--      Bronze exists to convert anonymous followers into identifiable fans.
--   3. IMPLIED PEER PROOF. "Most artists on CRWN use...", "top artists on CRWN", "artists on CRWN
--      are earning". CRWN is pre-PMF with no paying artists to describe.
--   4. A REMOVED FEATURE. Four steps promise SMS marketing. SMS was dropped over A2P cost; there
--      is no src/lib/sms and no Twilio in src/.
--   5. STALE PRICES. Pro quoted at $9.99 (real: $49). Fan tiers quoted at $50 and $200.
--   6. LEGACY ?tab= LINKS. Five steps point at /profile/artist?tab=..., which now redirects through
--      the legacy TAB_ROUTES map. /profile/artist is Rise Mode. Pointed at the real routes instead.
--   7. EM DASHES. 25 of 27 steps, against the standing copy rule.
--
-- Targeted by trigger_type, never by hardcoded uuid, so it survives a reseed. Idempotent.
-- Self-verifying: it ABORTS naming the failed check rather than half-applying.

BEGIN;

-- ─── 1. new_signup step 3: real ladder, no peer proof ───────────────────────────────────────────
UPDATE platform_sequence_steps s
SET subject = 'How the CRWN ladder works, {{first_name}}',
    body =
'Hey {{first_name}},

Here is the shape most direct-to-fan offers end up in, and the one the CRWN app builds for you by default:

1. Bronze, free. Your front door. It converts anonymous followers into fans you can actually contact, and it has to give them something real on day one.
2. Silver, around $10 a month. The first paid rung, where your most willing fans start.
3. Gold, around $25 a month. Where your existing catalog earns: the vault, the archive, the unreleased material.
4. Platinum, around $100 a month. A small number of superfans, served one-to-many so it stays sustainable.

You can rename any rung and set your own prices. The point is the shape: a free way in, then somewhere to go.

Ready to build it? {{dashboard_url}}

The CRWN Team'
FROM platform_sequences q
WHERE s.sequence_id = q.id AND q.trigger_type = 'new_signup' AND s.step_number = 3;

-- ─── 2. activation_no_track: real routes, no invented stat ──────────────────────────────────────
UPDATE platform_sequence_steps s
SET subject = 'Your page is live, {{first_name}}. Now it needs music.',
    body =
'Hey {{first_name}},

Your CRWN page is set up at thecrwn.app/{{artist_slug}}, but there is nothing on it yet. Fans cannot subscribe to silence.

Uploading your first track takes under two minutes:
https://thecrwn.app/studio/music

Start with your best song. You can always add more later.

The CRWN Team'
FROM platform_sequences q
WHERE s.sequence_id = q.id AND q.trigger_type = 'activation_no_track' AND s.step_number = 1;

UPDATE platform_sequence_steps s
SET subject = 'One track changes what your page can do, {{first_name}}',
    body =
'Hey {{first_name}},

Until there is a track on your page, there is nothing to gate, so there is nothing to sell. That is the only reason this matters.

It does not have to be perfect. A demo, a freestyle, a rough mix. Fans subscribe for access to you, not only for finished releases.

Upload one: https://thecrwn.app/studio/music

If something technical is in the way, file format or upload trouble, just reply and I will help.

Josh, CRWN'
FROM platform_sequences q
WHERE s.sequence_id = q.id AND q.trigger_type = 'activation_no_track' AND s.step_number = 2;

UPDATE platform_sequence_steps s
SET subject = 'Your page has been empty a week, {{first_name}}',
    body =
'Hey {{first_name}},

Your CRWN page has been live for over a week with no music on it. Concretely, that means:

- Anyone who visits has nothing to listen to
- You cannot gate a tier, because there is nothing to gate
- Nothing on the page can earn yet

Putting music out feels like a big step. Start small: one track, even unreleased. You can remove it later.

https://thecrwn.app/studio/music

The CRWN Team'
FROM platform_sequences q
WHERE s.sequence_id = q.id AND q.trigger_type = 'activation_no_track' AND s.step_number = 3;

-- ─── 3. activation_no_tiers: the REAL ladder, real route, no invented stat ──────────────────────
UPDATE platform_sequence_steps s
SET subject = 'Your music is live, {{first_name}}. Now let fans join.',
    body =
'Hey {{first_name}},

You have music on your page, but fans cannot subscribe yet, because there are no tiers.

The CRWN app builds a four-rung ladder by default:
- Bronze, free. Your front door, so a follower becomes a fan you can contact.
- Silver, around $10 a month. The first paid rung.
- Gold, around $25 a month. Where your existing catalog earns.
- Platinum, around $100 a month. A few superfans, served one-to-many.

Rename them and set your own prices. The free rung matters most: it is how you find out who is actually paying attention.

Set them up here: https://thecrwn.app/account/tiers

It takes a few minutes, and nothing is live until you publish it.

The CRWN Team'
FROM platform_sequences q
WHERE s.sequence_id = q.id AND q.trigger_type = 'activation_no_tiers' AND s.step_number = 1;

UPDATE platform_sequence_steps s
SET subject = 'Do not overthink tiers, {{first_name}}. Just start.',
    body =
'Hey {{first_name}},

Your first tier does not have to be right. You can change the name, the price and the benefits whenever you want.

The thing that matters is that a fan has somewhere to go. Open the free rung and one paid rung, and you are in business. The rest can wait.

https://thecrwn.app/account/tiers

Josh, CRWN'
FROM platform_sequences q
WHERE s.sequence_id = q.id AND q.trigger_type = 'activation_no_tiers' AND s.step_number = 2;

-- ─── 4. Pro upgrade: real price, real fee, real features, no SMS, no peer proof ─────────────────
UPDATE platform_sequence_steps s
SET body =
'Hey {{first_name}},

You have been putting in work in the CRWN app: uploading tracks, building your audience, making sales.

On the Launch plan the CRWN app takes a 12% platform fee. On Pro ($49/mo, or $490 a year) that drops to 8%, and these unlock:
- 20 email campaigns a month instead of 1
- Live experiences you can ticket and take tips during
- Direct messages with your fans
- Scheduled releases and bundles
- Discount codes
- Unlimited tracks and members

The arithmetic worth knowing: the 4% you stop paying covers the $49 once you are doing about $1,225 a month in sales. Below that, Launch is the cheaper plan and you should stay on it.

Upgrade: {{upgrade_url}}

The CRWN Team'
FROM platform_sequences q
WHERE s.sequence_id = q.id AND q.trigger_type = 'starter_upgrade_nudge' AND s.step_number = 1;

UPDATE platform_sequence_steps s
SET subject = 'What stays locked on Launch, {{first_name}}',
    body =
'Hey {{first_name}},

On the Launch plan these stay locked:
- Email campaigns that bring fans back, 20 a month instead of 1
- Live experiences you can ticket and take tips during
- Direct messages, so your closest fans can reach you
- Scheduled releases and bundles
- Discount codes

Pro also drops your platform fee from 12% to 8%, which pays for the plan itself once you are around $1,225 a month in sales.

Upgrade takes about a minute: {{upgrade_url}}

The CRWN Team'
FROM platform_sequences q
WHERE s.sequence_id = q.id AND q.trigger_type = 'starter_upgrade_nudge' AND s.step_number = 2;

-- ─── 5. paid_churned step 2: no SMS, no "top artists" ───────────────────────────────────────────
UPDATE platform_sequence_steps s
SET body =
'Hey {{first_name}},

Since downgrading you no longer have:
- Email campaigns to your fans, back down to 1 a month
- Live experiences with ticketing and tips
- Direct messages
- Scheduled releases and bundles
- Discount codes

Your platform fee also went back to 12% from 8%.

If the timing is better now, you can re-upgrade instantly:
{{upgrade_url}}

The CRWN Team'
FROM platform_sequences q
WHERE s.sequence_id = q.id AND q.trigger_type = 'paid_churned' AND s.step_number = 2;

-- ─── 6. upgrade_abandoned step 2: no SMS, no false payback claim ────────────────────────────────
UPDATE platform_sequence_steps s
SET body =
'Hey {{first_name}},

Upgrading unlocks email campaigns, live experiences, direct messages, scheduled releases, bundles and discount codes, and drops your platform fee from 12% to 8%.

Worth doing the arithmetic before you decide: Pro is $49 a month, and the 4% you stop paying covers it at roughly $1,225 a month in sales. If you are not there yet, Launch is genuinely the better plan and this can wait.

{{upgrade_url}}

If you have questions about what is included, just reply.

The CRWN Team'
FROM platform_sequences q
WHERE s.sequence_id = q.id AND q.trigger_type = 'upgrade_abandoned' AND s.step_number = 2;

-- ─── 7. Sweep: any surviving SMS, legacy ?tab= link, or dash, anywhere ──────────────────────────
UPDATE platform_sequence_steps
SET body = replace(replace(replace(body,
      'SMS marketing', 'live experiences'),
      'SMS blasts', 'email campaigns'),
      'SMS', 'email')
WHERE body ILIKE '%SMS%';

UPDATE platform_sequence_steps
SET body = replace(replace(replace(body,
      '{{dashboard_url}}?tab=tiers', 'https://thecrwn.app/account/tiers'),
      '{{dashboard_url}}?tab=music', 'https://thecrwn.app/studio/music'),
      '{{dashboard_url}}?tab=tracks', 'https://thecrwn.app/studio/music')
WHERE body LIKE '%?tab=%';

UPDATE platform_sequence_steps
SET subject = replace(replace(replace(subject, ' — ', ': '), '—', ': '), '–', '-'),
    body    = replace(replace(replace(body,    ' — ', ': '), '—', ': '), '–', '-')
WHERE subject ~ '[—–]' OR body ~ '[—–]';

-- ─── SELF-VERIFY. Abort loudly rather than half-applying. ───────────────────────────────────────
DO $$
DECLARE
  bad_stat  int;
  bad_tier  int;
  bad_proof int;
  bad_sms   int;
  bad_price int;
  bad_tab   int;
  bad_dash  int;
  pro_ok    int;
BEGIN
  SELECT count(*) INTO bad_stat  FROM platform_sequence_steps WHERE body ~* '[0-9]+x (more|less|likely)|[0-9]{2,}% (more|of artists)';
  SELECT count(*) INTO bad_tier  FROM platform_sequence_steps WHERE body ~* 'Basic \(\$|Middle \(\$|Premium \(\$';
  SELECT count(*) INTO bad_proof FROM platform_sequence_steps WHERE body ~* 'most artists|top artists|artists on CRWN are';
  SELECT count(*) INTO bad_sms   FROM platform_sequence_steps WHERE body ILIKE '%SMS%';
  SELECT count(*) INTO bad_price FROM platform_sequence_steps WHERE body LIKE '%9.99%' OR body LIKE '%$50/mo%' OR body LIKE '%$200/mo%';
  SELECT count(*) INTO bad_tab   FROM platform_sequence_steps WHERE body LIKE '%?tab=%';
  SELECT count(*) INTO bad_dash  FROM platform_sequence_steps WHERE subject ~ '[—–]' OR body ~ '[—–]';
  SELECT count(*) INTO pro_ok    FROM platform_sequence_steps s
    JOIN platform_sequences q ON q.id = s.sequence_id
    WHERE q.trigger_type = 'starter_upgrade_nudge' AND s.step_number = 1 AND s.body LIKE '%$49/mo%';

  IF bad_stat  > 0 THEN RAISE EXCEPTION 'copy: % step(s) still cite an invented statistic', bad_stat; END IF;
  IF bad_tier  > 0 THEN RAISE EXCEPTION 'copy: % step(s) still teach the wrong tier ladder', bad_tier; END IF;
  IF bad_proof > 0 THEN RAISE EXCEPTION 'copy: % step(s) still imply peer proof CRWN does not have', bad_proof; END IF;
  IF bad_sms   > 0 THEN RAISE EXCEPTION 'copy: % step(s) still promise SMS, a removed feature', bad_sms; END IF;
  IF bad_price > 0 THEN RAISE EXCEPTION 'copy: % step(s) still quote a stale price', bad_price; END IF;
  IF bad_tab   > 0 THEN RAISE EXCEPTION 'copy: % step(s) still use a legacy ?tab= link', bad_tab; END IF;
  IF bad_dash  > 0 THEN RAISE EXCEPTION 'copy: % step(s) still contain an em or en dash', bad_dash; END IF;
  IF pro_ok   <> 1 THEN RAISE EXCEPTION 'copy: Pro step 1 does not quote $49/mo (found %)', pro_ok; END IF;

  RAISE NOTICE 'platform sequence copy OK: no invented stats, real ladder, no SMS, real prices, real routes, no dashes';
END $$;

COMMIT;
