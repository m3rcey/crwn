// The canonical field registry. This is a SECURITY BOUNDARY, not a convenience.
//
// Claude returns `extractedFields: Record<string, unknown>`. Anything in that object whose
// key is not registered here — or is registered with aiExtractable=false — is DROPPED, not
// applied. That is the mechanism that makes "Claude cannot invent your revenue" true in code
// rather than true in a prompt.
//
// Adding a field here grants Claude the ability to write it. Think before you add one.

import type { FieldSource, QuestionInputType } from './types';

export type FieldType = 'string' | 'integer' | 'cents' | 'enum' | 'boolean';

export interface FieldDefinition {
  key: string;
  type: FieldType;
  /** The lead_profiles column this maps to. Null = live in `extra` jsonb. */
  column: string | null;
  label: string;
  /**
   * May Claude write this field from free-form text?
   *
   * FALSE for every money field. A monetary value only enters the profile when the artist
   * typed it into a structured currency question (direct_answer) or a deterministic
   * calculator derived it. "I make like two grand a month maybe" is not a number we will
   * put in a database and then multiply by twelve.
   */
  aiExtractable: boolean;
  /** The question we ask when this field is missing and required. */
  question?: string;
  /**
   * What we ask on a RE-ask, after the first answer could not be read.
   *
   * "About how many monthly listeners?" answered with "honestly not that many" is
   * unparseable, and repeating the identical question at someone is how a bot loses a human.
   * A hint with a concrete example converts most of these on the second try.
   */
  retryHint?: string;
  inputType?: QuestionInputType;
  /** enum only */
  values?: string[];
  /**
   * enum only. Ordered natural-language rules, tried BEFORE we spend a Claude call.
   *
   * A DM answer is a sentence, not an enum value ("yeah, patreon and some merch"), so a bare
   * enum match resolves almost nothing: every lead would cost a model call, and a miss burns
   * one of the three retries that hand the artist to a human. First match wins, so these are
   * ordered most-specific first.
   */
  aliasPatterns?: { pattern: RegExp; value: string }[];
  /** integer/cents only. Values outside are rejected, not clamped silently. */
  min?: number;
  max?: number;
  /** Minimum Claude confidence before we apply an extracted value. */
  minConfidence?: number;
}

// A sanity ceiling. 100M monthly listeners is larger than the biggest artist on Spotify;
// anything above it is a typo or an injection attempt, and we reject rather than store.
const MAX_AUDIENCE = 100_000_000;
const MAX_CENTS = 1_000_000_00; // $1M/mo

export const CAREER_STAGES = ['just_starting', 'building', 'established', 'professional'] as const;
export const ARTIST_SEGMENTS = ['hobbyist', 'emerging', 'independent_pro', 'label_backed'] as const;
export const PRIMARY_BLOCKERS = [
  'no_audience',
  'audience_wont_pay',
  'no_time',
  'no_product',
  'no_direction',
  'platform_dependency',
  'pricing_uncertainty',
] as const;
export const PRIMARY_GOALS = [
  'make_first_dollar',
  'replace_day_job',
  'grow_audience',
  'launch_release',
  'own_my_fanbase',
  'scale_existing_revenue',
] as const;
export const MONETIZATION_STATUS = ['none', 'streaming_only', 'merch_only', 'direct_some', 'direct_established'] as const;
export const TEAM_STATUS = ['solo', 'small_team', 'management', 'label'] as const;
export const PURCHASE_INTENT = ['unknown', 'low', 'medium', 'high'] as const;
export const FAN_OWNERSHIP_MATURITY = ['none', 'social_only', 'partial_list', 'owned_list'] as const;
// Engagement is 20% of the customer avatar and outranks raw follower count: a dead 2M is worth
// less than an active 200k. See docs/ICP.md.
export const ENGAGEMENT_LEVELS = ['low', 'moderate', 'high'] as const;

export const FIELD_REGISTRY: Record<string, FieldDefinition> = {
  // ---- identity ----
  artist_name: {
    key: 'artist_name',
    type: 'string',
    column: 'artist_name',
    label: 'Artist name',
    aiExtractable: true,
    question: 'What name do you release music under?',
    inputType: 'text',
    minConfidence: 0.6,
  },
  genre: {
    key: 'genre',
    type: 'string',
    column: 'genre',
    label: 'Genre',
    aiExtractable: true,
    question: 'What genre best describes your music?',
    inputType: 'text',
    minConfidence: 0.6,
  },

  // ---- audience metrics (Claude MAY extract; these are counts, not money) ----
  monthly_listeners: {
    key: 'monthly_listeners',
    type: 'integer',
    column: 'monthly_listeners',
    label: 'Monthly listeners',
    aiExtractable: true,
    question: 'About how many monthly listeners do you have right now?',
    retryHint: 'Just a rough number is fine. Something like 500, or 40k. Whatever Spotify says.',
    inputType: 'number',
    min: 0,
    max: MAX_AUDIENCE,
    minConfidence: 0.7,
  },
  social_followers: {
    key: 'social_followers',
    type: 'integer',
    column: 'social_followers',
    label: 'Social followers',
    aiExtractable: true,
    question: 'Roughly how many followers do you have across your socials?',
    retryHint: 'A ballpark number works. Something like 1200, or 15k.',
    inputType: 'number',
    min: 0,
    max: MAX_AUDIENCE,
    minConfidence: 0.7,
  },
  email_list_size: {
    key: 'email_list_size',
    type: 'integer',
    column: 'email_list_size',
    label: 'Email list size',
    aiExtractable: true,
    question: 'How many fans are on your email list? (0 is a real answer)',
    retryHint: 'A number is all I need. If you do not have a list yet, just say 0.',
    inputType: 'number',
    min: 0,
    max: MAX_AUDIENCE,
    minConfidence: 0.7,
  },
  phone_list_size: {
    key: 'phone_list_size',
    type: 'integer',
    column: 'phone_list_size',
    label: 'SMS list size',
    aiExtractable: true,
    min: 0,
    max: MAX_AUDIENCE,
    minConfidence: 0.7,
  },
  // The ONLY tool that asks catalog_size is the Vault, which runs on UNRELEASED material, so the
  // question asks about the vault, not the released catalog. The value is stored in the
  // catalog_size column (legacy name) and the Vault adapter maps it straight to unreleasedSongs.
  // leadScoring reads it as a "depth of material" signal, which unreleased tracks satisfy fine.
  catalog_size: {
    key: 'catalog_size',
    type: 'integer',
    column: 'catalog_size',
    label: 'Unreleased songs',
    aiExtractable: true,
    question: 'How many unreleased songs, demos, and ideas are sitting in your vault?',
    retryHint: 'A rough count is fine: tracks you have not put out yet, demos, voice memos, unfinished ideas.',
    inputType: 'number',
    min: 0,
    max: 100_000,
    minConfidence: 0.7,
  },
  album_count: {
    key: 'album_count',
    type: 'integer',
    column: 'album_count',
    label: 'Albums released',
    aiExtractable: true,
    min: 0,
    max: 1_000,
    minConfidence: 0.7,
  },
  song_count: {
    key: 'song_count',
    type: 'integer',
    column: 'song_count',
    label: 'Songs released',
    aiExtractable: true,
    min: 0,
    max: 100_000,
    minConfidence: 0.7,
  },

  // ---- Avatar fields (docs/ICP.md). Stored in `extra` jsonb: column null, no migration. ----
  //
  // Engagement is 20% of the avatar's weighting and CRWN was collecting nothing for it, so
  // every lead scored zero on a fifth of the model. Years releasing is the avatar's 3-year hard
  // filter. Existing platforms is the wedge itself: the ideal customer already sells on Patreon,
  // Shopify, Discord, Gumroad, Kajabi or Eventbrite, and CRWN's pitch to them is consolidation.
  engagement_level: {
    key: 'engagement_level',
    type: 'enum',
    column: null,
    label: 'Fan engagement',
    aiExtractable: true,
    question: 'When you post, do your fans actually show up? (comments, DMs, people on live)',
    retryHint: 'Roughly: is it quiet, steady, or do they flood the comments every time?',
    values: [...ENGAGEMENT_LEVELS],
    minConfidence: 0.6,
  },
  years_releasing: {
    key: 'years_releasing',
    type: 'integer',
    column: null,
    label: 'Years releasing music',
    aiExtractable: true,
    question: 'How long have you been putting music out?',
    retryHint: 'A number of years is fine, even a rough one.',
    inputType: 'number',
    min: 0,
    max: 60,
    minConfidence: 0.7,
  },
  existing_platforms: {
    key: 'existing_platforms',
    type: 'string',
    column: null,
    label: 'Where they already sell',
    aiExtractable: true,
    question: 'Where do you sell to fans today? (Patreon, Shopify, Discord, Bandcamp, anywhere)',
    retryHint: 'Just name the tools you use, or say none if fans cannot buy from you yet.',
    minConfidence: 0.6,
  },

  // ---- MONEY. aiExtractable: false, every one of them. ----
  // These reach the profile ONLY from a structured currency input the artist typed, or
  // from a deterministic calculator. Claude has no path to write them. See the module
  // header: this is the difference between an estimate and a fabrication.
  direct_fan_revenue_cents: {
    key: 'direct_fan_revenue_cents',
    type: 'cents',
    column: 'direct_fan_revenue_cents',
    label: 'Current direct-fan revenue (monthly)',
    aiExtractable: false,
    question: 'About how much do you earn per month directly from fans right now? (dollars)',
    inputType: 'number',
    min: 0,
    max: MAX_CENTS,
  },
  streaming_revenue_cents: {
    key: 'streaming_revenue_cents',
    type: 'cents',
    column: 'streaming_revenue_cents',
    label: 'Monthly streaming revenue',
    aiExtractable: false,
    question: 'About how much do you earn per month from streaming? (dollars)',
    inputType: 'number',
    min: 0,
    max: MAX_CENTS,
  },

  // ---- qualitative (Claude's actual job) ----
  primary_goal: {
    key: 'primary_goal',
    type: 'enum',
    column: 'primary_goal',
    label: 'Primary goal',
    aiExtractable: true,
    question: 'What are you actually trying to do in the next 90 days?',
    inputType: 'text',
    values: [...PRIMARY_GOALS],
    minConfidence: 0.6,
  },
  primary_blocker: {
    key: 'primary_blocker',
    type: 'enum',
    column: 'primary_blocker',
    label: 'Primary blocker',
    aiExtractable: true,
    question: 'What is the single biggest thing standing in your way right now?',
    inputType: 'text',
    values: [...PRIMARY_BLOCKERS],
    minConfidence: 0.6,
  },
  career_stage: {
    key: 'career_stage',
    type: 'enum',
    column: 'career_stage',
    label: 'Career stage',
    aiExtractable: true,
    values: [...CAREER_STAGES],
    minConfidence: 0.6,
  },
  artist_segment: {
    key: 'artist_segment',
    type: 'enum',
    column: 'artist_segment',
    label: 'Artist segment',
    aiExtractable: true,
    values: [...ARTIST_SEGMENTS],
    minConfidence: 0.6,
  },
  // THE 40% QUESTION, and the one that decides how a lead gets handled.
  //
  // leadScoring weights direct monetization history at 40 of 100, ahead of audience at 25, and
  // caps the whole fit at 60 with `monetization_unknown` when it was never answered. A lead who
  // is never asked this therefore CANNOT reach `sales_priority`: the band that alerts the founder
  // (rescore.ts) and the band `decideCallRequest` requires before a call request is anything more
  // than a stored row. Every WEB calculator has asked it since the avatar landed
  // (DIRECT_SALES_INPUT in leadMagnets/registry.ts). The DM asked a follower count and stopped,
  // so the highest-intent channel CRWN has was producing its least qualified leads.
  //
  // Copy carries examples because a DM answer is typed, not tapped off a dropdown.
  monetization_status: {
    key: 'monetization_status',
    type: 'enum',
    column: 'monetization_status',
    label: 'Monetization status',
    aiExtractable: true,
    question:
      'Last one: have your fans ever paid you directly? Patreon, a membership, merch, tickets, beats, a VIP thing, anything counts.',
    retryHint:
      'Whichever is closest: yes regularly, yes a few times, merch or tickets only, or streaming only so far.',
    inputType: 'text',
    values: [...MONETIZATION_STATUS],
    aliasPatterns: [
      // Ordered on purpose. A cadence word beats a platform name, a platform name beats merch,
      // and the bare yes/no rules come LAST so "no, just merch" lands on merch_only and
      // "nah, only streaming" lands on streaming_only instead of both collapsing to none.
      {
        pattern: /\b(regularly|every month|monthly|all the time|consistently|income stream|main income|full[- ]?time)\b/,
        value: 'direct_established',
      },
      {
        pattern: /\b(patreon|membership|members|subscription|subscribers|vip|bandcamp|gumroad|shopify|discord|kajabi|beats?|drops?|presale)\b/,
        value: 'direct_some',
      },
      { pattern: /\b(merch|shirts?|hoodies?|tickets?|vinyl|cds?|shows?)\b/, value: 'merch_only' },
      { pattern: /\b(only streaming|just streaming|streaming only|spotify only|socials only|streams only)\b/, value: 'streaming_only' },
      {
        pattern: /\b(a few|few times|couple|once|twice|sometimes|here and there|yeah|yea|yes|yep|yup|sure|i have|we have)\b/,
        value: 'direct_some',
      },
      { pattern: /\b(no|nope|nah|never|not yet|none|nothing)\b/, value: 'none' },
    ],
    minConfidence: 0.6,
  },
  team_status: {
    key: 'team_status',
    type: 'enum',
    column: 'team_status',
    label: 'Team status',
    aiExtractable: true,
    values: [...TEAM_STATUS],
    minConfidence: 0.6,
  },
  release_frequency: {
    key: 'release_frequency',
    type: 'string',
    column: 'release_frequency',
    label: 'Release frequency',
    aiExtractable: true,
    minConfidence: 0.6,
  },
  purchase_intent: {
    key: 'purchase_intent',
    type: 'enum',
    column: 'purchase_intent',
    label: 'Purchase intent',
    aiExtractable: true,
    values: [...PURCHASE_INTENT],
    minConfidence: 0.7,
  },
  fan_ownership_maturity: {
    key: 'fan_ownership_maturity',
    type: 'enum',
    column: 'fan_ownership_maturity',
    label: 'Fan ownership maturity',
    aiExtractable: true,
    values: [...FAN_OWNERSHIP_MATURITY],
    minConfidence: 0.6,
  },

  // ---- Royalty Readiness Check ----
  // The one structured multi-question DM tool. Without these, the engine has no
  // question text for the Royalty fields and every DM prompt falls back to the
  // generic "Tell me a bit more." Yes/no/unsure diagnostics (not money, so
  // aiExtractable). Stored in `extra` jsonb (column: null); scored by readiness.ts
  // via toolAdapters. Question copy mirrors READINESS_QUESTIONS. Some fields are
  // inverted or publishing-only in SCORING, but the field just holds the raw answer.
  writes_music: {
    key: 'writes_music',
    type: 'enum',
    column: null,
    label: 'Writes own music',
    aiExtractable: true,
    question: 'Do you write or co-write the songs you release? Reply yes or no.',
    retryHint: 'A yes or no works. If you are not certain, say "unsure".',
    inputType: 'text',
    values: ['yes', 'no', 'unsure'],
    minConfidence: 0.6,
  },
  pro_registered: {
    key: 'pro_registered',
    type: 'enum',
    column: null,
    label: 'PRO registered',
    aiExtractable: true,
    question: 'Are you signed up with a PRO like ASCAP, BMI, or SESAC? Reply yes or no.',
    retryHint: 'Yes, no, or unsure. A PRO is the society that collects your performance royalties.',
    inputType: 'text',
    values: ['yes', 'no', 'unsure'],
    minConfidence: 0.6,
  },
  songs_registered: {
    key: 'songs_registered',
    type: 'enum',
    column: null,
    label: 'Songs registered with PRO',
    aiExtractable: true,
    question: 'Have you registered each of your songs with that PRO, one by one? Reply yes or no.',
    retryHint: 'Yes, no, or unsure. Signing up as a writer is not the same as registering each song.',
    inputType: 'text',
    values: ['yes', 'no', 'unsure'],
    minConfidence: 0.6,
  },
  mechanical_collection: {
    key: 'mechanical_collection',
    type: 'enum',
    column: null,
    label: 'Mechanical royalties collected',
    aiExtractable: true,
    question: 'Is anyone collecting your US mechanical royalties, like the MLC or an administrator? Reply yes or no.',
    retryHint: 'Yes, no, or unsure. This is a separate pot from your distributor payout.',
    inputType: 'text',
    values: ['yes', 'no', 'unsure'],
    minConfidence: 0.6,
  },
  soundexchange: {
    key: 'soundexchange',
    type: 'enum',
    column: null,
    label: 'SoundExchange registered',
    aiExtractable: true,
    question: 'Are you registered with SoundExchange? Reply yes or no.',
    retryHint: 'Yes, no, or unsure. SoundExchange pays for US digital radio like Pandora and SiriusXM.',
    inputType: 'text',
    values: ['yes', 'no', 'unsure'],
    minConfidence: 0.6,
  },
  unregistered_backlog: {
    key: 'unregistered_backlog',
    type: 'enum',
    column: null,
    label: 'Possible unregistered backlog',
    aiExtractable: true,
    question: 'Have you put out music in the last two years you are not sure was ever registered? Reply yes or no.',
    retryHint: 'Yes, no, or unsure. Back claims are not open forever, so an old backlog is what expires.',
    inputType: 'text',
    values: ['yes', 'no', 'unsure'],
    minConfidence: 0.6,
  },
};

export const FIELD_KEYS = Object.keys(FIELD_REGISTRY);
export const AI_EXTRACTABLE_KEYS = FIELD_KEYS.filter((k) => FIELD_REGISTRY[k].aiExtractable);

export function getField(key: string): FieldDefinition | null {
  return Object.prototype.hasOwnProperty.call(FIELD_REGISTRY, key) ? FIELD_REGISTRY[key] : null;
}

// ---------------------------------------------------------------------------
// Deterministic normalization — runs BEFORE Claude, and often makes Claude unnecessary.
// ---------------------------------------------------------------------------

/**
 * Parse a human-typed count. Handles "40k", "40,000", "about 40k", "1.2m".
 *
 * This exists so that the overwhelming majority of numeric answers never reach the model
 * at all: it is cheaper, faster, and impossible to prompt-inject. Returns null when the
 * text is genuinely ambiguous, which is the signal to escalate to Claude.
 */
export function parseCount(raw: string): number | null {
  if (typeof raw !== 'string') return null;
  const s = raw.toLowerCase().replace(/,/g, '').trim();

  // A bare-ish number with an optional k/m suffix, ignoring surrounding words.
  const m = s.match(/(\d+(?:\.\d+)?)\s*([km])?\b/);
  if (!m) return null;

  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;

  const mult = m[2] === 'm' ? 1_000_000 : m[2] === 'k' ? 1_000 : 1;
  const value = Math.round(n * mult);

  if (value < 0 || value > MAX_AUDIENCE) return null;
  return value;
}

/** Dollars typed by a human -> integer cents. CLAUDE.md: money is ALWAYS cents. */
export function parseDollarsToCents(raw: string): number | null {
  if (typeof raw !== 'string') return null;
  const s = raw.toLowerCase().replace(/[,$]/g, '').trim();
  const m = s.match(/(\d+(?:\.\d+)?)\s*([km])?\b/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const mult = m[2] === 'm' ? 1_000_000 : m[2] === 'k' ? 1_000 : 1;
  const cents = Math.round(n * mult * 100);
  if (cents < 0 || cents > MAX_CENTS) return null;
  return cents;
}

/** "yes"/"nope"/"yeah" -> boolean. null when it isn't a yes/no at all. */
export function parseBoolean(raw: string): boolean | null {
  if (typeof raw !== 'string') return null;
  const s = raw.toLowerCase().trim();
  if (/^(y|yes|yeah|yep|yup|sure|ok|okay|true|1)\b/.test(s)) return true;
  if (/^(n|no|nope|nah|not really|false|0)\b/.test(s)) return false;
  return null;
}

/**
 * Try to resolve a field deterministically, with no model call.
 *
 * Returns null when the value is ambiguous — that is the ONLY case where we spend a Claude
 * call. An enum answer that exactly matches a legal value is taken at face value; anything
 * fuzzier ("I guess I just want people to actually buy stuff") escalates.
 */
export function normalizeDeterministic(fieldKey: string, raw: string): unknown | null {
  const def = getField(fieldKey);
  if (!def || typeof raw !== 'string') return null;

  switch (def.type) {
    case 'integer': {
      const n = parseCount(raw);
      if (n === null) return null;
      if (def.min !== undefined && n < def.min) return null;
      if (def.max !== undefined && n > def.max) return null;
      return n;
    }
    case 'cents': {
      const c = parseDollarsToCents(raw);
      if (c === null) return null;
      if (def.min !== undefined && c < def.min) return null;
      if (def.max !== undefined && c > def.max) return null;
      return c;
    }
    case 'boolean':
      return parseBoolean(raw);
    case 'enum': {
      const s = raw.toLowerCase().trim().replace(/[\s-]+/g, '_');
      if (def.values?.includes(s)) return s;
      // Nobody types `direct_established` into Instagram. The alias rules are what let a real
      // sentence resolve with no model call and no retry spent.
      const natural = raw.toLowerCase().trim();
      for (const rule of def.aliasPatterns ?? []) {
        if (rule.pattern.test(natural) && def.values?.includes(rule.value)) return rule.value;
      }
      return null;
    }
    case 'string': {
      const s = raw.trim();
      // A free-text field is only "deterministic" if it's short and clean enough to be a
      // literal answer rather than a sentence we should parse.
      if (!s || s.length > 120) return null;
      return s;
    }
    default:
      return null;
  }
}

/**
 * Coerce + bounds-check a value Claude produced. Returns null to REJECT.
 *
 * Rejection is the safe default everywhere here. A dropped field just means we ask the
 * artist the question directly, which is a fine outcome. A wrongly-accepted field means we
 * put a hallucinated number in a database and show it back to them as fact.
 */
export function validateExtractedValue(
  fieldKey: string,
  value: unknown,
  confidence: number,
): unknown | null {
  const def = getField(fieldKey);
  if (!def) return null;
  if (!def.aiExtractable) return null; // money, and anything else we don't let the model touch
  if (confidence < (def.minConfidence ?? 0.6)) return null;

  switch (def.type) {
    case 'integer': {
      const n = typeof value === 'number' ? value : typeof value === 'string' ? parseCount(value) : null;
      if (n === null || !Number.isFinite(n) || !Number.isInteger(n)) return null;
      if (def.min !== undefined && n < def.min) return null;
      if (def.max !== undefined && n > def.max) return null;
      return n;
    }
    case 'cents':
      return null; // unreachable (aiExtractable is false), but explicit beats implicit
    case 'boolean':
      return typeof value === 'boolean' ? value : null;
    case 'enum': {
      if (typeof value !== 'string') return null;
      const s = value.toLowerCase().trim().replace(/[\s-]+/g, '_');
      return def.values?.includes(s) ? s : null;
    }
    case 'string': {
      if (typeof value !== 'string') return null;
      const s = value.trim();
      if (!s || s.length > 120) return null;
      return s;
    }
    default:
      return null;
  }
}

/** The source label for a value produced by normalizeDeterministic(). */
export const DETERMINISTIC_SOURCE: FieldSource = 'deterministic';
