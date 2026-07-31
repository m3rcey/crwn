# 17 — Open Questions

> Things that cannot be answered confidently from the codebase alone. Each has why-it-matters, evidence found, and what remains unclear. Grouped by domain. All require founder input unless the codebase later resolves them.

## Product
1. **Which of the ~60 API domains / 25 crons are core vs. speculative?**
   - *Why:* the surface is enormous; prioritization drives everything.
   - *Evidence:* many parallel growth features (missions/squads/bounties/city-unlocks/road-campaigns/proof-of-demand/playbooks) all production-wired.
   - *Unclear:* real usage/adoption; which are load-bearing for GTM.
2. **Is the Quest Engine / Rise Mode meant to ship on?**
   - *Evidence:* fully built, flag `admin_settings.quest_engine` defaults **off**; dominant recent commit activity.
   - *Unclear:* launch intent + timing.

## Business model
3. **Is the `$99 "label"` platform tier launching, and when?**
   - *Evidence:* fully specced in `TIER_LIMITS`, Stripe price env vars exist, but checkout hard-whitelists `pro` only; marked "SPEC ONLY".
4. **Should `empire` be deleted?**
   - *Evidence:* dead but wired into the live type union + fee config + admin metric across ~20 files. Latent bug risk.
5. **Recruiter/partner program — live or spec?**
   - *Evidence:* dashboards, Stripe Connect payouts, qualification crons all exist; marketing copy stale ($50/$150/$350).
   - *Unclear:* whether real commissions are being paid today.
6. **Founding-artist program parameters** (count cap, fee window, current enrollment)?

## Pricing
7. **Confirm the live pricing/fees**: Free 12% / Pro $9.99 8% is what the code says; the PRD, `schema-platform-tiers.sql`, and `recruit/page.tsx` all disagree with each other and with the code. Which is the real, current, customer-facing pricing?
8. **Email limit**: `EMAIL_LIMITS` says Free 1/mo, Pro 10/mo; PRD says "2 campaigns/week". Which governs?
9. **Cashout fee asymmetry**: weekly auto-payout takes no fee, manual cashout takes $2. Intended?

## User experience
10. **Is the color `#0D0D0D` (hardcoded/docs) or `#0f0f0f` (CSS var) the intended background?**
11. **Is body text actually rendering Inter** (the `--font-geist-sans` var is undefined)?
12. **`bg-crwn-card` in 56 files** — define the token or migrate to `bg-crwn-surface`? (Currently likely transparent.)

## Architecture
13. **Do subscription downgrades actually apply on Stripe's side?** `subscription-update` writes DB fields only; no Stripe schedule call found. Is there another mechanism?
14. **Which social layer is live** — legacy `posts/comments/likes` vs `community_posts/*` vs `community_channels/*`?
15. **Is the fan-owned `playlists` shape** (never-applied second migration) referenced anywhere at runtime?

## Security
16. **Are `NEXT_PUBLIC_CRON_SECRET` and `CRON_SECRET` set to the same value in production?** (Determines whether HIGH-2 is exploitable to trigger payouts.)
17. **Acceptable to leave `profiles.stripe_connect_id` readable** (deferred column lockdown, leaks via `useAuth select('*')`)?
18. **Is there a plan to sign the Resend inbound webhooks?** (HIGH-1. The Twilio half is moot: SMS was removed 2026-07-31.)

## Data
19. **Where is the CREATE TABLE definition for `earnings`, `referrals`, `referral_earnings`, `fan_payouts`, `processed_webhook_events`, `recruiters`?** Needed to rebuild the schema. Can we get a prod `pg_dump`?
20. **Is a hard account-delete / GDPR-erasure path required?** Deactivate/reactivate now works end to end: deactivation genuinely hides the artist publicly (`profiles.is_active=false` is read on the `[slug]` page and home discovery, `notFound()`/filtered out; app-layer enforced), and login reactivates via `/api/account/reactivate`. The remaining gap is a true hard-delete / erasure path (permanent data removal), which does not exist.

## Operational
21. **Who applies migrations and how is order tracked?** (117 files, manual, no runner — any registry of what's applied?)
22. **Is any third-party error monitoring wanted?** (None today; errors are `console.error` only.)
23. **Are the `.mjs` content-generation scripts + `videos/` folder meant to live in the app repo**, or move out?

## Roadmap
24. **PRD §15 roadmap** (Live Q&A "feature-flagged", API access, HubSpot, podcast hosting, social tokens, A/B testing) — which are still planned vs superseded (LiveKit live is already built)?

---

*See also: [14-ROADMAP-INFERRED.md](14-ROADMAP-INFERRED.md) · [13-CURRENT-STATE.md](13-CURRENT-STATE.md) · [11-SECURITY-AND-PRIVACY.md](11-SECURITY-AND-PRIVACY.md)*
