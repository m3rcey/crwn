-- Activation Nudge Sequences — milestone-aware drip emails for stalled artists
-- Run in Supabase SQL Editor AFTER schema-phase2-funnel-tracking.sql

-- 1. Expand trigger_type constraint to include activation nudges
ALTER TABLE platform_sequences
  DROP CONSTRAINT IF EXISTS platform_sequences_trigger_type_check;

ALTER TABLE platform_sequences
  ADD CONSTRAINT platform_sequences_trigger_type_check
  CHECK (trigger_type IN (
    'new_signup',
    'onboarding_incomplete',
    'starter_upgrade_nudge',
    'paid_at_risk',
    'paid_churned',
    'upgrade_abandoned',
    'activation_no_track',
    'activation_no_tiers',
    'activation_no_subscribers'
  ));

-- 2. Activation Nudge: No Track Uploaded (3 days after onboarding, no first_track_uploaded)

INSERT INTO platform_sequences (id, name, trigger_type, is_active)
VALUES ('a1000000-0000-0000-0000-000000000007', 'Upload First Track', 'activation_no_track', true);

INSERT INTO platform_sequence_steps (sequence_id, step_number, delay_days, subject, body) VALUES
('a1000000-0000-0000-0000-000000000007', 1, 0,
  'Your page is live — now let''s add music, {{first_name}}',
  'Hey {{first_name}},

Your CRWN profile is set up at thecrwn.app/{{artist_slug}} — but it''s empty right now. Fans can''t subscribe to silence.

Upload your first track — it takes under 2 minutes:
→ {{dashboard_url}}?tab=music

Pro tip: Start with your best song. First impressions matter. You can always add more later.

— The CRWN Team'),

('a1000000-0000-0000-0000-000000000007', 2, 3,
  'One track changes everything, {{first_name}}',
  'Hey {{first_name}},

Artists who upload their first track within the first week are 4x more likely to get their first subscriber.

It doesn''t have to be perfect — it just has to exist. A demo, a freestyle, a rough mix. Fans subscribe for access to YOU, not just polished releases.

Upload now: → {{dashboard_url}}?tab=music

If you''re stuck on anything technical (file format, upload issues), just reply — I''ll help.

— Josh, CRWN'),

('a1000000-0000-0000-0000-000000000007', 3, 7,
  'Your fans are looking for you, {{first_name}}',
  'Hey {{first_name}},

Your CRWN page has been live for over a week with no music. Here''s what you''re leaving on the table:

- Fans who visit your page have nothing to listen to
- You can''t create subscription tiers without content
- Every day without music is a day without potential income

I know putting music out feels like a big step. Start small — one track, even unreleased. You can always remove it later.

→ {{dashboard_url}}?tab=music

— The CRWN Team');


-- 3. Activation Nudge: No Tiers Created (2 days after first track, no tiers_created)

INSERT INTO platform_sequences (id, name, trigger_type, is_active)
VALUES ('a1000000-0000-0000-0000-000000000008', 'Create Subscription Tiers', 'activation_no_tiers', true);

INSERT INTO platform_sequence_steps (sequence_id, step_number, delay_days, subject, body) VALUES
('a1000000-0000-0000-0000-000000000008', 1, 0,
  'Your music is live — now let fans subscribe, {{first_name}}',
  'Hey {{first_name}},

Love that you uploaded music to CRWN. But right now, fans can''t subscribe to you because you haven''t created any subscription tiers yet.

Most artists on CRWN use 3 tiers:
- Basic (Free) — access to select exclusive tracks
- Middle ($15/mo) — everything + early releases + community
- Premium ($30/mo) — everything + DMs + behind-the-scenes

Create your tiers here: → {{dashboard_url}}?tab=tiers

It takes about 3 minutes. After that, you''re fully live and earnable.

— The CRWN Team'),

('a1000000-0000-0000-0000-000000000008', 2, 3,
  'Don''t overthink tiers, {{first_name}} — just start',
  'Hey {{first_name}},

Quick tip: your first tier doesn''t have to be perfect. You can always edit the name, price, and benefits later.

The most important thing is having SOMETHING for fans to subscribe to. Start with a free tier and a $15/mo tier and you''re in business.

→ {{dashboard_url}}?tab=tiers

Artists who create tiers within 48 hours of uploading their first track see 2x more subscribers in month one.

— Josh, CRWN');


-- 4. Activation Nudge: No Subscribers (7 days after full setup, no first_subscriber)

INSERT INTO platform_sequences (id, name, trigger_type, is_active)
VALUES ('a1000000-0000-0000-0000-000000000009', 'Get First Subscriber', 'activation_no_subscribers', true);

INSERT INTO platform_sequence_steps (sequence_id, step_number, delay_days, subject, body) VALUES
('a1000000-0000-0000-0000-000000000009', 1, 0,
  'Your page is ready — time to share it, {{first_name}}',
  'Hey {{first_name}},

You''ve done the hard part: music uploaded, tiers created, Stripe connected. Your CRWN page is 100% live and ready to accept subscribers.

Now comes the fun part — getting your first fan.

Here''s what works:
1. Share your CRWN link on Instagram/Twitter bio: thecrwn.app/{{artist_slug}}
2. Post a story/reel teasing exclusive content on CRWN
3. DM 10 of your most engaged fans and offer them first access

Your first subscriber is usually someone who already knows you. Make it easy for them to find you.

— The CRWN Team'),

('a1000000-0000-0000-0000-000000000009', 2, 4,
  'The first subscriber is the hardest, {{first_name}}',
  'Hey {{first_name}},

Every artist on CRWN remembers their first subscriber. It feels unreal seeing someone pay for YOUR music directly.

Here''s a proven playbook:
- Post on social: "I just launched my exclusive music page — first subscribers get [something special]"
- Add thecrwn.app/{{artist_slug}} to your link-in-bio
- Text 5 friends or collaborators and ask them to check it out

One subscriber proves the model works. After that, it''s just scaling.

— Josh, CRWN'),

('a1000000-0000-0000-0000-000000000009', 3, 10,
  'Need help getting fans, {{first_name}}?',
  'Hey {{first_name}},

You''ve been fully set up on CRWN for a couple weeks now — just missing that first subscriber.

If you''re not sure how to drive traffic to your page, here are some ideas:

- Drop an exclusive track ONLY on CRWN, then tease it everywhere else
- Go live on IG/TikTok and mention your CRWN page
- Collaborate with another CRWN artist and cross-promote

If none of this feels right, reply and tell me about your audience. I''ll give you a custom strategy.

Your page: thecrwn.app/{{artist_slug}}

— Josh, CRWN');
