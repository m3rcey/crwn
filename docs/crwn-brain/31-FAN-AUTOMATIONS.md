# 31 — Fan Automations (artist comment-to-DM funnels)

**Status: BUILT AND DARK (2026-08-29).** Code complete, tests green, build green. Two founder
actions gate it live: applying
[supabase/schema-phase3-fan-automations.sql](../../supabase/schema-phase3-fan-automations.sql)
and the Meta app setup in TODO.md (env vars + App Review). Until both land, the artist screen
says connections are not available, the webhook drops everything unmatched, and the drop pages
404.

**Founder decision recorded:** the 2026-08-24 publishing-engine investigation ratified "no DM
automation, no ManyChat replacement, nothing artist-facing" for the FOUNDER publishing stack.
On 2026-08-29 the founder explicitly commissioned an artist-facing comment-to-DM product. That
is this feature, built as the different product with the different threat model the old note
predicted: multi-tenant OAuth, per-artist encrypted tokens, closed tables, provider-signed
webhooks. The founder ManyChat acquisition engine (H-07) is untouched and shares no table,
route, keyword, or identifier with any of this.

## What it is

One opinionated money path, no workflow canvas:

```
fan comments on the artist's IG/FB post
  -> verified Meta webhook (/api/webhooks/meta)
  -> public reply ("Check your DMs 👑") + the ONE permitted private reply, carrying the drop link
  -> /drop/<token>: artist-branded page, email required
  -> magnet delivered (signed R2 URL or free track) + free-tier membership via joinFreeTier
  -> Gold-equivalent tier offer (artist's standout item, teased not leaked)
  -> decline or checkout-cancel -> Silver-equivalent downsell
  -> both CTAs are the canonical /api/stripe/checkout
```

## Meta reality the design encodes (verified against official docs 2026-08-29, Graph v26.0)

- Integration: **Instagram API with Instagram Login** (graph.instagram.com, no Facebook Page
  needed, scopes `instagram_business_basic/manage_comments/manage_messages`) and **Facebook
  Login for Pages** (graph.facebook.com, `pages_show_list/read_engagement/manage_engagement/
  manage_metadata/messaging`).
- **One private reply per comment, within 7 days.** Enforced physically by
  `UNIQUE(provider, comment_id)` on `social_webhook_receipts` (also the webhook dedupe claim).
- **The private reply does NOT open the 24h messaging window**, so there are no follow-up
  sequences; the single DM carries the drop link (text + URL, portable across both platforms).
- **Nobody can be DMed who did not comment.** There is no outbound messaging surface at all.
- IG long-lived tokens expire in 60 days; `/api/cron/social-token-refresh` (daily 03:00)
  refreshes anything inside 10 days of expiry and marks refused tokens `expired` (pausing
  their automations). Page tokens carry no expiry.
- Webhooks: one app-level callback, `hub.challenge` handshake (GET), `X-Hub-Signature-256`
  HMAC over the raw body (POST), `verifyMetaSignature` in
  [src/lib/webhookSignatures.ts](../../src/lib/webhookSignatures.ts), fails closed. Each
  connected account must be individually subscribed (`subscribed_apps`), done at connect time.
- **Standard Access covers app-role accounts before review**, so the founder can run the whole
  loop dark; real artists need Advanced Access (App Review + Business Verification).

## Architecture

| Piece | File |
|---|---|
| Meta app config (env, fails closed) | [src/lib/fanAutomations/config.ts](../../src/lib/fanAutomations/config.ts) |
| Token encryption (AES-256-GCM) | [src/lib/social/connectionTokens.ts](../../src/lib/social/connectionTokens.ts) |
| THE one connections reader | [src/lib/fanAutomations/connections.ts](../../src/lib/fanAutomations/connections.ts) |
| Graph client (both providers) | [src/lib/fanAutomations/metaGraph.ts](../../src/lib/fanAutomations/metaGraph.ts) |
| OAuth state (signed, 15 min, session-bound) | [src/lib/fanAutomations/oauthState.ts](../../src/lib/fanAutomations/oauthState.ts) |
| Webhook payload parsing (pure) | [src/lib/fanAutomations/webhookEvents.ts](../../src/lib/fanAutomations/webhookEvents.ts) |
| Trigger matching (pure) | [src/lib/fanAutomations/matching.ts](../../src/lib/fanAutomations/matching.ts) |
| Comment orchestration (claim-first) | [src/lib/fanAutomations/processComment.ts](../../src/lib/fanAutomations/processComment.ts) |
| Gold/Silver derivation (pure) | [src/lib/fanAutomations/offerTiers.ts](../../src/lib/fanAutomations/offerTiers.ts) |
| Artist input validation (pure) | [src/lib/fanAutomations/automationInput.ts](../../src/lib/fanAutomations/automationInput.ts) |
| Webhook route | [src/app/api/webhooks/meta/route.ts](../../src/app/api/webhooks/meta/route.ts) |
| OAuth + connection routes | [src/app/api/social-connect/](../../src/app/api/social-connect/) |
| Automations CRUD + derived stats | [src/app/api/fan-automations/route.ts](../../src/app/api/fan-automations/route.ts) |
| Fan claim route | [src/app/api/drop/[token]/claim/route.ts](../../src/app/api/drop/%5Btoken%5D/claim/route.ts) |
| Drop page | [src/app/(public)/drop/[token]/page.tsx](../../src/app/(public)/drop/%5Btoken%5D/page.tsx) |
| Artist screen + wizard | [src/components/artist/automations/](../../src/components/artist/automations/) |
| Delivery email (transactional) | [src/lib/emails/dropDelivery.ts](../../src/lib/emails/dropDelivery.ts) |
| Token refresh cron | [src/app/api/cron/social-token-refresh/route.ts](../../src/app/api/cron/social-token-refresh/route.ts) |

Artist surface: `/studio/automations` (HubPage shell), indexed in AccountHub's Grow group,
deliberately NOT a sixth Studio tile.

## The rules that must hold

1. **Fan identity is the Song Lab captured-contact boundary, verbatim.** `identityDecision` +
   `joinFreeTier`; no session ever returned; a confirmed account's email gets the drop but no
   membership and no account-existence leak; paid members are never downgraded
   (`already_member` writes nothing).
2. **All four tables are CLOSED** (RLS on, zero policies, ALL revoked by name). The ratified
   deviation: `artist_social_connections.access_token_enc` is the one credential column in
   the database, AES-256-GCM under server-only `SOCIAL_TOKEN_ENC_KEY`, readable only through
   `connections.ts`. A missing key fails every connect and every send closed; it can never
   store plaintext.
3. **The webhook resolves the artist from the provider-owned account id**, never anything in
   the body. Claim first, then match, then send; the connected account's own comments are
   skipped (our public reply is itself a comment event, the loop guard).
4. **Gold/Silver are derived, never stored as names.** Alias-match to the `vault` /
   `inner_circle` rungs, else price order; stored tier ids are pointers re-validated against
   live rows on every render; the ladder never inverts. Prices always come from
   `subscription_tiers` rows.
5. **Checkout is only ever the canonical `/api/stripe/checkout`.** This funnel passes a
   `tierId`, a same-site `returnUrl` (`/drop/<token>`), and reporting-only attribution
   (`attribution_source=fan_automation`, `utm_campaign=<automation token>`). Fees, prices,
   destination all stay server-derived there. Success never shows Silver; decline and
   Stripe-cancel do.
6. **Conversions are DERIVED** (the Fan Drives rule): stats join `fan_automation_leads.
   fan_user_id` to live `subscriptions` rows. No counter columns, no money columns, no second
   revenue truth.
7. **The magnet is never a public URL.** Uploads deliver through short-lived signed R2 URLs
   minted at claim time (deliberately NOT inheriting the `products.file_url` public-URL
   weakness); a track magnet must be one of the artist's FREE tracks.
8. **The delivery email is transactional** (answers the fan's own form submit), checked
   against `email_suppressions` before sending, delivered on-page regardless.

## Governance hooks

- `EXPECTED_MIGRATION_STATE`: `schema-phase3-fan-automations.sql`, state `pending`.
- Probe lines: `fan automations` + `artist social connections` in
  [scripts/probe-migrations.mjs](../../scripts/probe-migrations.mjs) (42501 = applied).
- `FEATURES` contract: key `fan_automations`, expectedState `dark`.
- `verifyMetaSignature` registered in SEC-WEBHOOK's `VERIFIES` and SEC-SERVICE's
  `ESTABLISHES`; the drop claim route is in `DELIBERATELY_PUBLIC` with its boundary comment.
- Tests: `matching`, `offerTiers`, `automationInput`, `webhookEvents`, `oauthState`,
  `connectionTokens`, `webhookSignatures.meta` (54 tests).
