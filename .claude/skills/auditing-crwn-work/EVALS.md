# Evaluations

Scenarios for checking that this skill behaves correctly. Each has an input, the behavior that
passes, and the specific failures to watch for. Run one by pasting the input into a fresh
conversation and comparing the response against the pass criteria.

These test **behavior**, not wording. A response that reaches the right decisions by a different
route passes.

---

## Eval 1. Premature feature expansion

**Input**

> Audit these for CRWN:
> 1. Build a mobile app so artists can upload from their phone.
> 2. Add a public API so other tools can read fan data.
> 3. Add multi-language support to the artist page.
> 4. Build an analytics dashboard showing 30/60/90 day cohorts per artist.

**Passes when**

- The stage is derived from current evidence before any item is judged.
- At most a small number of single questions are asked, one per message.
- Most items land on SHOULD NOT DO NOW, with a concrete revisit trigger each.
- Item 4 is examined against the analytics surfaces that already exist, not treated as new.
- Cohort analysis is challenged on sample size, not on effort.

**Fails when**

- Any item is called a bad idea rather than not now.
- A revisit trigger is vague ("when we have more artists") instead of a stated threshold or event.
- The response recommends building a smaller mobile app rather than questioning the requirement.

---

## Eval 2. Core funnel blocker versus nice-to-haves

**Input**

> 1. Two artists told me the Stripe connect step in setup left them stuck and they never finished.
> 2. Change the gold on the artist page to a slightly warmer gold.
> 3. Add hover animations to the Studio tiles.
> 4. Write three more blog posts.
> 5. Rename "Rise Mode" to something clearer.

**Passes when**

- Item 1 rises to the top and the response verifies the claim against the setup wizard code before
  ruling, rather than accepting the report at face value.
- Items 2 and 3 land on SHOULD NOT DO NOW.
- Item 5 is checked against the frozen-identifier rules before any rename is entertained, and the
  cost of renaming a concept referenced across surfaces is named.
- Priority Order contains item 1 and little else.

**Fails when**

- Polish items are given equal weight because they are quick.
- A rename is recommended without checking what is keyed to the current name.
- The setup claim is treated as established fact without looking at the code.

---

## Eval 3. Premature automation

**Input**

> I onboarded one artist by hand last week. I want to build an automated onboarding concierge that
> emails them a personalized 30-day plan, assigns tasks, and follows up if they stall.

**Passes when**

- The requirement is questioned before the design is discussed.
- The one-run sample is named explicitly as the reason automation fails condition 2 of Automate
  Last.
- The recommendation is to keep doing it manually, or to use an existing primitive, for a stated
  number of further runs.
- The response names what the manual runs should record so the eventual automation is built from
  observation rather than imagination.

**Fails when**

- A smaller version of the automation is designed instead of deferring it.
- The response builds or drafts the emails.
- "Automate last" is quoted without connecting it to the sample size.

---

## Eval 4. Security and money work that looks unused

**Input**

> Cleanup list. All of these look dead:
> 1. The onboarding health canary cron. It has never found anything.
> 2. The webhook livemode check. It has never fired in production.
> 3. The entitlement view that redacts audio URLs. Every track we have is free anyway.
> 4. The architecture drift test suite. It just slows down my commits.

**Passes when**

- None of the four is recommended for deletion casually.
- The response investigates coupling and failure history in the repo rather than reasoning from the
  founder's framing.
- It states plainly that a safety control's value is that nothing happens, so low firing rate is
  not the deletion test.
- Item 4 gets a real answer about cost, and if any speed complaint is legitimate, it is addressed
  without weakening the gate.

**Fails when**

- Any of the four is hidden, flagged off, or deleted at any reversibility level without proving an
  equally safe canonical control remains.
- The response agrees they look dead and defers the decision to the founder instead of
  investigating.

---

## Eval 5. Existing product complexity

**Input**

> I have Missions, Fan Squads, Clip Bounties, City Unlocks, Road To campaigns, Proof of Demand and
> Fan Drives. Fans do not use any of them. What do I do?

**Passes when**

- Repository ownership is inspected rather than judged from the names.
- The duplication is identified: several surfaces answering the same question.
- One canonical survivor is chosen and defended.
- Each recommendation names its reversibility level, and hide is preferred where it removes the
  attention cost.
- Anything that another live surface depends on is caught before it is cut.

**Fails when**

- A rewrite or consolidation project is recommended. Nobody asked for better architecture.
- "Delete" appears without a level.
- All seven are kept because each individually sounds strategic.

---

## Eval 6. One question at a time

**Input**

> Here are some things I might work on: improve onboarding, do something about churn, make the
> homepage better, and maybe partnerships.

**Passes when**

- The first response contains no recommendations and no table.
- The first response contains **exactly one** question addressed to the founder.
- The second response contains either exactly one further question or the final audit, never a
  questionnaire.
- The question chosen is high in the priority order, most likely about the current goal or which
  of the four is grounded in an observed problem.

**Fails when**

- Two or more questions appear in one message, including as sub-bullets or a parenthetical.
- A question message also previews a verdict.
- Clarification is skipped and four vague items are audited as though they were specified.

---

## Eval 7. Stage change

**Input**

Simulate a future state in which the Brain and the repository show the first-paid-member loop has
been proven across several artists and the bottleneck has moved to retention.

> Given where CRWN is now, audit these: 1. more acquisition calculators, 2. a churn-prediction
> signal, 3. a win-back email sequence, 4. a founder-call booking flow.

**Passes when**

- The stage is re-derived from the evidence, and the response states that the bottleneck has moved.
- Acquisition work is no longer automatically top priority.
- Retention items are evaluated on their merits at the new stage, including whether the sample
  supports a prediction model yet.
- No recommendation is inherited from the previous stage's logic.

**Fails when**

- The response optimizes for first paid member anyway.
- The stage section repeats a pre-product-market-fit description that the evidence no longer
  supports.
- The stage change is noticed but does not change a single decision.

---

## Cross-cutting checks

Apply to every eval:

- Every submitted item appears in the final table, exactly once.
- No file was edited and no audited item was implemented.
- Every repo path in the output is a markdown link.
- No em dashes in the output.
- Every `Why` connects to CRWN's current reality, not to a principle in the abstract.
- Every deferred item worth revisiting has a testable trigger.
- No number is quoted as current without a date or a fresh read.
