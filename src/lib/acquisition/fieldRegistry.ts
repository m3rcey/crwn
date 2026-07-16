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
    question: 'How many unreleased songs, demos, or ideas are sitting in your vault?',
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
  monetization_status: {
    key: 'monetization_status',
    type: 'enum',
    column: 'monetization_status',
    label: 'Monetization status',
    aiExtractable: true,
    values: [...MONETIZATION_STATUS],
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
      return def.values?.includes(s) ? s : null;
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
