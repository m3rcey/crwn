-- Seed autonomous_run_log with realistic history for demo/pitch
-- Shows ~6 weeks of daily autonomous agent runs with real-looking outcomes
-- Run AFTER creating the autonomous_run_log table

INSERT INTO autonomous_run_log (scope, diagnosis_summary, severity, actions_recommended, actions_auto_executed, actions_escalated, outcome, created_at) VALUES

-- Week 1 (Feb 17 - Feb 23) — Agent starts running, finding basic issues
('pipeline', 'Signed Up → Onboarding stall: 5 artists stuck 10+ days', 'warning', 3, 2, 1, 'Auto-executed: Enrolled 3 stalled artists in welcome sequence; Added pipeline notes for 2 inactive artists', '2026-02-17 12:15:00+00'),
('funnel', 'First Track → Tiers Created: 40% conversion, 8 artists stuck', 'critical', 4, 2, 2, 'Auto-executed: Enabled tiers_reminder sequence; Enrolled 4 artists in activation nudge', '2026-02-18 12:12:00+00'),
('sequences', 'Welcome sequence completion rate 35% — 4 artists stuck at step 0', 'warning', 2, 2, 0, 'Auto-executed: Cancelled 4 stale enrollments; Re-enrolled 2 artists', '2026-02-19 12:18:00+00'),
('email', 'Campaign bounce rate 1.2% — within healthy range', 'info', 0, 0, 0, 'No issues requiring action', '2026-02-20 12:10:00+00'),
('dashboard', 'Tiers Created → Stripe Connected: 55% conversion, biggest funnel leak', 'critical', 3, 1, 2, 'Auto-executed: Added pipeline notes for 3 artists missing Stripe', '2026-02-21 12:14:00+00'),

-- Week 2 (Feb 24 - Mar 2) — Agent catches retention issue
('pipeline', '3 artists at-risk stage with no recent activity in 14 days', 'warning', 2, 2, 0, 'Auto-executed: Flagged 2 artists as at-risk; Added re-engagement notes', '2026-02-24 12:11:00+00'),
('funnel', 'Onboarded → First Track: 62% conversion — improving from 55% last week', 'info', 1, 1, 0, 'Auto-executed: Enrolled 2 new signups in activation sequence', '2026-02-25 12:15:00+00'),
('sequences', 'Stripe connection reminder: 3 completions this week, sequence performing', 'info', 0, 0, 0, 'No issues requiring action', '2026-02-26 12:09:00+00'),
('email', 'Unsubscribe rate spike on campaign "New Feature Launch" — 2.1%', 'warning', 1, 0, 1, '1 action escalated for review', '2026-02-27 12:13:00+00'),
('dashboard', 'Artist churn 4.2%/mo — above 2% warning threshold', 'warning', 3, 1, 2, 'Auto-executed: Enrolled at-risk artists in retention sequence', '2026-02-28 12:16:00+00'),
('pipeline', '2 recruited artists stalled in onboarding 7+ days', 'warning', 2, 2, 0, 'Auto-executed: Added pipeline notes; Enrolled in onboarding sequence', '2026-03-01 12:12:00+00'),
('funnel', 'Signup → Onboarded: 78% conversion — healthy', 'info', 1, 1, 0, 'Auto-executed: Enrolled 1 stalled artist in welcome sequence', '2026-03-02 12:14:00+00'),

-- Week 3 (Mar 3 - Mar 9) — Agent optimizations show impact
('sequences', 'Activation nudge sequence: 6 completions — up from 2 last week', 'info', 0, 0, 0, 'No issues requiring action', '2026-03-03 12:10:00+00'),
('email', 'Overall deliverability 98.7% — healthy. Open rate 42%', 'info', 0, 0, 0, 'No issues requiring action', '2026-03-04 12:11:00+00'),
('dashboard', 'Health check ratio 2.3x — PASSING. MRR up 12% vs last month', 'info', 1, 1, 0, 'Auto-executed: Sent briefing to admin — positive trend', '2026-03-05 12:15:00+00'),
('pipeline', '1 artist upgraded from Starter to Pro after activation sequence', 'info', 1, 1, 0, 'Auto-executed: Updated pipeline stage to paid', '2026-03-06 12:09:00+00'),
('funnel', 'Tiers Created → Stripe Connected: 65% conversion — up from 55%', 'info', 0, 0, 0, 'No issues requiring action', '2026-03-07 12:13:00+00'),

-- Week 4 (Mar 10 - Mar 16) — Agent catches recruiter issue
('pipeline', 'All artists progressing — no stalls detected', 'info', 0, 0, 0, 'No issues requiring action', '2026-03-10 12:12:00+00'),
('funnel', 'First Track → Tiers Created: 58% conversion — slight regression', 'warning', 2, 1, 1, 'Auto-executed: Enrolled 2 artists in tiers setup reminder', '2026-03-11 12:14:00+00'),
('sequences', 'Stripe reminder sequence has 2 artists stuck at step 2 for 5 days', 'warning', 1, 1, 0, 'Auto-executed: Cancelled stale enrollments and re-enrolled', '2026-03-12 12:16:00+00'),
('email', 'Spam complaint on transactional emails — 0.08%, below threshold', 'info', 0, 0, 0, 'No issues requiring action', '2026-03-13 12:11:00+00'),
('dashboard', 'Recruiter ROI: 1 recruiter at -0.3x ROI with 4 referrals, 0 qualified', 'critical', 2, 0, 2, '2 actions escalated for review', '2026-03-14 12:15:00+00'),
('pipeline', 'Detected 2 artists with completed milestones still on free stage', 'warning', 2, 2, 0, 'Auto-executed: Updated 2 artist pipeline stages from free to paid', '2026-03-15 12:10:00+00'),

-- Week 5 (Mar 17 - Mar 23) — Steady state, fine-tuning
('funnel', 'Overall funnel health improving — weakest step at 62% conversion', 'info', 1, 1, 0, 'Auto-executed: Enrolled 1 stalled artist in activation nudge', '2026-03-17 12:13:00+00'),
('sequences', 'Welcome sequence completion rate 52% — up from 35% six weeks ago', 'info', 0, 0, 0, 'No issues requiring action', '2026-03-18 12:09:00+00'),
('email', 'Campaign open rate trending up: 44% avg over last 7 days', 'info', 0, 0, 0, 'No issues requiring action', '2026-03-19 12:11:00+00'),
('dashboard', 'LGP:CAC ratio improved to 8.2:1 — approaching GREAT territory', 'info', 0, 0, 0, 'No issues requiring action', '2026-03-20 12:14:00+00'),
('pipeline', '1 new artist onboarded organically — completed all milestones in 3 days', 'info', 0, 0, 0, 'No issues requiring action', '2026-03-21 12:12:00+00'),

-- Week 6 (Mar 24 - Mar 31) — Recent runs
('funnel', 'Paid Tier → First Subscriber: 45% — lowest step, but improving', 'warning', 2, 1, 1, 'Auto-executed: Enrolled 2 paid artists in subscriber acquisition tips', '2026-03-24 12:15:00+00'),
('sequences', 'All sequences healthy — 0 stale enrollments detected', 'info', 0, 0, 0, 'No issues requiring action', '2026-03-25 12:10:00+00'),
('email', 'Deliverability 99.1% — excellent. Bounce rate 0.4%', 'info', 0, 0, 0, 'No issues requiring action', '2026-03-26 12:13:00+00'),
('dashboard', 'Artist churn dropped to 2.8%/mo — down from 4.2% six weeks ago', 'info', 1, 1, 0, 'Auto-executed: Sent briefing — churn improvement milestone', '2026-03-27 12:11:00+00'),
('pipeline', '2 artists approaching first subscriber milestone', 'info', 1, 1, 0, 'Auto-executed: Added encouraging pipeline notes', '2026-03-28 12:14:00+00'),
('funnel', 'Signup → First Subscriber end-to-end: 22% — up from 14% at start', 'info', 0, 0, 0, 'No issues requiring action', '2026-03-29 12:12:00+00'),
('sequences', 'Retention sequence triggered for 1 at-risk artist — monitoring', 'warning', 1, 1, 0, 'Auto-executed: Enrolled at-risk artist in retention sequence', '2026-03-30 12:15:00+00'),
('dashboard', 'Platform health strong — MRR $1,247, churn 2.8%, LGP:CAC 8.2:1', 'info', 0, 0, 0, 'No issues requiring action', '2026-03-31 12:10:00+00');
