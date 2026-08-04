// Deterministic sub-avatar assignment. No model, no LLM, no guessing.
//
// A pure, explainable scorer over evidence CRWN already collects: which calculators a lead ran
// (acquisition path), what they declared inside them (platforms, shows, unreleased count, live
// willingness), and what their account actually contains after launch (behavioral). Every point
// of score is paired with a human-readable evidence line, so any assignment can be read back and
// disagreed with. Below the evidence floor there is NO assignment, not a low-confidence guess:
// an unmapped lead is honestly unmapped, and cohort reports count them as unassigned.
//
// The ORIGINAL ACQUISITION AVATAR is never overwritten by later behavior. It is a pure function
// of the oldest claimed calculator result (deriveAcquisitionAvatar), which is permanent data, so
// it needs no storage and cannot drift. The CURRENT OBSERVED AVATAR is assignSubAvatar over all
// evidence including behavior. The two are reported side by side, never merged.

import {
  SUB_AVATAR_TAXONOMY_VERSION,
  type SubAvatarId,
  calculatorToSubAvatar,
  getSubAvatar,
  isSubAvatarId,
} from './taxonomy';

export type AssignmentSource = 'declared' | 'acquisition_path' | 'behavioral' | 'manual';
export type AssignmentConfidence = 'high' | 'medium' | 'low';

export interface SubAvatarAssignment {
  primarySubAvatar: SubAvatarId;
  secondarySubAvatar?: SubAvatarId;
  taxonomyVersion: string;
  confidence: AssignmentConfidence;
  evidence: string[];
  source: AssignmentSource;
}

/**
 * Everything the scorer may look at. All fields optional and nullable: routes assemble whatever
 * they have, and a missing fact is silence, never a zero (same null discipline as the Constraint
 * Engine). Calculator slugs are OLDEST FIRST so index 0 is the acquisition path.
 */
export interface SubAvatarEvidence {
  /** tool_slug of every claimed calculator result, oldest first. */
  claimedCalculatorSlugs?: string[] | null;
  /** Declared stack: platforms the artist says they run today (fan-stack calculator input). */
  platformsUsed?: string[] | null;
  /** Declared: paying members on other platforms today. */
  paidMembersElsewhere?: number | null;
  /** Declared: shows or tour dates per year (between-tour calculator input). */
  showsPerYear?: number | null;
  /** Declared: VIP buyers per show. */
  vipBuyersPerShow?: number | null;
  /** Declared: 'yes' | 'maybe' | 'no' (opportunity calculator live_willing). */
  liveWilling?: string | null;
  /** Declared: 'lots' | 'some' | 'none' (opportunity calculator video_output). */
  videoOutput?: string | null;
  /** Declared: unreleased songs / demos / voice notes. */
  unreleasedCount?: number | null;
  /** Behavioral: the artist imported Patreon-tagged contacts. */
  patreonImported?: boolean | null;
  /** Behavioral: live sessions actually hosted on CRWN. */
  liveSessionsHosted?: number | null;
  /** Behavioral: member-gated (non-free) tracks in the catalog. */
  gatedTracks?: number | null;
  /** Stored manual override (artist_profiles.sub_avatar_override). Wins outright when valid. */
  manualOverride?: string | null;
}

interface ScoreLine {
  avatar: SubAvatarId;
  points: number;
  line: string;
  source: Exclude<AssignmentSource, 'manual'>;
}

const n = (v: number | null | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** The acquisition avatar: the oldest claimed calculator that maps to one. Pure, storage-free. */
export function deriveAcquisitionAvatar(claimedCalculatorSlugsOldestFirst: string[] | null | undefined): SubAvatarId | null {
  for (const slug of claimedCalculatorSlugsOldestFirst ?? []) {
    const a = calculatorToSubAvatar(slug);
    if (a) return a;
  }
  return null;
}

/** Every score line the evidence supports. Exported for tests and for the admin explain view. */
export function scoreEvidence(e: SubAvatarEvidence): ScoreLine[] {
  const lines: ScoreLine[] = [];
  const push = (avatar: SubAvatarId, points: number, line: string, source: ScoreLine['source']) =>
    lines.push({ avatar, points, line, source });

  // Acquisition path: the calculators they chose to run. The FIRST mapped one is the strongest
  // single signal in the system (they self-selected into that pain), later ones still count.
  const slugs = e.claimedCalculatorSlugs ?? [];
  let firstMapped = true;
  for (const slug of slugs) {
    const a = calculatorToSubAvatar(slug);
    if (!a) continue;
    const def = getSubAvatar(a)!;
    if (firstMapped) {
      push(a, 3, `Entered through the ${def.label} funnel (ran ${slug} first)`, 'acquisition_path');
      firstMapped = false;
    } else {
      push(a, 2, `Also ran ${slug}`, 'acquisition_path');
    }
  }

  // Declared facts, from calculator inputs the lead typed themselves.
  const platforms = (e.platformsUsed ?? []).filter(Boolean);
  if (platforms.length >= 2) {
    push(
      'membership_stack_consolidator',
      2,
      `Runs ${platforms.length} separate platforms today (${platforms.slice(0, 4).join(', ')}${platforms.length > 4 ? ', ...' : ''})`,
      'declared',
    );
  }
  if (n(e.paidMembersElsewhere) > 0) {
    push(
      'membership_stack_consolidator',
      1,
      `${n(e.paidMembersElsewhere).toLocaleString('en-US')} paying members on other platforms already`,
      'declared',
    );
  }
  if (n(e.showsPerYear) >= 4) {
    push('touring_access_seller', 2, `Plays ${n(e.showsPerYear)} shows a year`, 'declared');
  }
  if (n(e.vipBuyersPerShow) > 0) {
    push('touring_access_seller', 1, `Sells VIP at shows (${n(e.vipBuyersPerShow)} buyers per show)`, 'declared');
  }
  if (e.liveWilling === 'yes') {
    push('live_community_creator', 1, 'Willing to run a monthly live for fans', 'declared');
  }
  if (e.videoOutput === 'lots') {
    push('live_community_creator', 1, 'Already on camera or live often', 'declared');
  }
  if (n(e.unreleasedCount) >= 10) {
    push('catalog_vault_seller', 2, `${n(e.unreleasedCount)} unreleased pieces sitting in the catalog`, 'declared');
  } else if (n(e.unreleasedCount) >= 5) {
    push('catalog_vault_seller', 1, `${n(e.unreleasedCount)} unreleased pieces sitting in the catalog`, 'declared');
  }

  // Behavioral facts, from what the account actually contains.
  if (e.patreonImported === true) {
    push('membership_stack_consolidator', 2, 'Imported a Patreon member list into CRWN', 'behavioral');
  }
  if (n(e.liveSessionsHosted) >= 2) {
    push('live_community_creator', 2, `Hosted ${n(e.liveSessionsHosted)} live sessions on CRWN`, 'behavioral');
  }
  if (n(e.gatedTracks) >= 5) {
    push('catalog_vault_seller', 2, `${n(e.gatedTracks)} member-gated tracks in the CRWN catalog`, 'behavioral');
  }

  return lines;
}

/**
 * The deterministic assignment. Returns null when the evidence does not support ANY avatar:
 * an honest "unassigned" beats a fabricated cohort member. A valid manual override wins outright.
 */
export function assignSubAvatar(e: SubAvatarEvidence): SubAvatarAssignment | null {
  if (e.manualOverride && isSubAvatarId(e.manualOverride)) {
    return {
      primarySubAvatar: e.manualOverride,
      taxonomyVersion: SUB_AVATAR_TAXONOMY_VERSION,
      confidence: 'high',
      evidence: ['Manual override set by an authorized user'],
      source: 'manual',
    };
  }

  const lines = scoreEvidence(e);
  if (!lines.length) return null;

  const totals = new Map<SubAvatarId, number>();
  for (const l of lines) totals.set(l.avatar, (totals.get(l.avatar) ?? 0) + l.points);

  // Winner: highest total. Tie-break: the acquisition-path avatar (they chose that funnel), then
  // the order evidence first appeared (stable and deterministic).
  const acqAvatar = deriveAcquisitionAvatar(e.claimedCalculatorSlugs);
  const ranked = [...totals.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    if (a[0] === acqAvatar) return -1;
    if (b[0] === acqAvatar) return 1;
    return lines.findIndex((l) => l.avatar === a[0]) - lines.findIndex((l) => l.avatar === b[0]);
  });

  const [primary, primaryScore] = ranked[0];
  if (primaryScore < 2) return null; // one weak signal is not an assignment

  const runnerUp = ranked.find(([a, s]) => a !== primary && s >= 2);

  const primaryLines = lines.filter((l) => l.avatar === primary);
  const sources = new Set(primaryLines.map((l) => l.source));
  const source: AssignmentSource = sources.has('acquisition_path')
    ? 'acquisition_path'
    : sources.has('declared')
      ? 'declared'
      : 'behavioral';

  const confidence: AssignmentConfidence =
    primaryScore >= 4 ? 'high' : primaryScore >= 3 ? 'medium' : 'low';

  return {
    primarySubAvatar: primary,
    ...(runnerUp ? { secondarySubAvatar: runnerUp[0] } : {}),
    taxonomyVersion: SUB_AVATAR_TAXONOMY_VERSION,
    confidence,
    evidence: primaryLines.map((l) => l.line),
    source,
  };
}

/**
 * Pull declared avatar evidence out of a stored calculator result's input_data. Tolerant of any
 * shape: unknown keys are ignored, wrong types read as absent. Keys match the calculator input
 * definitions in the lead-magnet registry.
 */
export function evidenceFromInputs(inputData: Record<string, unknown> | null | undefined): Partial<SubAvatarEvidence> {
  const d = inputData ?? {};
  const num = (k: string): number | null => (typeof d[k] === 'number' && Number.isFinite(d[k] as number) ? (d[k] as number) : null);
  const str = (k: string): string | null => (typeof d[k] === 'string' && d[k] ? (d[k] as string) : null);
  const arr = (k: string): string[] | null => (Array.isArray(d[k]) ? (d[k] as unknown[]).map(String) : null);
  return {
    platformsUsed: arr('platforms_used'),
    paidMembersElsewhere: num('paid_members_elsewhere'),
    showsPerYear: num('shows_per_year'),
    vipBuyersPerShow: num('vip_buyers_per_show'),
    liveWilling: str('live_willing'),
    videoOutput: str('video_output'),
    unreleasedCount: num('unreleased_count') ?? num('unreleasedSongs'),
  };
}

/** Merge evidence fragments; later fragments win only where the earlier one is silent. */
export function mergeEvidence(...parts: Partial<SubAvatarEvidence>[]): SubAvatarEvidence {
  const out: SubAvatarEvidence = {};
  for (const p of parts) {
    for (const [k, v] of Object.entries(p)) {
      if (v === null || v === undefined) continue;
      const key = k as keyof SubAvatarEvidence;
      if (out[key] === null || out[key] === undefined) (out as Record<string, unknown>)[key] = v;
    }
  }
  return out;
}
