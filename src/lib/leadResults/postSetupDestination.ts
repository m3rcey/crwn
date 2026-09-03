// Where an artist lands the moment onboarding finishes, and the draft configuration that greets
// them there.
//
// This is a routing + draft-config map keyed on tool_slug. It invents nothing: every editable
// value it pre-fills, and every suggestion it surfaces, comes from the stored result's
// conversionPayload (the tool's own modeled numbers). The builder opens with these as an EDITABLE
// draft; nothing is live until the artist publishes.
//
// Two truths shaped this, both proven by a builder audit, not assumed:
//   - Two real builders back all five calculators: /offers/new (Membership, the Vault tier, and the
//     referral share step) and /studio/live (a ticketed Live Experience or Executive Producer
//     session). No dedicated Referral/Vault/Live route exists.
//   - Some requested "pre-builds" are NOT draftable fields, so they are carried as SUGGESTIONS, not
//     fake drafts: the full membership ladder (every plan now allows all 3 paid tiers, and the
//     ladder is offered as a suggestion linking to the ladder builder),
//     replay (recording is automatic, gating is post-hoc), tip goals (need a live session, commit
//     immediately, dark-launched), and Vault release cadence (no scheduler exists at all).
//
// prefill_*  -> editable fields the builder hydrates into its draft state.
// suggest_*  -> display-only guidance the CalculatorSuggestions card renders. Never a hidden write.

import type { LeadMagnetSeed } from './handoffSeed';
import { getLeadMagnet } from '@/lib/leadMagnets/registry';
import { adapterPrefill } from '@/lib/leadMagnets/conversionAdapters';

export interface DraftConfig {
  /** The builder route, e.g. '/offers/new'. */
  path: string;
  /** Editable field prefills (lm_* params the builder reads into its draft state). */
  prefill: Record<string, string>;
  /** Display-only suggestions (lm_suggest_* params the suggestions card renders). */
  suggest: Record<string, string>;
}

function positive(v: unknown): number | null {
  return typeof v === 'number' && v > 0 ? v : null;
}

function dollars(cents: number): string {
  return String(Math.round(cents / 100));
}

interface LadderTier {
  name: string;
  priceCents: number;
  projectedSubs: number;
}

/** Encode the suggested ladder compactly for a URL: "Silver:10:120|Gold:25:38". */
function encodeLadder(ladder: LadderTier[]): string {
  return ladder
    .map((t) => `${t.name}:${Math.round(t.priceCents / 100)}:${Math.max(0, Math.floor(t.projectedSubs))}`)
    .join('|');
}

/** Decode what encodeLadder produced. Used by the suggestions card. Tolerant of junk. */
export function decodeLadder(raw: string | null | undefined): { name: string; price: number; subs: number }[] {
  if (!raw) return [];
  return raw
    .split('|')
    .map((seg) => {
      const [name, price, subs] = seg.split(':');
      return { name: name ?? '', price: Number(price) || 0, subs: Number(subs) || 0 };
    })
    .filter((t) => t.name);
}

/**
 * The full draft configuration for a claimed calculator result: which builder, what editable
 * fields to pre-fill, and what to suggest alongside. Returns null for an unmapped calculator so
 * the caller falls back to the dashboard.
 */
export function buildDraftConfig(seed: LeadMagnetSeed): DraftConfig | null {
  const cp = seed.conversionPayload ?? {};

  switch (seed.toolSlug) {
    // Streaming Loss -> Membership. Draft the ENTRY tier (plan-compliant on Free), and suggest the
    // full ladder with the calculator's own projected supporter counts.
    case 'worth': {
      const ladder = Array.isArray(cp.ladder) ? (cp.ladder as LadderTier[]) : [];
      const entry = ladder[0];
      return {
        path: '/build/offer',
        prefill: {
                    lm_tier_name: entry?.name || 'Silver',
          ...(entry ? { lm_price: dollars(entry.priceCents) } : {}),
        },
        suggest: ladder.length ? { lm_suggest_ladder: encodeLadder(ladder) } : {},
      };
    }

    // The unified calculator -> the SAME membership builder Streaming Loss uses, because the
    // coordinated system's phase 1 is always the ladder and nothing else can launch before it.
    // The full ladder rides along as the suggestion, exactly as `worth` does, so the artist sees
    // the whole system they reviewed rather than just the single drafted entry tier.
    //
    // Deliberately NOT fanned out into several builders at once. The growth systems and the
    // premium experience are later phases of the artist's own launch order, and dropping them into
    // four parallel prefilled builders would be the same additive mistake the model exists to
    // avoid, just applied to the artist's attention instead of their money.
    case 'opportunity-calculator': {
      const ladder = Array.isArray(cp.ladder) ? (cp.ladder as LadderTier[]) : [];
      const entry = ladder[0];
      return {
        path: '/build/offer',
        prefill: {
                    lm_tier_name: entry?.name || 'Silver',
          ...(entry ? { lm_price: dollars(entry.priceCents) } : {}),
        },
        suggest: ladder.length ? { lm_suggest_ladder: encodeLadder(ladder) } : {},
      };
    }

    // Fan Stack Consolidation -> the same membership builder as `worth`: the consolidated ladder
    // IS the first offer, drafted at the entry tier with the full ladder as the suggestion.
    case 'fan-stack-calculator': {
      const ladder = Array.isArray(cp.ladder) ? (cp.ladder as LadderTier[]) : [];
      const entry = ladder[0];
      return {
        path: '/build/offer',
        prefill: {
                    lm_tier_name: entry?.name || 'Silver',
          ...(entry ? { lm_price: dollars(entry.priceCents) } : {}),
        },
        suggest: ladder.length ? { lm_suggest_ladder: encodeLadder(ladder) } : {},
      };
    }

    // Between-Tour -> ONE recurring VIP tier (the calculator's Gold rung), drafted directly.
    case 'between-tour-calculator': {
      const price = positive(cp.priceCents);
      return {
        path: '/build/offer',
        prefill: {
                    lm_tier_name: typeof cp.tierName === 'string' ? cp.tierName : 'Gold',
          ...(price ? { lm_price: dollars(price) } : {}),
        },
        suggest: {},
      };
    }

    // Vault Planner -> the Vault tier. Cadence has no scheduler, so it is a suggestion only.
    case 'vault-revenue-planner': {
      const price = positive(cp.priceCents);
      return {
        path: '/build/offer',
        prefill: {
                    lm_tier_name: typeof cp.tierName === 'string' ? cp.tierName : 'Gold',
          ...(price ? { lm_price: dollars(price) } : {}),
        },
        suggest: { lm_suggest_cadence: '1' },
      };
    }

    // Share-to-Earn -> the referral share step, on, at the default rate. Fully draftable.
    case 'share-to-earn-planner': {
      return {
        path: '/account/referrals',
        prefill: { lm_share_on: '1', lm_share_percent: '20' },
        suggest: {},
      };
    }

    // Live Experience -> a ticketed live. Ticket + a limited-audience default are draftable; the
    // tip goal and the auto-record replay are suggestions (neither is a create-time field).
    case 'live-experience-calculator': {
      const price = positive(cp.ticketPriceCents);
      const tip = positive(cp.suggestedTipGoalCents);
      return {
        path: '/studio/live',
        prefill: {
          lm_title: 'Live Experience',
          ...(price ? { lm_ticket_price: dollars(price) } : {}),
        },
        suggest: {
          lm_suggest_replay: '1',
          ...(tip ? { lm_suggest_tip_goal: dollars(tip) } : {}),
        },
      };
    }

    // Executive Producer -> the same live builder: ticket + submissions + a small limited room.
    // Replay is a suggestion.
    case 'executive-producer-session': {
      const price = positive(cp.ticketPriceCents);
      return {
        path: '/studio/live',
        prefill: {
          lm_title: 'Executive Producer Session',
          lm_submissions: cp.acceptsSubmissions ? '1' : '0',
          // A producer session is a limited room, not a stadium. A small, editable default.
          lm_max_slots: '20',
          ...(price ? { lm_ticket_price: dollars(price) } : {}),
        },
        suggest: { lm_suggest_replay: '1' },
      };
    }

    // Own Your Fans -> the authenticated fan-page plan. There is no dedicated builder to prefill;
    // the plan page loads the claimed draft from the DB (under RLS) and resumes the artist at the
    // exact step, then routes real publishing into the ownership-gated fan surface.
    case 'own-your-fans-calculator': {
      return { path: '/own-your-fans/plan', prefill: {}, suggest: {} };
    }

    // Fan Mission -> the real Fan Missions builder (/missions/new), prefilled from the SAME conversion
    // adapter the same-session flow uses. Non-financial, non-ownership; the builder owns its own
    // validation and submit. Formula/output untouched; this only routes + prefills.
    case 'fan-mission-generator': {
      return liveFeatureDraft(seed.toolSlug, cp);
    }

    // Proof of Demand -> the real, money-free demand-test builder (/proof-of-demand/new). It never
    // charges a fan; same adapter-driven prefill, same honest scope.
    case 'proof-of-demand-test-builder': {
      return liveFeatureDraft(seed.toolSlug, cp);
    }

    default:
      return null;
  }
}

/**
 * Draft config for a `live_feature` tool: route to the tool's existing builder and prefill via its
 * registered conversion adapter (the identical mapping a same-session conversion uses). Returns null
 * if the tool is not a live-feature tool (so it safely falls back to the dashboard). Deliberately
 * per-tool (called from explicit cases), so economics-sensitive live-feature tools like Clip-to-Earn
 * are NOT auto-onboarded.
 */
function liveFeatureDraft(slug: string, cp: Record<string, unknown>): DraftConfig | null {
  const cfg = getLeadMagnet(slug);
  const route = cfg?.conversionTarget.route;
  const adapterKey = cfg?.conversionTarget.adapterKey;
  if (!route || !adapterKey) return null;
  return { path: route, prefill: adapterPrefill(adapterKey, cp), suggest: {} };
}

export interface PostSetupDestination {
  path: string;
  params: Record<string, string>;
}

/** Resolve the builder destination + all lm_* params (prefill + suggestions + banner) for a seed. */
export function postSetupDestination(seed: LeadMagnetSeed): PostSetupDestination | null {
  const cfg = buildDraftConfig(seed);
  if (!cfg) return null;
  return {
    path: cfg.path,
    params: {
      lm_prefill: '1',
      lm_tool: seed.toolSlug,
      lm_tool_name: seed.toolName,
      lm_result: seed.resultId,
      ...cfg.prefill,
      ...cfg.suggest,
    },
  };
}

/** Serialize a destination to a relative URL the client can push to. */
export function destinationToUrl(dest: PostSetupDestination): string {
  const qs = new URLSearchParams(dest.params).toString();
  return `${dest.path}?${qs}`;
}
