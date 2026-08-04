// Deterministic sub-avatar assignment. No model, no LLM, no guessing.
//
// Every avatar now shares ONE calculator, so which tool the artist ran can no longer tell them
// apart. Assignment is therefore built on the ANSWERS they typed, the entry context they arrived
// through, and what their account contains. It is a pure, explainable scorer: every point of
// score is paired with a human-readable evidence line, so any assignment can be read back and
// disagreed with. Below the evidence floor there is NO assignment: an unmapped lead is honestly
// unmapped, and cohort reports count them as unassigned rather than inventing a segment.
//
// TWO QUESTIONS, TWO ANSWERS, NEVER MERGED:
//  - deriveAcquisitionAvatar(entryContexts) is WHICH CONTENT BROUGHT THEM: the avatar whose link
//    they first clicked. It is a pure function of permanent data, so it needs no storage and can
//    never be overwritten by later behavior. This is the cohort key for acquisition decisions.
//  - assignSubAvatar(evidence) is WHO THEY APPEAR TO BE now, over all evidence including
//    behavior. Reported beside the acquisition avatar, never merged into it.
//
// Overlap is real (a large R&B seller qualifies as both an R&B Empire Builder and a highest
// priority lead), so exactly ONE primary is assigned and ties break by the precedence order
// declared in taxonomy.ts. That keeps cohorts disjoint, which is what makes any comparison
// between them mean anything.

import {
  ENTRY_CONTEXT_INPUT_KEY,
  SUB_AVATAR_PRECEDENCE,
  SUB_AVATAR_TAXONOMY_VERSION,
  type GenreFamily,
  type SubAvatarId,
  entryContextToSubAvatar,
  genreFamilyOf,
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
 * Everything the scorer may look at. All fields optional and nullable: callers assemble whatever
 * they have, and a missing fact is silence, never a zero (the same null discipline as the
 * Constraint Engine). Entry contexts are OLDEST FIRST so index 0 is the acquisition path.
 */
export interface SubAvatarEvidence {
  /** `?from=` values the artist arrived through, oldest first. */
  entryContexts?: (string | null)[] | null;
  /** Picked or typed genre. Mapped to a family; anything unrecognized is `other`. */
  genre?: string | null;
  genreFamily?: GenreFamily | null;
  /** The larger platform figure, never a sum. */
  audience?: number | null;
  /** `direct_established | direct_some | merch_only | streaming_only | none`. */
  monetizationStatus?: string | null;
  /** Fans already paying them directly, anywhere. */
  currentSupporters?: number | null;
  /** What that earns per month, in cents. */
  directRevenueCents?: number | null;
  /** Platforms they say they run today. */
  platformsUsed?: string[] | null;
  /** Unreleased songs, demos and voice notes. */
  unreleasedCount?: number | null;
  /** Released catalog size, when known. */
  catalogSize?: number | null;
  /** Years releasing, when known (lead profile only; the calculator does not ask). */
  yearsReleasing?: number | null;
  /** `lots | some | none`. */
  videoOutput?: string | null;
  /** `already | would | unlikely`. */
  fansPromote?: string | null;
  /** `yes | maybe | no`. */
  liveWilling?: string | null;
  /** Behavioral: live sessions actually hosted on CRWN. */
  liveSessionsHosted?: number | null;
  /** Behavioral: member-gated (non-free) tracks in the catalog. */
  gatedTracks?: number | null;
  /** Behavioral: the artist imported Patreon-tagged contacts. */
  patreonImported?: boolean | null;
  /** Stored manual override (artist_profiles.sub_avatar_override). Wins outright when valid. */
  manualOverride?: string | null;
}

interface ScoreLine {
  avatar: SubAvatarId;
  points: number;
  line: string;
  source: Exclude<AssignmentSource, 'manual'>;
}

// ICP Tier 1 floor (docs/ICP.md). The one place these numbers appear in the avatar layer.
const TIER1_AUDIENCE = 250_000;
const TIER1_CATALOG = 40;
const ESTABLISHED_YEARS = 3;
/** Monthly direct revenue that marks a real income stream rather than an experiment. Cents. */
const REAL_INCOME_CENTS = 100_000;
const REAL_SUPPORTER_COUNT = 25;

const n = (v: number | null | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const hasSoldDirect = (status: string | null | undefined): boolean =>
  status === 'direct_established' || status === 'direct_some';

/** The acquisition avatar: the oldest entry context that names one. Pure, storage-free. */
export function deriveAcquisitionAvatar(entryContextsOldestFirst: (string | null)[] | null | undefined): SubAvatarId | null {
  for (const ctx of entryContextsOldestFirst ?? []) {
    const a = entryContextToSubAvatar(ctx);
    if (a) return a;
  }
  return null;
}

/** Resolve the genre family from either the picked family or a typed genre. */
export function resolveGenreFamily(e: SubAvatarEvidence): GenreFamily {
  if (e.genreFamily === 'hiphop' || e.genreFamily === 'rnb' || e.genreFamily === 'other') return e.genreFamily;
  return genreFamilyOf(e.genre);
}

/** Every score line the evidence supports. Exported for tests and the admin explain view. */
export function scoreEvidence(e: SubAvatarEvidence): ScoreLine[] {
  const lines: ScoreLine[] = [];
  const push = (avatar: SubAvatarId, points: number, line: string, source: ScoreLine['source']) =>
    lines.push({ avatar, points, line, source });

  // 1. Acquisition path: the avatar whose link they clicked. A strong DECLARED signal, but
  // deliberately not decisive, so answers that plainly disagree can outvote the hypothesis the
  // content made about them.
  const acq = deriveAcquisitionAvatar(e.entryContexts);
  if (acq) {
    push(acq, 3, `Entered through the ${getSubAvatar(acq)!.label} funnel`, 'acquisition_path');
  }

  // 2. Highest Priority Empire Builder: the ICP Tier 1 bar, which is audience AND proven sales.
  const audience = n(e.audience);
  const sold = hasSoldDirect(e.monetizationStatus);
  if (audience >= TIER1_AUDIENCE && sold) {
    push(
      'highest_priority_empire_builder',
      3,
      `${audience.toLocaleString('en-US')} audience and a proven history of selling directly`,
      'declared',
    );
  } else if (audience >= TIER1_AUDIENCE) {
    push('highest_priority_empire_builder', 1, `${audience.toLocaleString('en-US')} audience`, 'declared');
  }
  if (e.monetizationStatus === 'direct_established') {
    push('highest_priority_empire_builder', 2, 'Direct-to-fan sales are already a real income stream', 'declared');
  }
  if (n(e.currentSupporters) >= REAL_SUPPORTER_COUNT || n(e.directRevenueCents) >= REAL_INCOME_CENTS) {
    const detail =
      n(e.currentSupporters) >= REAL_SUPPORTER_COUNT
        ? `${n(e.currentSupporters).toLocaleString('en-US')} fans already paying them directly`
        : `about $${Math.round(n(e.directRevenueCents) / 100).toLocaleString('en-US')} a month already coming direct`;
    push('highest_priority_empire_builder', 2, detail, 'declared');
  }

  // 3. Established Independent Minded Operator: longevity, catalog depth, and a self-run stack.
  if (sold) {
    push('established_independent_operator', 2, 'Has sold directly to fans without a label doing it', 'declared');
  }
  const platforms = (e.platformsUsed ?? []).filter(Boolean);
  if (platforms.length >= 2) {
    push(
      'established_independent_operator',
      2,
      `Runs ${platforms.length} platforms themselves (${platforms.slice(0, 4).join(', ')}${platforms.length > 4 ? ', ...' : ''})`,
      'declared',
    );
  }
  if (n(e.yearsReleasing) >= ESTABLISHED_YEARS || n(e.catalogSize) >= TIER1_CATALOG) {
    const detail =
      n(e.yearsReleasing) >= ESTABLISHED_YEARS
        ? `${n(e.yearsReleasing)} years of releases`
        : `${n(e.catalogSize)} released songs`;
    push('established_independent_operator', 2, detail, 'declared');
  }
  if (n(e.unreleasedCount) >= 10) {
    push('established_independent_operator', 1, `${n(e.unreleasedCount)} unreleased pieces already in hand`, 'declared');
  }

  // 4. Brand-Led Hip-Hop Artist: the genre plus an actual content engine. Genre alone is not
  // enough to call someone brand-led, so the content signal is what makes this assignable.
  const family = resolveGenreFamily(e);
  if (family === 'hiphop') {
    push('brand_led_hip_hop_artist', 2, 'Hip-hop artist', 'declared');
  }
  if (e.videoOutput === 'lots') {
    push('brand_led_hip_hop_artist', 2, 'Puts out video or goes live often', 'declared');
  } else if (e.videoOutput === 'some') {
    push('brand_led_hip_hop_artist', 1, 'Puts out some video', 'declared');
  }
  if (e.fansPromote === 'already' || e.fansPromote === 'would') {
    push('brand_led_hip_hop_artist', 1, 'Fans already promote them, or would', 'declared');
  }

  // 5. R&B Empire Builder: the genre plus the depth inventory that rewards devoted fans.
  if (family === 'rnb') {
    push('rnb_empire_builder', 2, 'R&B or soul artist', 'declared');
  }
  if (n(e.unreleasedCount) >= 10) {
    push('rnb_empire_builder', 2, `${n(e.unreleasedCount)} unreleased pieces to go deeper with`, 'declared');
  }
  if (n(e.currentSupporters) > 0) {
    push('rnb_empire_builder', 1, 'Already has fans paying for closeness', 'declared');
  }
  if (e.liveWilling === 'yes') {
    push('rnb_empire_builder', 1, 'Willing to host live sessions for fans', 'declared');
  }

  // 6. Behavioral: what the CRWN account actually contains.
  if (e.patreonImported === true) {
    push('established_independent_operator', 2, 'Imported a Patreon member list into CRWN', 'behavioral');
  }
  if (n(e.liveSessionsHosted) >= 2) {
    push('brand_led_hip_hop_artist', 1, `Hosted ${n(e.liveSessionsHosted)} live sessions on CRWN`, 'behavioral');
    push('rnb_empire_builder', 1, `Hosted ${n(e.liveSessionsHosted)} live sessions on CRWN`, 'behavioral');
  }
  if (n(e.gatedTracks) >= 5) {
    push('rnb_empire_builder', 2, `${n(e.gatedTracks)} member-gated tracks in the CRWN catalog`, 'behavioral');
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

  // Winner: highest total, ties broken by the precedence order declared in taxonomy.ts. That
  // order is a founder decision, and it is the reason these overlapping segments still produce
  // disjoint cohorts.
  const ranked = [...totals.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return SUB_AVATAR_PRECEDENCE[a[0]] - SUB_AVATAR_PRECEDENCE[b[0]];
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

  const confidence: AssignmentConfidence = primaryScore >= 6 ? 'high' : primaryScore >= 4 ? 'medium' : 'low';

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
 * Pull avatar evidence out of a stored calculator result's input_data. Tolerant of any shape:
 * unknown keys are ignored, wrong types read as absent. Keys match the input definitions in the
 * lead-magnet registry (chiefly the all-in-one calculator, plus the single-opportunity tools that
 * still ask their own questions).
 */
export function evidenceFromInputs(inputData: Record<string, unknown> | null | undefined): Partial<SubAvatarEvidence> {
  const d = inputData ?? {};
  const num = (k: string): number | null => (typeof d[k] === 'number' && Number.isFinite(d[k] as number) ? (d[k] as number) : null);
  const str = (k: string): string | null => (typeof d[k] === 'string' && d[k] ? (d[k] as string) : null);
  const arr = (k: string): string[] | null => (Array.isArray(d[k]) ? (d[k] as unknown[]).map(String) : null);

  const followers = num('social_followers');
  const listeners = num('monthly_listeners');
  const audience = followers !== null || listeners !== null ? Math.max(followers ?? 0, listeners ?? 0) : null;

  const storedEntry = str(ENTRY_CONTEXT_INPUT_KEY);

  return {
    // Provenance stored beside the answers by the capture route: which avatar funnel brought them.
    entryContexts: entryContextToSubAvatar(storedEntry) ? [storedEntry] : null,
    genreFamily: (() => {
      const fam = str('genre_family');
      return fam === 'hiphop' || fam === 'rnb' || fam === 'other' ? fam : null;
    })(),
    genre: str('genre'),
    audience,
    monetizationStatus: str('monetization_status'),
    currentSupporters: num('current_supporters') ?? num('supporterCount'),
    directRevenueCents: num('direct_fan_revenue_cents'),
    platformsUsed: arr('platforms_used'),
    unreleasedCount: num('unreleased_count') ?? num('unreleasedSongs'),
    catalogSize: num('catalog_size'),
    yearsReleasing: num('years_releasing'),
    videoOutput: str('video_output'),
    fansPromote: str('fans_promote'),
    liveWilling: str('live_willing'),
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
