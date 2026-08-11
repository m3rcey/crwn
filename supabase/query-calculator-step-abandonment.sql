-- READ ONLY. Nothing here writes, creates or drops anything. Safe to run any time.
--
-- "Which screen do artists quit on?" for the public calculators.
--
-- The Calculator Conversion Optimization pass (2026-08-11) cut the Opportunity Calculator from 13
-- screens to 8 and the ten two-question loss tools from 3 to 2. `lead_magnet_events` already stores
-- `step` and `total_steps` on every `lead_magnet_step_completed`, so the effect is measurable without
-- building anything: `total_steps` separates the old cohort from the new one automatically.
--
-- The admin dashboard reads `funnel_events`, which has no step dimension, which is why this is a
-- query rather than a screen. If you find yourself running it every week, say so and it becomes one.

-- 1) Reach per screen, per tool, per wizard length. Read DOWN a column: each row is how many people
--    got at least that far. The biggest gap between consecutive rows is the screen that costs most.
select
  tool_slug,
  total_steps,
  step,
  count(*) as reached_this_step,
  count(distinct date_trunc('day', created_at)) as days_seen
from lead_magnet_events
where event_type = 'lead_magnet_step_completed'
  and created_at > now() - interval '60 days'
group by tool_slug, total_steps, step
order by tool_slug, total_steps, step;

-- 2) The headline number this change is judged on: started -> completed, per tool, split by the
--    wizard length the visitor actually saw. `total_steps` is null on the completion event, so the
--    start events carry the cohort and the completions are counted per tool.
select
  tool_slug,
  count(*) filter (where event_type = 'lead_magnet_started') as started,
  count(*) filter (where event_type = 'lead_magnet_result_generated') as completed,
  round(
    100.0 * count(*) filter (where event_type = 'lead_magnet_result_generated')
    / nullif(count(*) filter (where event_type = 'lead_magnet_started'), 0)
  , 1) as completion_pct
from lead_magnet_events
where created_at > now() - interval '60 days'
  and context = 'public'
group by tool_slug
order by started desc;

-- 3) The check that matters more than completion: are the extra completions still QUALIFIED?
--    Walk the canonical spine per calculator. If completion rises here while builder_opened and
--    account_created do not follow, the change bought opt-ins and should be reverted.
select
  calculator,
  count(*) filter (where stage = 'calculator_started') as started,
  count(*) filter (where stage = 'calculator_completed') as completed,
  count(*) filter (where stage = 'builder_opened') as builder,
  count(*) filter (where stage = 'signup_clicked') as signup_clicked,
  count(*) filter (where stage = 'account_created') as accounts,
  count(*) filter (where stage = 'setup_completed') as onboarded,
  count(*) filter (where stage = 'first_paid_conversion') as first_paid
from funnel_events
where created_at > now() - interval '60 days'
group by calculator
order by started desc;

-- 4) How often an artist corrects their answers after seeing the result (the new post-result
--    "change an answer and recalculate" control). Deliberately NOT a funnel stage, so it can never
--    move a ratio above.
select tool_slug, count(*) as recalculations
from lead_magnet_events
where event_type = 'opportunity_estimate_recalculated'
  and created_at > now() - interval '60 days'
group by tool_slug
order by recalculations desc;
