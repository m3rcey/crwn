# Post-Deploy Smoke Checklist

Run after every deploy that touches money-path code (webhook, checkout, cashout, payouts, earnings).

---

## 1. Checkout Session Creation

**Subscription checkout:**
- [ ] Go to a test artist page, pick a tier, click Subscribe
- [ ] Verify redirect to Stripe Checkout (correct amount, correct artist name in statement descriptor)
- [ ] Verify `application_fee_percent` matches artist's platform tier (Starter/Pro 8%, Label 6%, Empire 4%)
- [ ] Verify `transfer_data.destination` is the artist's Connect account ID

**Product checkout:**
- [ ] Buy a product from the shop
- [ ] Verify redirect to Stripe Checkout (correct amount, correct fee)
- [ ] Verify sold-out products are rejected before Stripe redirect
- [ ] Verify expired products are rejected before Stripe redirect

---

## 2. Webhook Processing

After completing a checkout:

- [ ] Check `processed_webhook_events` table — new row with the event ID exists
- [ ] Check `subscriptions` table — row created/upserted with correct `fan_id`, `artist_id`, `tier_id`, status `active`
- [ ] Check `earnings` table — row created with correct `gross_amount`, `platform_fee`, `net_amount`
- [ ] Verify `net_amount = gross_amount - platform_fee` and fee matches artist tier rate
- [ ] Check `notifications` table — subscriber notification + earning notification exist for the artist

For product purchase additionally:
- [ ] Check `purchases` table — row with status `completed`
- [ ] Check `products` table — `quantity_sold` incremented by 1

---

## 3. Idempotency

- [ ] Find a recent event ID from `processed_webhook_events`
- [ ] Replay it (or trigger Stripe to resend from Dashboard > Webhooks > Resend)
- [ ] Verify response is `{ received: true, duplicate: true }`
- [ ] Verify NO new rows in `earnings`, `subscriptions`, `purchases`, or `notifications`

---

## 4. Subscription Lifecycle

- [ ] **Renewal:** After invoice.paid (billing_reason = subscription_cycle), verify new earnings row with `renewal: true` in metadata
- [ ] **Cancel:** After subscription deleted, verify subscription status = `canceled`, artist notified, AI insight created
- [ ] **Payment failed:** After invoice.payment_failed, verify subscription status = `past_due`

---

## 5. Refund

- [ ] Process a refund in Stripe Dashboard
- [ ] Verify negative earnings row created (gross_amount negative, proportional fee refund)
- [ ] If product purchase: verify purchase status = `refunded`
- [ ] Verify artist notified

---

## 6. Artist Balance & Cashout

- [ ] Hit `/api/stripe/balance` — returns correct available/pending amounts
- [ ] Verify cashout with balance > $2: payout created in Stripe, balance reduced
- [ ] Verify cashout with balance < $2: rejected with helpful error
- [ ] Verify rate limit: second cashout within 60s returns 429

---

## 7. Weekly Payout Cron

- [ ] Trigger `/api/cron/weekly-payout` with correct CRON_SECRET
- [ ] Verify `cron_run_log` row created with current week's period key
- [ ] Verify artists with positive balances received payouts
- [ ] Verify artists with $0 balance were skipped
- [ ] Trigger again same week — verify skipped (idempotency via period key)

---

## 8. Platform Tier Changes

- [ ] After platform checkout (artist upgrades to Pro/Label/Empire): `artist_profiles.platform_tier` updated
- [ ] After platform subscription deleted: artist downgraded to `starter`
- [ ] `profiles.platform_tier` stays in sync with `artist_profiles.platform_tier`

---

## 9. Email Delivery

- [ ] Check Resend dashboard — subscription confirmation email sent to fan
- [ ] Check Resend dashboard — receipt email sent to fan
- [ ] Check Resend dashboard — new subscriber email sent to artist
- [ ] For product purchase: purchase confirmation + receipt emails sent

---

## 10. Quick Sanity Checks

- [ ] Webhook endpoint responding (not 404) — check Stripe Dashboard > Webhooks for recent delivery status
- [ ] No 500 errors in Vercel function logs for `/api/stripe/webhook`
- [ ] Middleware not blocking `/api/` routes (POST requests work, not returning 404)

---

## When to Run

| Scenario | Sections to run |
|---|---|
| Webhook route change | All |
| Checkout route change | 1, 2, 3, 9 |
| Cashout/payout change | 6, 7 |
| Platform tier change | 8 |
| Middleware change | 10 |
| Any money-path deploy | 2, 3, 10 (minimum) |
