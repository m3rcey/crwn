---
name: auditing-crwn-work
description: Audit a list of proposed CRWN work (features, fixes, ideas, automations, marketing, ops) and decide what to do now, what to simplify, what to defer, and what to hide or delete, using Jon McNeill's Algorithm against CRWN's CURRENT stage and repository reality. Use when the founder submits several candidate pieces of work or asks what to prioritize, what to focus on next, what to stop doing, whether to build or automate something, or whether they are doing too much. Not for implementing the work, and not for ordinary how-does-X-work questions.
allowed-tools: Read, Grep, Glob, Bash, AskUserQuestion, TodoWrite
---

# CRWN Work Auditor

Decide what deserves founder attention right now. This skill produces a **decision**, never an
implementation.

## When this skill applies

Triggers: "here are the things I want to work on, what should I do", "audit this task list",
"should I build these", "which of these should I delete", "what should I focus on next", "I have
five ideas for CRWN", "use the Algorithm on this", "question, delete, simplify this list", "am I
doing too much", "prioritize my CRWN work", "should this be automated", "what should I stop doing".

It applies across product, engineering, marketing, sales, acquisition, content, operations, founder
workflow, automation, and customer experience.

It does **not** apply to: a single unambiguous build request, a bug report, a question about how an
existing CRWN system works, or a request to implement something already decided.

## Hard rule: an audit changes nothing

While this skill is active you may read the repo, grep it, read the Brain, and run **read-only**
commands (`npm test`, `npm run verify:architecture`, `npm run verify:flags`,
`npm run verify:migrations`, `git log`, anon-key curls). You may not edit files, write migrations,
change flags, push, or start building an audited item. If the founder wants an item built, that is
a separate request made after the audit.

The one exception is the founder's own list: if [TODO.md](../../../TODO.md) needs a line because
the audit created founder-only work, say so in the output and ask. Do not edit it mid-audit.

---

## Phase 0. Ingest

Capture every submitted item verbatim into a working list. Do not drop, merge, reinterpret, or
rewrite an item. Merge two items only when they are literally the same request said twice, and say
so. Every ingested item must appear in the final audit table, including the ones that turn out to
be trivial.

Give no verdicts yet, not even a preview like "that one's obviously a yes".

## Phase 1. Establish reality before asking anything

Read before you ask. A question whose answer sits in the repo is a wasted turn.

### Source hierarchy (highest wins)

1. **The current repository.** What the code actually does. This outranks every document.
2. **Ratified founder instructions and the current Brain** for product strategy:
   [CLAUDE.md](../../../CLAUDE.md), [docs/crwn-brain/](../../../docs/crwn-brain/),
   [docs/POSITIONING.md](../../../docs/POSITIONING.md).
3. **Ratified architecture invariants:**
   [src/lib/architecture/invariants.ts](../../../src/lib/architecture/invariants.ts) and
   [src/lib/architecture/exceptions.ts](../../../src/lib/architecture/exceptions.ts).
4. **Verified production evidence** when materially relevant (`npm run verify:flags`,
   `npm run verify:migrations`, an anon-key probe, a live count).
5. **Inferred material as supporting evidence only.**
   [docs/crwn-brain/14-ROADMAP-INFERRED.md](../../../docs/crwn-brain/14-ROADMAP-INFERRED.md) and
   any other inferred artifact may never overrule a newer founder decision, a current Brain doc,
   the repository, or production.

When two sources disagree, **investigate the disagreement**. Do not silently pick the one that
supports the proposed task. A conflict is itself a finding, and sometimes it is the answer.

Four states are never collapsed: a migration file exists / it is applied in production / the flag
state / the feature is actually reachable. "The file is in the repo" proves only the first.

### Always read

- [docs/crwn-brain/00-START-HERE.md](../../../docs/crwn-brain/00-START-HERE.md)
- [docs/crwn-brain/CRWN-BRAIN-QUICK-CONTEXT.md](../../../docs/crwn-brain/CRWN-BRAIN-QUICK-CONTEXT.md)
- [docs/crwn-brain/13-CURRENT-STATE.md](../../../docs/crwn-brain/13-CURRENT-STATE.md)
- [docs/crwn-brain/23-ZERO-TO-ONE-STRATEGY.md](../../../docs/crwn-brain/23-ZERO-TO-ONE-STRATEGY.md)
- [docs/crwn-brain/29-COMPLETE-FEATURE-INVENTORY.md](../../../docs/crwn-brain/29-COMPLETE-FEATURE-INVENTORY.md) (sections 0, 12, 13, 14 at minimum)
- [docs/POSITIONING.md](../../../docs/POSITIONING.md)
- [docs/crwn-brain/17-OPEN-QUESTIONS.md](../../../docs/crwn-brain/17-OPEN-QUESTIONS.md)
- [docs/crwn-brain/26-PRODUCT-DRIFT-PREVENTION.md](../../../docs/crwn-brain/26-PRODUCT-DRIFT-PREVENTION.md)
- [docs/crwn-brain/15-AI-AGENT-INSTRUCTIONS.md](../../../docs/crwn-brain/15-AI-AGENT-INSTRUCTIONS.md)
- The most recent dated sections of [docs/crwn-brain/CHANGELOG.md](../../../docs/crwn-brain/CHANGELOG.md) (this is where a stage change shows up first)
- [src/lib/architecture/invariants.ts](../../../src/lib/architecture/invariants.ts) and [src/lib/architecture/exceptions.ts](../../../src/lib/architecture/exceptions.ts)

Every fact in those files carries a date. Facts age. Re-read counts and flag states rather than
quoting a number a document wrote months ago, and say when a number is a dated snapshot.

### Read by domain, when an item touches it

| The item touches | Also read |
|---|---|
| money, pricing, fees, payouts | [07-BUSINESS-RULES.md](../../../docs/crwn-brain/07-BUSINESS-RULES.md), [10-INTEGRATIONS.md](../../../docs/crwn-brain/10-INTEGRATIONS.md), [src/lib/platformTier.ts](../../../src/lib/platformTier.ts), [src/lib/stripe/](../../../src/lib/stripe/) |
| acquisition, funnel, copy | [docs/ICP.md](../../../docs/ICP.md), [docs/POSITIONING.md](../../../docs/POSITIONING.md), [src/lib/leadMagnets/registry.ts](../../../src/lib/leadMagnets/registry.ts), [src/lib/analytics/campaignAttribution.ts](../../../src/lib/analytics/campaignAttribution.ts) |
| onboarding, setup | [19-ONBOARDING-FLOW.md](../../../docs/crwn-brain/19-ONBOARDING-FLOW.md), [docs/ARTIST_LAUNCH_WIZARD.md](../../../docs/ARTIST_LAUNCH_WIZARD.md), [src/hooks/useArtistSetup.ts](../../../src/hooks/useArtistSetup.ts) |
| Rise Mode, quests, recommendations | [docs/RISE_MODE_ZERO_TO_HERO_BLUEPRINT.md](../../../docs/RISE_MODE_ZERO_TO_HERO_BLUEPRINT.md), [24-RECOMMENDATION-OUTCOME-LINKAGE.md](../../../docs/crwn-brain/24-RECOMMENDATION-OUTCOME-LINKAGE.md), [src/lib/constraint/engine.ts](../../../src/lib/constraint/engine.ts) |
| virality, campaigns, referrals | [22-VIRALITY-ENGINE-ARCHITECTURE.md](../../../docs/crwn-brain/22-VIRALITY-ENGINE-ARCHITECTURE.md), [25-POST-WIN-REFERRAL.md](../../../docs/crwn-brain/25-POST-WIN-REFERRAL.md) |
| Team Splits | [28-TEAM-SPLIT-FUNDING-ARCHITECTURE.md](../../../docs/crwn-brain/28-TEAM-SPLIT-FUNDING-ARCHITECTURE.md), [src/lib/teamSplits/funding.ts](../../../src/lib/teamSplits/funding.ts) |
| security, auth, permissions | [11-SECURITY-AND-PRIVACY.md](../../../docs/crwn-brain/11-SECURITY-AND-PRIVACY.md), [03-USER-ROLES-AND-PERMISSIONS.md](../../../docs/crwn-brain/03-USER-ROLES-AND-PERMISSIONS.md), [src/lib/architecture/security.test.ts](../../../src/lib/architecture/security.test.ts) |
| email, lifecycle sends | [30-EMAIL-SYSTEM.md](../../../docs/crwn-brain/30-EMAIL-SYSTEM.md), [vercel.json](../../../vercel.json) |
| measurement, activation, the money model | [21-MONEY-MODEL-MEASUREMENT.md](../../../docs/crwn-brain/21-MONEY-MODEL-MEASUREMENT.md), [20-FIRST-REVENUE-LAUNCH-OFFER.md](../../../docs/crwn-brain/20-FIRST-REVENUE-LAUNCH-OFFER.md) |
| renaming anything (a tier, slug, keyword, funnel stage, feature, route) | [src/lib/architecture/identifiers.test.ts](../../../src/lib/architecture/identifiers.test.ts) and the frozen-identifier entries in [invariants.ts](../../../src/lib/architecture/invariants.ts). Many names are load-bearing in sent emails, stored rows, and third-party triggers, so a rename is an irreversible-side move even when it looks cosmetic |
| cutting an EXISTING surface | [29-COMPLETE-FEATURE-INVENTORY.md](../../../docs/crwn-brain/29-COMPLETE-FEATURE-INVENTORY.md) sections 12, 13, 14, and [docs/DELETE_REVIEW_PROMPT.md](../../../docs/DELETE_REVIEW_PROMPT.md) if the founder wants a whole-inventory cut review instead of an audit of a list |

Read what the items require. Do not read all of it every time.

## Phase 2. Derive the current stage, every time

CRWN's stage is **never** hardcoded in this skill. Re-derive it from the evidence on every run, and
answer these seven questions before judging any item:

1. What outcome is CRWN optimizing for right now?
2. What is the present bottleneck?
3. What measurable event would prove CRWN has exited this stage?
4. What has already been proven?
5. What remains unproven?
6. What is the scarce resource right now?
7. Which systems are core at this stage, and which are premature?

Prefer an explicit founder-ratified goal over an inferred one. The gates in the expansion-path
table of [23-ZERO-TO-ONE-STRATEGY.md](../../../docs/crwn-brain/23-ZERO-TO-ONE-STRATEGY.md) and the
activation definition in
[20-FIRST-REVENUE-LAUNCH-OFFER.md](../../../docs/crwn-brain/20-FIRST-REVENUE-LAUNCH-OFFER.md) are
ratified statements, so they outrank a stage you infer from commit activity.

**If the stage or its exit condition cannot be established confidently, that is the first founder
question.** Ask only that one, and wait.

Watch for stage change. If the evidence shows the previously blocking loop is now proven, the
bottleneck has moved and the whole audit changes. Say so explicitly rather than continuing to
optimize the old goal.

## Phase 3. Find the decision-changing unknowns

For each unknown, ask yourself one thing:

> Could a different answer materially change whether this item is DO NOW, SIMPLIFY, NOT NOW, or
> DELETE?

If no, do not ask it. Note the assumption in the output instead. Cosmetic, preference, and
nice-to-know questions are never asked.

**If nothing material is missing, say so in one line and go straight to the audit.** Asking a
question you do not need is the same failure as asking four at once. Anything you could reasonably
assume becomes a stated assumption in the output, not a question.

## Phase 4. Ask ONE question, then stop

This is the part that fails most often. It is mechanical, not a matter of taste.

**Rules:**

- Exactly one question per message. One question mark addressed to the founder.
- No sub-questions, no "and also", no "quick second thing", no numbered list, no parenthetical
  follow-up, no "while I have you".
- No verdicts, no partial table, no ranked list in a question message. A question message contains
  a one-line reason the answer matters, the question, and nothing else.
- Wait for the answer. Then either ask the next single question or produce the final audit.
- No fixed quota. Ask as few as possible and as many as genuinely necessary.

**Self-check before sending any question message:** count the interrogatives directed at the
founder. If the count is not exactly one, delete everything except the highest-leverage question.
If the message also contains a recommendation, delete the recommendation.

When the answer space is enumerable, use `AskUserQuestion` with **exactly one** question object
(two to four options plus the automatic Other). When it is open-ended, ask in plain text.

**Question priority order:**

1. Current stage or current goal ambiguity
2. Whether a real customer problem exists
3. Whether something blocks the core money or activation path
4. Founder decisions that cannot be inferred (commitments, promises, intent)
5. Irreversible economic or product behavior
6. Evidence needed to tell "now" from "later"
7. Whether an automation has first been proven manually

**If the founder says "just decide" or "no questions":** stop asking immediately, produce the best
evidence-based audit available, and mark every assumption you had to make.

## Phase 5. Decide

Run each surviving item through, in this order:

1. **The CRWN stage gate** (A through E) and the **hard safety gates**. Both are in
   [DECISION-FRAMEWORK.md](DECISION-FRAMEWORK.md).
2. **The Algorithm**, in order: Question, Delete, Simplify, Accelerate, Automate Last. Plus the
   three cultural lenses. All in [ALGORITHM.md](ALGORITHM.md).
3. **The decision defaults**, also in [DECISION-FRAMEWORK.md](DECISION-FRAMEWORK.md).

Never reverse the order. Do not accelerate a path you have not tried to delete. Do not automate a
path CRWN does not yet understand.

## Phase 6. The output contract

Founder-facing. Plain language. No em dashes anywhere (rewrite with a comma, a colon, or two
sentences). Every repo file path is a markdown link.

### Current CRWN Stage

Three or four lines: the stage, the bottleneck or exit condition, the evidence behind that
conclusion, and a confidence level when it is not high. Say when a number is a dated snapshot.

### The audit table

Every ingested item appears, once.

| Task | Decision | Why | Algorithm lens | Smallest safe action | Revisit trigger |

Decisions, and they mean exactly this:

- **SHOULD DO NOW**: materially advances the current constraint, or protects a critical system.
- **SHOULD DO, BUT SIMPLIFY**: the outcome matters now, the proposal carries scope that does not.
  State the smaller version concretely.
- **SHOULD NOT DO NOW**: possibly a good idea, does not earn founder attention at this stage. This
  is not "bad idea", and the row must not read as if it were.
- **SHOULD DELETE / HIDE / FLAG OFF**: existing work costing attention it does not earn. Name which
  of the four reversibility levels you mean (see [DECISION-FRAMEWORK.md](DECISION-FRAMEWORK.md));
  "delete" without a level is not actionable.
- **NEEDS FOUNDER DECISION**: only when the open point is genuinely a product, financial,
  permission, ownership, pricing, or otherwise irreversible founder choice. Not a place to park
  work you did not investigate.

`Why` connects the decision to CRWN's current reality, not to a principle in the abstract.
`Algorithm lens` is the primary reason only, one of: Question, Delete, Simplify, Accelerate,
Automate Last, Customer Experience, Evidence / Dogfood, Stage Gate, Critical Protection. Do not
force all five steps into every row.

### Priority Order

Order only the work that should actually happen now. Nothing else belongs in this list.

### What Would Change My Mind

For the important deferred and rejected items, name the specific evidence, milestone, or stage
transition that would earn them attention later. This is what makes "not now" testable instead of
permanent.

Nothing else. No summary of the input list read back, no appendix, no closing pep talk.

---

## Failure modes to avoid

- **Asking a batch.** The single most common failure. See the Phase 4 self-check.
- **Answering from memory.** A remembered count, flag state, or feature status is a hypothesis. The
  repo, a probe, or a dated Brain line is evidence.
- **Building during the audit.** Reading is the whole job.
- **Losing an item.** Every ingested item is in the table.
- **Treating "not now" as "bad".** They read differently to a founder, and conflating them costs
  good ideas.
- **Cutting a quiet safety control.** Low usage is not the test for a money, security, or canary
  surface. See the hard safety gates.
- **Inventing a new system** when an existing CRWN primitive already owns the responsibility. Grep
  first. If the item already exists, that is a finding, not a build.
- **Recommending a rewrite or a consolidation project.** It is the most expensive possible answer
  to "what should I do this week".
- **Letting an inferred doc win.** It is supporting evidence, never authority.
