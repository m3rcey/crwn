-- Correct stale + fabricated copy in the live "Starter to Pro Upgrade" platform sequence.
--
-- Two problems, both in sequence a1000000-0000-0000-0000-000000000003:
--   1. Price was $50/mo. The real Pro price is $9.99/mo (TIER_PRICING). The fee framing was also
--      wrong: it said Starter is 8%, but Free is 12% and Pro is 8%.
--   2. Step 2 claimed "Pro artists earn 3x more than Starter artists on average." That is a
--      fabricated statistic. CRWN's own rules forbid fake proof, so it is removed, not softened.
--
-- Idempotent: re-running just re-sets the same two rows to the corrected copy. Safe to apply any
-- time. This UPDATEs live rows because the seed was already run in production; the seed file is
-- corrected in the same change so a future re-seed matches.

UPDATE platform_sequence_steps
SET subject = '{{first_name}}, you are ready for Pro',
    body = 'Hey {{first_name}},

You have been putting in work on CRWN: uploading tracks, building your audience, making sales. That is exactly what Pro artists do.

On the Free plan, the CRWN app takes a 12% platform fee. On Pro ($9.99/mo) that drops to 8%, and you unlock the tools that turn casual fans into paying ones:
- Email campaigns to your fans
- SMS marketing
- Discount codes for promotions

A lower fee plus the growth tools is why most artists move up once they are selling.

Upgrade: {{upgrade_url}}

The CRWN Team'
WHERE sequence_id = 'a1000000-0000-0000-0000-000000000003' AND step_number = 1;

UPDATE platform_sequence_steps
SET subject = 'The tools you are missing on Free, {{first_name}}',
    body = 'Hey {{first_name}},

On the Free plan these stay locked:
- Email campaigns that bring fans back
- SMS blasts for new drops
- Discount codes that drive purchases
- Automated email sequences (welcome, win-back, upsell)

Those are how artists on CRWN turn attention into recurring revenue, and Pro drops your platform fee from 12% to 8% at the same time.

Upgrade takes about a minute: {{upgrade_url}}

The CRWN Team'
WHERE sequence_id = 'a1000000-0000-0000-0000-000000000003' AND step_number = 2;

DO $$
DECLARE
  bad_count integer;
BEGIN
  SELECT count(*) INTO bad_count
  FROM platform_sequence_steps
  WHERE sequence_id = 'a1000000-0000-0000-0000-000000000003'
    AND (body LIKE '%$50%' OR body LIKE '%3x more%' OR body LIKE '%3x%');
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'stale Pro copy still present in % row(s)', bad_count;
  END IF;
  RAISE NOTICE 'platform sequence Pro copy corrected';
END $$;
