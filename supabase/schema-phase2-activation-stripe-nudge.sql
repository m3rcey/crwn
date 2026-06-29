-- Activation Nudge: No Stripe Connected
-- Fires 1 day after tiers_created if stripe_connected milestone is missing.
-- Run in Supabase SQL Editor AFTER schema-phase2-activation-nudges.sql

-- 1. Expand trigger_type constraint to include new nudge
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
    'activation_no_stripe',
    'activation_no_subscribers'
  ));

-- 2. Sequence: Connect Stripe (fires after tiers created, Stripe still missing)

INSERT INTO platform_sequences (id, name, trigger_type, is_active)
VALUES ('a1000000-0000-0000-0000-00000000000a', 'Connect Stripe After Tiers', 'activation_no_stripe', true);

INSERT INTO platform_sequence_steps (sequence_id, step_number, delay_days, subject, body) VALUES
('a1000000-0000-0000-0000-00000000000a', 1, 0,
  'Your tiers are live — one step to start getting paid, {{first_name}}',
  'Hey {{first_name}},

You''ve uploaded music and built out your subscription tiers. That''s the hard part.

Now there''s one step left before fans can actually subscribe: connecting Stripe.

Stripe is how the money reaches your bank account. CRWN never holds your funds — Stripe sends payments directly to you.

Connect now (takes about 3 minutes):
→ {{connect_stripe_url}}

You''ll need: a government ID, your bank account details, and an SSN or EIN. That''s it.

— The CRWN Team'),

('a1000000-0000-0000-0000-00000000000a', 2, 3,
  'Your tiers have no way to collect money yet, {{first_name}}',
  'Hey {{first_name}},

Your subscription tiers look great — but right now, if a fan tries to subscribe, the checkout won''t work because Stripe isn''t connected.

Every day without Stripe is a day you could''ve been earning.

Here''s exactly what happens when you connect:
1. Stripe verifies your identity (one time, takes ~3 min)
2. Your CRWN page goes fully live
3. Fans can subscribe and buy from you immediately
4. Payouts hit your bank on a weekly schedule

→ {{connect_stripe_url}}

If you hit any issues during setup, just reply — I''ll walk you through it.

— Josh, CRWN'),

('a1000000-0000-0000-0000-00000000000a', 3, 7,
  'Last nudge — your CRWN page can''t earn without Stripe, {{first_name}}',
  'Hey {{first_name}},

You''ve put real work into your CRWN setup. Your music is uploaded. Your tiers are priced. Fans can find your page at thecrwn.app/{{artist_slug}}.

The only thing stopping you from earning is connecting Stripe. I won''t keep emailing you about it — but I''d hate for you to leave money on the table because of one missing step.

→ {{connect_stripe_url}}

If you''re worried about something specific (privacy, fees, payout timing), just reply and I''ll answer directly.

— The CRWN Team');
