// Where a fan lands after Stripe checkout. The ONE place that decides it.
//
// WHY THIS EXISTS. /api/stripe/checkout accepted a caller-supplied `returnUrl` and
// concatenated it straight into Stripe's success_url and cancel_url. That is the SEC-016
// class (three click-tracking routes had it, which is why src/lib/safeRedirect.ts exists):
// a crafted value like `@evil.com` parses as a host once the browser resolves it, and a
// checkout session whose success page is attacker-chosen is phishing served to the exact
// fan who just paid. Every caller in the repo passes a literal internal path today, so
// this was latent, not exploited. It stays that way by validating here.
//
// FAIL SOFT, NOT CLOSED. A malformed returnUrl must not block a purchase: the fan falls
// back to the artist's public page, which is always a correct place to land. The QUERY
// STRING of a valid internal path is preserved deliberately, because the funnel state a
// return path carries (?offer=..., attribution tags) is exactly what must survive the
// Stripe round trip.

import { safeInternalPath } from '@/lib/safeRedirect';

export interface CheckoutReturn {
  successUrl: string;
  cancelUrl: string;
}

/**
 * Build the absolute success/cancel URLs for a checkout session.
 * `returnUrl` is untrusted caller input; `artistSlug` comes from the tier row the server
 * itself loaded, so the fallback can never be steered by the request.
 */
export function checkoutReturnUrls(
  baseUrl: string,
  returnUrl: unknown,
  artistSlug: string,
): CheckoutReturn {
  const safe = safeInternalPath(returnUrl);
  const path = safe ?? `/${artistSlug}`;
  // The path may already carry a query string; append with the right separator.
  const sep = path.includes('?') ? '&' : '?';
  return {
    successUrl: `${baseUrl}${path}${sep}subscription=success`,
    cancelUrl: `${baseUrl}${path}${sep}subscription=canceled`,
  };
}
