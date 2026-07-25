// Where an artist lands the moment onboarding finishes.
//
// The rule: do NOT drop them on a generic dashboard. Open the builder that matches the calculator
// they came in on, with that calculator's own numbers already in the fields. This is a routing map
// keyed on tool_slug; it invents nothing. Every value it passes came from the stored result's
// conversionPayload (the tool's suggested config) or is derived from it, so the builder shows the
// artist THEIR figure to confirm, not a default to fill in from scratch.
//
// Two real builders back all five calculators:
//   /offers/new    — Membership (worth), the Vault tier (vault), and the referral share step (share)
//   /studio/live   — a ticketed Live Experience, and an Executive Producer session
//
// A calculator with no mapping returns null, and the caller falls back to the dashboard. That is
// how a future calculator degrades safely until it is added here.

import type { LeadMagnetSeed } from './handoffSeed';

export interface PostSetupDestination {
  /** The builder route, e.g. '/offers/new'. */
  path: string;
  /** Prefill + banner query params the builder reads (lm_prefill=1 turns the banner on). */
  params: Record<string, string>;
}

function positive(v: unknown): number | null {
  return typeof v === 'number' && v > 0 ? v : null;
}

function dollars(cents: number): string {
  return String(Math.round(cents / 100));
}

export function postSetupDestination(seed: LeadMagnetSeed): PostSetupDestination | null {
  const cp = seed.conversionPayload ?? {};
  const base: Record<string, string> = {
    lm_prefill: '1',
    lm_tool: seed.toolSlug,
    lm_tool_name: seed.toolName,
    lm_result: seed.resultId,
  };

  switch (seed.toolSlug) {
    // Streaming Loss -> Membership Builder. Suggested price = the calculator's own implied ARPU
    // (net monthly / paying supporters), so the tier opens at the price the calc modeled.
    case 'worth': {
      const net = positive(cp.netMrrCents);
      const payers = positive(cp.payers);
      const arpu = net && payers ? Math.round(net / payers) : null;
      return {
        path: '/offers/new',
        params: {
          ...base,
          lm_goal: 'grow-supporters',
          lm_tier_name: 'Inner Circle',
          ...(arpu ? { lm_price: dollars(arpu) } : {}),
        },
      };
    }

    // Vault Planner -> Membership Builder (the Vault tier). Payload carries tierName + priceCents.
    case 'vault-revenue-planner': {
      const price = positive(cp.priceCents);
      return {
        path: '/offers/new',
        params: {
          ...base,
          lm_goal: 'vault-access',
          lm_tier_name: typeof cp.tierName === 'string' ? cp.tierName : 'The Vault',
          ...(price ? { lm_price: dollars(price) } : {}),
        },
      };
    }

    // Share-to-Earn -> Referral Builder (the share step inside a subscription offer). The commission
    // is the artist's to set, so we open the share step on with the builder's own starting rate.
    case 'share-to-earn-planner': {
      return {
        path: '/offers/new',
        params: { ...base, lm_goal: 'grow-supporters', lm_share_on: '1', lm_share_percent: '20' },
      };
    }

    // Live Experience -> Live Experience Builder. Ticket price is the calc's $15 assumption.
    case 'live-experience-calculator': {
      const price = positive(cp.ticketPriceCents);
      return {
        path: '/studio/live',
        params: {
          ...base,
          lm_title: 'Live Experience',
          ...(price ? { lm_ticket_price: dollars(price) } : {}),
        },
      };
    }

    // Executive Producer -> the same live builder, with submissions on and the seat price the
    // calc banded to this artist's audience.
    case 'executive-producer-session': {
      const price = positive(cp.ticketPriceCents);
      return {
        path: '/studio/live',
        params: {
          ...base,
          lm_title: 'Executive Producer Session',
          lm_submissions: cp.acceptsSubmissions ? '1' : '0',
          ...(price ? { lm_ticket_price: dollars(price) } : {}),
        },
      };
    }

    default:
      return null;
  }
}

/** Serialize a destination to a relative URL the client can push to. */
export function destinationToUrl(dest: PostSetupDestination): string {
  const qs = new URLSearchParams(dest.params).toString();
  return `${dest.path}?${qs}`;
}
