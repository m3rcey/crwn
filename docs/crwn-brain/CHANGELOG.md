# CRWN Brain — Changelog

## 2026-07-11 — Lead Magnet system (4 tools)

Added a config-driven Lead Magnet system (branch `claude/rise-mode-full-journey`). One typed registry (`src/lib/leadMagnets/registry.ts`) drives all tools; adding a tool = one config + one deterministic generator, no new pages.

- **Tools shipped (4):** Vault Revenue Planner (`vault-revenue-planner`), Proof of Demand Test Builder (`proof-of-demand-test-builder`), Fan Mission Generator (`fan-mission-generator`), Clip-to-Earn Campaign Planner (`clip-to-earn-campaign-planner`).
- **Routes:** public `/tools` + `/tools/[slug]` (SSG shells, `(public)` group); protected `/artist/tools`, `/artist/tools/[slug]`, `/artist/tools/saved` (middleware `protectedPaths` gains `/artist/tools`; `tools` added to `knownRoutes`).
- **Shared engine:** reuses `Wizard` + `OptionSelect`; deterministic versioned generators (`resultGenerators.ts`, `GENERATOR_VERSION`); preview-gated result renderer; consent-correct public lead capture; save/email/share; conversion adapters that PREFILL the live builders (Proof of Demand, Missions, Bounties read `lm_*` params, one-time seed, their own validation/payout logic untouched). Vault degrades to a saved plan by design.
- **APIs (`/api/lead-magnets/*`):** `capture` (public, IP rate-limited, server-recomputes the result), `results` + `results/[id]` (owner-scoped CRUD, public read by high-entropy token), `email` (recipient-locked, suppression-checked), `analytics` (field-allowlisted sink), `admin` (aggregates only).
- **DB:** `supabase/schema-phase2-lead-magnets.sql` (NOT yet applied) adds `lead_magnet_leads`, `lead_magnet_results`, `lead_magnet_events` with RLS (owner-manage + admin-read) and a self-verify block. Distinct from `crm_contacts`/`fan_contacts`/`fan_events`.
- **Out of scope preserved:** the existing `/worth` "money left on the table" calculator is untouched.
- **Follow-up:** apply the migration in the Supabase SQL editor; builder->result "converted" callback (marking a result `converted` after the builder creates the record) is not yet wired.

## v1.0 — 2026-07-10 (initial generation)

- **Generated:** 2026-07-10
- **Repository:** CRWN (`thecrwn.app`), Supabase project ref `ecpqtuidtsncjfwtkvwc`
- **Git branch:** `master`
- **Git commit:** `614b9582b2e5c456837fcd0c5cfc42b1d3194bac` (`614b958` — "Dropdowns for multi-option selectors; notification polish; Rise Mode return-to")
- **Repository status at generation:** working tree had unrelated uncommitted changes (mostly Windows `:Zone.Identifier` / Dropbox attribute sidecar files, plus edits to video-script and SQL notes). **No application source was modified to produce this documentation** — the CRWN Brain only adds files under `docs/crwn-brain/`.

### Method
Documentation was produced by static analysis of the repository at the commit above: reading source, routes, ~190 API handlers, 117 `supabase/*.sql` migrations, config, and the repo's own docs (`CLAUDE.md`, `CODEBASE.md`, `DEV_RULES.md`, `PRD.md`, `CRWN_Kickoff_Brief.md`). Evidence was gathered by parallel read-only exploration agents across domains (database, auth/security, payments, features, integrations, design/conventions, current state) and cross-checked against direct file reads. No code was executed, no migrations applied, no external API called, no production data touched.

### Files created (23)
`00-START-HERE.md`, `01-PRODUCT-VISION.md`, `02-FEATURE-MAP.md`, `03-USER-ROLES-AND-PERMISSIONS.md`, `04-ARCHITECTURE.md`, `05-DATABASE.md`, `06-ROUTES-AND-USER-FLOWS.md`, `07-BUSINESS-RULES.md`, `08-DESIGN-SYSTEM-AND-UX.md`, `09-CODING-CONVENTIONS.md`, `10-INTEGRATIONS.md`, `11-SECURITY-AND-PRIVACY.md`, `12-ENVIRONMENT-AND-SETUP.md`, `13-CURRENT-STATE.md`, `14-ROADMAP-INFERRED.md`, `15-AI-AGENT-INSTRUCTIONS.md`, `16-GLOSSARY.md`, `17-OPEN-QUESTIONS.md`, `18-SOURCE-MAP.md`, `CRWN-BRAIN-COMBINED.md`, `CRWN-BRAIN-QUICK-CONTEXT.md`, `CHANGELOG.md` (this file).

### Certainty labels
Statements are marked `Confirmed`, `Strongly inferred`, `Unclear`, `Not found in codebase`, or `Needs founder confirmation`. No secrets or secret values were included; env vars are referenced by name only.

### Key reconciliations baked in
- **Pricing:** code (`TIER_LIMITS`) is authoritative — Free 12% / Pro $9.99 8% / $99 `label` spec-only / `empire` dead. `PRD.md`, `schema-platform-tiers.sql`, and `recruit/page.tsx` all carry stale/contradictory pricing.
- **AI provider:** DeepSeek (+ narrow OpenAI), not "Moonshot/Kimi" as PRD says. `@google/genai` is unused by the app.
- **Booking:** live flow is booking tokens; the Calendly components are orphaned.
- **Onboarding:** `/welcome` → `/setup` wizard (PRD's tour/action-picker flow is stale).

### Known documentation limitations
1. **Schema is not fully reconstructable from the repo** — `earnings`, `referrals`, `referral_earnings`, `fan_payouts`, `processed_webhook_events`, `recruiters` have no checked-in CREATE TABLE migration; their columns are described only from later ALTERs. A production `pg_dump` is needed for completeness.
2. **Security audit sampled, not exhaustive** — the 195-file `SUPABASE_SERVICE_ROLE_KEY` surface was reviewed across every risk category, not line-by-line for all files. No leak found in anything reviewed; a full sweep is a reasonable follow-up.
3. **Env var equality unverifiable** — whether `NEXT_PUBLIC_CRON_SECRET == CRON_SECRET` in production (which determines exploitability of HIGH-2) could not be checked without Vercel access.
4. **Runtime-only facts unverified** — e.g. whether body text renders Inter vs a fallback, and whether subscription downgrades actually apply on Stripe's side, were reasoned from static code and flagged, not observed at runtime.
5. **Dynamic ranking/algorithm logic** (Explore/Home feed ordering) was not deeply traced.
6. Reflects a single commit; drift begins immediately. Update this changelog + the affected docs after each behavior/architecture change.

### How future agents should update the CRWN Brain
- After a feature/change: update `02-FEATURE-MAP` (status), `05-DATABASE` (schema), `07-BUSINESS-RULES` (rules), `13-CURRENT-STATE`, and any doc whose claims changed. Re-check certainty labels.
- Append a new dated `## vN` section here with the new commit hash, what changed, and any new limitations.
- If a statement in the Brain becomes stale, fix it in place and note the correction — stale docs caused several of the reconciliation issues found during this generation.
- Keep `CRWN-BRAIN-COMBINED.md` and `CRWN-BRAIN-QUICK-CONTEXT.md` consistent with the numbered docs when you edit them.
