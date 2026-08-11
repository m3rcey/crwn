# 24. Recommendation-to-outcome linkage (Z3)

> Shipped 2026-08-11 (dark until its migration runs). The evidence primitive that lets CRWN ask:
>
> **Deployment status, verified 2026-08-11:** `constraint_recommendations` is **NOT APPLIED** in
> production, confirmed by `npm run verify:migrations` (anon-key probe, the repo's own convention),
> not by assumption. Nothing else blocks it: the code is shipped, the cron is scheduled, and every
> check that does not need a database has passed. This environment has **no path to apply DDL** and
> that is by design, not by omission: there is no `DATABASE_URL`, no `pg`/`postgres` client, no
> Supabase CLI, no psql, and no SQL-execution RPC. The service-role key authenticates to PostgREST,
> which executes table operations, never `CREATE TABLE` or `CREATE POLICY`. CLAUDE.md's standing
> rule is that Josh applies migrations manually in the Supabase SQL editor, and that rule is the
> authorization model rather than an obstacle to route around.
>
> **The live-database half of the verification (table shape, indexes, RLS owner/cross-artist/anon
> reads, client write denial, issuance idempotency against the real index) has therefore NOT been
> performed and cannot be until the migration runs.** Everything below describes intended and
> unit-tested behavior. Z3 stays open until those checks pass. See TODO.md.
> **what did we recommend, did the artist act, and did the metric we were trying to move change
> afterwards?**
>
> It is NOT intelligence. Nothing here learns, ranks, adapts, or compares one artist to another.
> It is the record that a future intelligence layer would need, built now so that the evidence
> exists by the time there is anything to learn from.

---

## 1. The four things that are not the same thing

The whole point of this primitive is that these stay separate. Collapsing any two of them is how a
product starts believing its own advice.

| Concept | Question | Where it lives |
|---|---|---|
| **Recommendation** | What did CRWN say to do? | `constraint_recommendations` row, at issue |
| **Action** | Did the artist actually do it? | `action_completed_at`, from a DomainCheck |
| **Observation** | What was measurable before, and later? | `baseline_evidence` / `observed_evidence` |
| **Outcome** | Did the constraint clear? | `outcome` |

**A completed action is not a successful recommendation.** CRWN tells an artist to deliver their
overdue promise; they deliver it; the completion rate may still sit under the threshold, or be
unmeasurable, or have moved for reasons no one recorded. That is four different facts and the table
keeps them in four different columns.

---

## 2. What CRWN may claim, and what it may not

**May claim:**
- "CRWN recommended X on this date, on this evidence."
- "The artist completed the action that proves X was done." (only where a DomainCheck exists)
- "The metric read A before and B later."
- "This was no longer the constraint at measurement time."

**May NOT claim, and no column exists for it:**
- That the recommendation *caused* the change. Anything else the artist did in the window is
  invisible to this record, several recommendations can target the same metric, and multiple actions
  can occur between observations.
- That an improvement happened by some threshold. There is no "improved" state, because CRWN has no
  measured basis for how much movement counts (see §5).
- Anything about artists in general. This table is per-artist and is never aggregated across
  artists into a benchmark, a rate, or a recommendation.

The vocabulary is deliberately associative: `constraint_cleared` means the constraint cleared **while
the recommendation was open**. No field is named `caused`, `impact`, `attributed` or `score`, and
none should ever be added.

---

## 3. Architecture

```
GET /api/artist/constraint          (artist opens their dashboard)
  └─ assembleConstraintEvidence()   existing, service-role
  └─ readConstraint()               existing, PURE, the ONLY diagnosis in CRWN
  └─ recordIssuedRecommendation()   NEW: one open row per artist per constraint
                                    · baseline captured ONCE, never refreshed
                                    · insufficient_evidence records NOTHING

cron /api/cron/constraint-outcomes  (daily, 02:00)
  └─ evaluateCondition()            existing quest evaluator, READ ONLY
                                    · sets action_completed_at, first write wins
  └─ readConstraint() again         same engine, fresh evidence
  └─ classifyOutcome()              NEW: is this still the constraint?
                                    · writes observation columns only
```

- `src/lib/constraint/recommendationOutcome.ts` — **pure**. Identity, baseline mapping, measurement
  window, outcome classification. No DB, no clock of its own.
- `src/lib/constraint/recommendationStore.ts` — the **only writer**. Service role, fails soft.
- `supabase/schema-phase3-recommendation-outcomes.sql` — one additive table.

---

## 4. Identity

`action_key = "<CONSTRAINT>:<DomainCheck | advisory>"`, e.g. `FULFILLMENT:artist_promise_fulfilled`.

- **Wording is never the identity.** Copy edits to the button label or the diagnosis title do not
  change it. `REACH` can issue two different actions (import contacts, send a campaign) and the
  DomainCheck separates them.
- **One recommendation, many surfaces.** A partial unique index on
  `(artist_id, constraint_type) WHERE outcome = 'not_measured_yet'` means every surface rendering the
  same live diagnosis resolves to the same row. That is enforced by the database, not by application
  discipline, so a new surface cannot accidentally create a second recommendation.
- Repeat dashboard loads deliberately do **not** refresh the baseline. Otherwise a week of visits
  would slide the "before" picture forward until it matched the "after" and every recommendation
  would look like it changed nothing.

---

## 5. Outcome semantics, and where thresholds come from

| State | Meaning |
|---|---|
| `not_measured_yet` | Issued; the window has not elapsed |
| `insufficient_evidence` | The engine could not evaluate at measurement time |
| `constraint_cleared` | This is no longer the artist's constraint |
| `constraint_persists` | Still the constraint |

**No threshold is defined here.** Classification works by *re-running the existing engine* and asking
the question it already answers with founder-adjustable thresholds from `constraint/thresholds.ts`.
Inventing an "improved by N%" rule would have put a number in front of an artist that nothing in the
product supports.

**`insufficient_evidence` is not success.** Too few promises to judge reads exactly like a perfect
month; calling either an improvement would be a lie of omission. This is pinned by a test.

---

## 6. Evidence semantics

Reuses the canonical `MetricState` from `src/lib/frl/economics.ts`: **`complete | modeled | missing`**.
A second vocabulary for the same idea is how a codebase ends up unable to compare its own numbers.

`value: null` means **missing**, never zero — the Constraint Engine's founding discipline. "Nobody
visited your page" and "we have no view data" are opposite facts with opposite correct responses.

Nothing in the first slice is `modeled`: every value comes off CRWN's own product tables. If a modeled
value is ever recorded, it must arrive already labelled, never inferred at write time.

---

## 7. Measurement windows

Taken from the engine's **own** lookback policy, never invented:

| Constraint | Window | Source |
|---|---|---|
| FULFILLMENT | 90d | `thresholds.fulfillment.lookbackDays` |
| REACH / FREE_CAPTURE / PAID_TIER_INTEREST / CHECKOUT_COMPLETION | 30d | their own `lookbackDays` |
| **RETENTION, FIRST_PAID, DEPTH** | **none defined** | recorded as `NULL`, never measured |

The last row is a deliberate limitation, not an oversight. Those stages are judged on standing state
rather than a window, so there is no defensible moment to call the outcome. Their rows stay open and
honest. **Defining a window for them is a founder decision**, made in `thresholds.ts`.

---

## 8. Financial safety

This slice records **no financial value at all**. The first constraint measured (FULFILLMENT) runs on
promise completion, which is not money.

If a money metric is ever linked here it must be **referenced from the canonical rails**
(`earnings`, the Money Model in `src/lib/frl/economics.ts`), never recomputed. Note the cautionary
example already in the repo: `snapshotArtistMetrics` (the AI Manager's) sums tier prices to derive
its own MRR and defaults every field to `0`, so it cannot tell "no data" from "zero". Do not copy it.

---

## 9. Permissions

- **Read:** RLS, owner only — `artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())`.
  The policy names only `id`/`user_id`, never a SELECT-revoked column, so it cannot 42501 the whole
  statement.
- **Write:** service role only. There is **no client INSERT/UPDATE/DELETE policy**, asserted by the
  migration's self-verify block. An artist can read their history and can never author it, backdate a
  baseline, or mark their own outcome cleared.
- The issuing route takes **no `artistId` parameter**: ownership comes from the session and the
  request cannot name a subject at all.
- `ON DELETE CASCADE` from `artist_profiles`: a deleted artist takes their evidence with them.

---

## 10. Recommendation owners

| System | Classification | In Z3? |
|---|---|---|
| **Constraint Engine** (`readConstraint`) | Canonical owner. Deterministic, one constraint, one action | **Yes** |
| **AI Manager** (`artist_agent_actions`) | Canonical owner of its own separate loop; already has baseline/outcome via `schema-phase2-agent-outcomes.sql` | No, unchanged |
| **Action Plan** (`/api/action-plan`) | Execution surface. Advisory-only, explicitly does not touch the Manager pipeline | No |
| **Rise Mode / quests** | Execution surface + completion oracle. Owns DomainChecks, which Z3 *reads* | Read only |
| **Roadmap** | Owns launch readiness. The engine delegates to it and never re-derives it | No |
| **Playbooks, onboarding, popups** | Supporting guidance | No |

**One recommendation has one durable identity regardless of how many surfaces render it.** If the
Manager ever explains a constraint the engine owns, it must reference that row, not create one.

---

## 11. Historical data

**Prospective only.** No backfill. Recommendations were never recorded before this shipped, and the
engine's evidence is a live read of tables whose values have since moved, so a reconstructed baseline
would be a fabrication wearing a timestamp. Evidence collection begins when the migration runs.

---

## 12. Extension path (deliberately not built)

- **Artist-specific learning** — "this artist's last three FREE_CAPTURE recommendations all
  persisted, try a different action." Needs many measured rows per artist. Not built: there is not
  one measured row yet.
- **Cross-artist evidence** — "when CRWN recommends improving free capture, what usually happens?"
  Needs many artists, and a decision about whether a cohort rate may influence an individual's
  advice. Not built, and `POSITIONING.md` forbids marketing it either way until it is.
- Neither is permitted to consume this table until the founder ratifies the claim maturity step in
  `23-ZERO-TO-ONE-STRATEGY.md` §9. **Z3 creates the evidence. It does not spend it.**

---

*See also: [23-ZERO-TO-ONE-STRATEGY.md](23-ZERO-TO-ONE-STRATEGY.md) · [02-FEATURE-MAP.md](02-FEATURE-MAP.md) (Constraint Engine) · [21-MONEY-MODEL-MEASUREMENT.md](21-MONEY-MODEL-MEASUREMENT.md) (`MetricState`)*
