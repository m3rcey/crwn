-- Seed Platform Sequences — CRWN → Artist automated emails
-- Run AFTER schema-phase2-platform-crm.sql

-- ─── 1. New Signup (no artist profile yet) ───────────────────────────────────

INSERT INTO platform_sequences (id, name, trigger_type, is_active)
VALUES ('a1000000-0000-0000-0000-000000000001', 'New Signup Welcome', 'new_signup', true);

INSERT INTO platform_sequence_steps (sequence_id, step_number, delay_days, subject, body) VALUES
('a1000000-0000-0000-0000-000000000001', 1, 0,
  'Welcome to CRWN, {{first_name}}',
  'Hey {{first_name}},

Welcome to CRWN — glad you''re here.

CRWN is where independent artists build real income from their music. Subscriptions, digital products, exclusive drops — all in one place, with fans who actually pay.

Your next step: set up your artist profile. It takes about 2 minutes.

→ {{dashboard_url}}

Once your profile is live, you can start uploading music and building your subscriber base.

— The CRWN Team'),

('a1000000-0000-0000-0000-000000000001', 2, 2,
  'Quick question, {{first_name}}',
  'Hey {{first_name}},

Noticed you signed up but haven''t created your artist profile yet.

Is something holding you back? Just reply to this email — I read every one.

If you''re ready to get started, it only takes 2 minutes:
→ {{dashboard_url}}

— Josh, CRWN'),

('a1000000-0000-0000-0000-000000000001', 3, 5,
  'Artists on CRWN are earning — here''s how',
  'Hey {{first_name}},

Just wanted to share — artists on CRWN are building real recurring income from fans who subscribe to their music.

Here''s what they do:
1. Upload exclusive tracks and set tier access
2. Create subscription tiers (Free, $15, $30/mo)
3. Share their CRWN page with their audience

No algorithms. No middlemen. Direct fan-to-artist revenue.

Ready to start? → {{dashboard_url}}

— The CRWN Team');

-- ─── 2. Onboarding Incomplete (profile exists, no Stripe) ───────────────────

INSERT INTO platform_sequences (id, name, trigger_type, is_active)
VALUES ('a1000000-0000-0000-0000-000000000002', 'Connect Stripe Reminder', 'onboarding_incomplete', true);

INSERT INTO platform_sequence_steps (sequence_id, step_number, delay_days, subject, body) VALUES
('a1000000-0000-0000-0000-000000000002', 1, 1,
  'One step left, {{first_name}} — connect Stripe to get paid',
  'Hey {{first_name}},

Your CRWN profile is looking great. There''s just one thing left before fans can subscribe and buy from you: connecting Stripe.

Stripe handles all payments securely — you''ll get paid directly to your bank account. CRWN never touches your money.

Connect now (takes 3 minutes): → {{connect_stripe_url}}

Once connected, you''re live and ready to earn.

— The CRWN Team'),

('a1000000-0000-0000-0000-000000000002', 2, 4,
  'You''re so close, {{first_name}}',
  'Hey {{first_name}},

Your CRWN page is set up at thecrwn.app/{{artist_slug}} — but fans can''t subscribe yet because Stripe isn''t connected.

I know payment setup can feel like a hassle, but it''s just a few clicks:
→ {{connect_stripe_url}}

Once you''re connected, you can start sharing your page and earning from day one. No minimum fans required.

If you''re stuck on anything, just reply — I''ll help you through it.

— Josh, CRWN'),

('a1000000-0000-0000-0000-000000000002', 3, 10,
  'Final reminder — your CRWN page is waiting',
  'Hey {{first_name}},

This is my last nudge — your CRWN profile exists but you can''t accept payments until Stripe is connected.

→ {{connect_stripe_url}}

If CRWN isn''t the right fit right now, no hard feelings. But if you ever want to start earning directly from fans, everything is ready and waiting for you.

— The CRWN Team');

-- ─── 3. Starter Upgrade Nudge (free tier with activity) ─────────────────────

INSERT INTO platform_sequences (id, name, trigger_type, is_active)
VALUES ('a1000000-0000-0000-0000-000000000003', 'Starter to Pro Upgrade', 'starter_upgrade_nudge', true);

INSERT INTO platform_sequence_steps (sequence_id, step_number, delay_days, subject, body) VALUES
('a1000000-0000-0000-0000-000000000003', 1, 0,
  '{{first_name}}, you''re ready for Pro',
  'Hey {{first_name}},

You''ve been putting in work on CRWN — uploading tracks, building your audience, making sales. That''s exactly what Pro artists do.

On the Starter plan, CRWN takes an 8% platform fee. With Pro ($50/mo), you get:
- Email campaigns to your fans (2/week)
- SMS marketing
- Discount codes for promotions
- Same 8% fee — but way more tools to grow

Most artists make back the $50 in the first week from one extra subscriber.

→ {{upgrade_url}}

— The CRWN Team'),

('a1000000-0000-0000-0000-000000000003', 2, 7,
  'Pro artists earn 3x more — here''s why',
  'Hey {{first_name}},

We looked at the data: Pro artists on CRWN earn 3x more than Starter artists on average.

Why? Because they can:
- Send email campaigns that bring fans back
- Run SMS blasts for new drops
- Create discount codes that drive purchases
- Set up automated sequences (welcome, win-back, upsell)

All of this is locked on Starter. Upgrade takes 30 seconds:
→ {{upgrade_url}}

— The CRWN Team');

-- ─── 4. Paid At Risk (inactive 14+ days) ────────────────────────────────────

INSERT INTO platform_sequences (id, name, trigger_type, is_active)
VALUES ('a1000000-0000-0000-0000-000000000004', 'Paid Artist Re-engagement', 'paid_at_risk', true);

INSERT INTO platform_sequence_steps (sequence_id, step_number, delay_days, subject, body) VALUES
('a1000000-0000-0000-0000-000000000004', 1, 0,
  'We miss you, {{first_name}}',
  'Hey {{first_name}},

Noticed you haven''t been on CRWN in a while. Just wanted to check in — everything good?

Your subscribers are still active and waiting for new content. Even a quick community post or a new track keeps them engaged and reduces churn.

→ {{dashboard_url}}

If something about the platform isn''t working for you, just reply. I want to make sure CRWN is earning its keep.

— Josh, CRWN'),

('a1000000-0000-0000-0000-000000000004', 2, 5,
  'Your fans are waiting, {{first_name}}',
  'Hey {{first_name}},

Quick heads up — when artists go quiet for more than 2 weeks, subscriber churn goes up 40%.

Your fans subscribed because they want to hear from you. A new track, a behind-the-scenes post, even a quick update keeps them locked in.

Log in and drop something: → {{dashboard_url}}

— The CRWN Team'),

('a1000000-0000-0000-0000-000000000004', 3, 10,
  'Can we help, {{first_name}}?',
  'Hey {{first_name}},

This is my last check-in. If you''re busy making music, that''s great — just wanted to make sure you haven''t hit a wall with the platform.

If there''s anything we can improve, reply to this email. Every piece of feedback matters.

Your dashboard: → {{dashboard_url}}

— Josh, CRWN');

-- ─── 5. Paid Churned (canceled subscription — win-back) ─────────────────────

INSERT INTO platform_sequences (id, name, trigger_type, is_active)
VALUES ('a1000000-0000-0000-0000-000000000005', 'Platform Win-Back', 'paid_churned', true);

INSERT INTO platform_sequence_steps (sequence_id, step_number, delay_days, subject, body) VALUES
('a1000000-0000-0000-0000-000000000005', 1, 1,
  'Sorry to see you go, {{first_name}}',
  'Hey {{first_name}},

We saw that you canceled your CRWN {{platform_tier}} plan. No hard feelings — but I''d love to understand why.

Was it the price? A missing feature? Just not the right time?

Reply to this email with a one-line answer and I''ll personally read it. We''re building CRWN for artists like you, and your feedback is the most valuable thing we can get.

Your account is still active on the Starter plan — your existing subscribers and content aren''t going anywhere.

— Josh, CRWN'),

('a1000000-0000-0000-0000-000000000005', 2, 7,
  'What you''re missing on {{platform_tier}}, {{first_name}}',
  'Hey {{first_name}},

Since downgrading, you no longer have access to:
- Email campaigns to your fans
- SMS marketing
- Discount codes
- Automated email sequences

These tools are how top artists on CRWN turn casual fans into paying subscribers. If the timing is better now, you can re-upgrade instantly:

→ {{upgrade_url}}

— The CRWN Team'),

('a1000000-0000-0000-0000-000000000005', 3, 21,
  'Door''s always open, {{first_name}}',
  'Hey {{first_name}},

This is my last email about your plan change. Just want you to know — whenever you''re ready to come back to {{platform_tier}}, everything will be right where you left it.

Your fans, your music, your profile — all still live.

→ {{upgrade_url}}

Hope to see you back.

— The CRWN Team');

-- ─── 6. Upgrade Abandoned (started checkout, didn't finish) ─────────────────

INSERT INTO platform_sequences (id, name, trigger_type, is_active)
VALUES ('a1000000-0000-0000-0000-000000000006', 'Upgrade Cart Recovery', 'upgrade_abandoned', true);

INSERT INTO platform_sequence_steps (sequence_id, step_number, delay_days, subject, body) VALUES
('a1000000-0000-0000-0000-000000000006', 1, 0,
  'You were so close, {{first_name}}',
  'Hey {{first_name}},

Looks like you started upgrading your CRWN plan but didn''t finish checkout.

No worries — your spot is still open. Pick up where you left off:
→ {{upgrade_url}}

If you ran into an issue with payment, just reply and I''ll help sort it out.

— The CRWN Team'),

('a1000000-0000-0000-0000-000000000006', 2, 2,
  'Still thinking it over?',
  'Hey {{first_name}},

Upgrading unlocks email campaigns, SMS, discount codes, and automated sequences — the tools that separate artists who earn from artists who don''t.

Most artists make back the cost in the first week from one extra subscriber.

→ {{upgrade_url}}

If you have questions about what''s included, just reply.

— The CRWN Team');
