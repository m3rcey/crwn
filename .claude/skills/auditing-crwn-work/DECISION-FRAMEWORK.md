# Decision framework

The CRWN-specific layer: the stage gate that runs before the Algorithm, the safety gates that can
overrule it, the decision statuses, the evidence rules, and the standing defaults.

Read [ALGORITHM.md](ALGORITHM.md) for the five steps themselves.

---

## 1. The stage gate (runs first)

Every proposed item passes through five questions before the Algorithm touches it. The stage itself
is re-derived on every run (SKILL.md, Phase 2) and is never hardcoded here.

### A. Does this directly help the current stage exit condition?

Yes: keep evaluating it.
No: default toward **SHOULD NOT DO NOW**, unless gate B makes it necessary.

The exit condition is the ratified one, not a proxy for it. Work that improves a metric nobody has
agreed is the goal is not work that advances the stage.

### B. Does this protect something CRWN cannot safely ignore?

Any of: receiving or moving real money, security, permissions, entitlement, user ownership, legal
or compliance obligations, destructive data-integrity risk, a known production failure, or the
reliability of the core path.

These can earn priority **even when they do not increase growth**. A money path that silently
breaks costs more than any feature gains.

Note the asymmetry: gate B can promote an item, and it can veto a deletion, but it cannot promote
something merely because it is adjacent to money. "Touches Stripe" is not the test. "Would cost a
real person real money if wrong" is.

### C. Does this increase founder attention, or reduce it?

Founder attention is the scarce resource. Evaluate the **continuing** burden, not the build effort.

A feature that takes two hours to build but creates a permanent concept the founder must explain,
monitor, debug, keep truthful in copy, and keep in sync with five other systems is expensive
forever. A feature that removes a recurring manual chore can be worth more than a feature that adds
capability.

Reducing founder attention is a legitimate benefit on its own. Say so in the `Why` column when it
is the real reason.

### D. Does it increase learning?

Early on, a task that produces decisive evidence about the customer, the offer, the funnel,
activation, or retention can outrank a more polished feature. Ask what CRWN would know afterward
that it does not know now, and whether that knowledge changes a decision.

If the answer is "nothing that changes a decision", the learning claim is decoration.

### E. Is it reversible?

Prefer a reversible test before an irreversible commitment. Pricing changes, public promises,
schema drops, identifier renames, and anything already in a customer's inbox are the expensive
direction. A reversible version of the same experiment usually exists and should be named.

---

## 2. Hard safety gates (can overrule everything above)

The Algorithm is never a justification for recklessness. Deleting is aggressive by design, and
these are where it stops.

**Do not recommend removing or weakening**, unless repository investigation proves the system is
genuinely redundant AND an equally safe canonical control demonstrably remains:

- authentication, authorization, ownership checks
- RLS policies and column privileges
- entitlement checks and the entitlement oracle
- Stripe correctness, webhook signature verification
- money ledgers, payout safeguards
- rate limiting and interruption governors
- architecture drift protections (`npm run verify:architecture` and its suites)
- production canaries (onboarding health, RLS canary)
- privacy controls
- business invariants that real customer money depends on

**Requires deeper repository investigation before any recommendation**: payments, subscriptions,
payouts, Team Splits, pricing, fees, revenue allocation, user ownership, permissions, schema,
destructive data changes, security.

If uncertainty remains after investigation, classify the item as **NEEDS FOUNDER DECISION** with
the specific unknown named, or state plainly that it needs investigation before a call can be made.
Do not guess, and do not soften a guess into a recommendation.

Three specific traps:

- **Low usage is not the deletion test for a safety control.** Most of them exist precisely because
  the matching outage already happened, and their value is that nothing happens.
- **A model or a UI is never the security boundary.** A proposal that moves an authorization check
  into a prompt, a component, or a client is a downgrade regardless of how much simpler it looks.
- **"Nothing depends on it" must be proven by grep, not assumed.** Coupling in this codebase has
  been wrong in both directions.

---

## 3. Decision statuses

| Status | Means | Does not mean |
|---|---|---|
| **SHOULD DO NOW** | Materially advances the current constraint, or protects a critical system | "Easy", "already started", "would feel good to finish" |
| **SHOULD DO, BUT SIMPLIFY** | The outcome matters now; the proposal carries scope that does not. The smaller version is stated concretely | A vague instruction to "do less" |
| **SHOULD NOT DO NOW** | Does not earn founder attention at this stage | "Bad idea". Say what would change that, in What Would Change My Mind |
| **SHOULD DELETE / HIDE / FLAG OFF** | Existing work costing attention it does not earn. One of the four reversibility levels is named | An unqualified "delete", which is not actionable |
| **NEEDS FOUNDER DECISION** | A genuinely irreversible product, financial, permission, ownership, or pricing choice | A parking space for work that was not investigated |

The four reversibility levels, in order of preference: **Hide** the surface, **Flag off**, **Delete
the code and keep the data**, **Delete the code and drop the tables** (only for something that has
never held a row). This vocabulary is CRWN's own; use it rather than inventing a new one.

---

## 4. Evidence rules

- **Verified fact, assumption, inference, stale documentation, previous-agent claim, founder report,
  and hypothesis are seven different things.** Label them when they matter. A previous audit's
  finding is a claim until re-verified.
- **A founder report of a problem is evidence that something felt wrong, not proof of what is
  wrong.** "Artists got stuck on the Stripe step" is real signal and must be taken seriously, and
  the diagnosis still has to be verified against the code before the fix is priced. The reported
  symptom and the actual cause are different often enough that auditing the proposed fix without
  checking is how the wrong thing gets built with full confidence. Never rank or design a fix
  solely because a report, an audit, a TODO item, a doc, or an assumption says the problem exists.
- **A measured zero is evidence. "Unknown" is not zero.** Where a decision depends on an unknown,
  name the single measurement that settles it.
- **Snapshot counts are strong evidence about what has never happened, and weak evidence about
  frequency.** Say the date.
- **Built is not proven.** A shipped feature with no observed use has demonstrated engineering, not
  demand.
- **A file in the repo is not a live feature.** Keep four states separate: the migration file
  exists, the migration is applied in production, the flag state, the feature is actually
  reachable.
- **Do not treat a small sample as established truth**, and do not read association as causation.
- **Where a test, probe, invariant, schema constraint, or build can observe a property directly,
  that observation is the verification.** Reasoning about it is not.

---

## 5. Standing defaults

1. A new feature must prove why it deserves to exist.
2. A feature solving a future scaling problem before the underlying usage exists should usually
   wait.
3. A task that moves the current bottleneck beats a task that improves completeness.
4. A manual process is acceptable while CRWN is still learning what the process should be.
5. Automation is not inherently progress.
6. Reducing founder attention is a valid benefit by itself.
7. Removing an unnecessary concept can beat improving that concept.
8. Do not optimize a path CRWN should not have.
9. Do not accelerate a path before simplifying it.
10. Do not automate a path before CRWN understands it.
11. Do not confuse "built" with "proven".
12. Do not confuse "unused" with "safe to delete". Money, security, and safety controls are
    different.
13. Do not confuse "good idea" with "right idea for this stage".
14. Prefer evidence-producing work over speculative completeness before product-market fit.
15. The current stage is always re-derived, never permanently embedded in this skill.

---

## 6. Duplication rulings

When two or more CRWN surfaces answer the same question, the audit should say which single one
survives, based on repository ownership rather than which is newer or nicer.

Before recommending a new system, grep for the existing owner. This codebase already has canonical
owners for diagnosis, launch readiness, execution, pending work, fan promises, attribution,
entitlement, and priority. A proposal that adds a second owner for any of those is drift, and the
correct recommendation is usually to extend the existing owner or to do nothing.

**An item that already exists is a finding, not a build.** When a proposed item is already shipped,
say where it lives, and rule on the real gap: it is undiscoverable, it is hidden by a deliberate
reduction, it does not do the specific thing asked, or the founder had forgotten it. Those are four
different decisions, and only one of them is work.

**Never recommend a rewrite or a consolidation project.** Nobody asked for better architecture, and
a rewrite is the most expensive possible answer to "what should I do this week". The available
moves on an existing surface are the four reversibility levels plus extending a canonical owner. If
an architecture really is the constraint, say that in one line and let the founder decide whether to
open it as its own question.

Section 13 of
[docs/crwn-brain/29-COMPLETE-FEATURE-INVENTORY.md](../../../docs/crwn-brain/29-COMPLETE-FEATURE-INVENTORY.md)
lists the known duplication clusters. Verify against the repo before quoting it; it is dated.
