// Royalty Readiness Check — the diagnostic layer.
//
// Schema: supabase/schema-phase2-royalty-readiness.sql
//
// WHAT THIS IS: a coverage check. It asks whether each royalty stream an artist
// may be entitled to has somebody actually collecting it, scores the coverage,
// and hands back a ranked list of next actions pointing at the real
// organizations that do the collecting.
//
// WHAT THIS IS NOT, and must never become without real data:
//   - a royalty statement
//   - a claim that a specific amount of money is owed
//   - legal or financial advice
// CRWN cannot verify a single answer here. Every answer is self-reported, so the
// output is a readiness score and a checklist, NEVER a dollar figure. If a future
// change wants to attach money to this, it needs verified data first. An invented
// "you are owed $14,200" is worse than no number at all.
//
// Language rule for everything user-facing in this file: "not confirmed", "may be
// going uncollected", "nobody is set up to collect this". Never "you are owed".
//
// This module is PURE and dependency-free on purpose: the in-app check and the
// public lead magnet must score identically, so the number an artist sees before
// signing up is the same number they see after.

export type ReadinessAnswer = 'yes' | 'no' | 'unsure';

export type ReadinessGroup = 'Your songs' | 'Registration' | 'Collection';

export interface ReadinessQuestion {
  key: string;
  group: ReadinessGroup;
  label: string;
  help?: string;
  /** Relative importance in the score. Higher means a bigger hole when uncovered. */
  weight: number;
  /**
   * When true, 'yes' is the RISKY answer (an unregistered backlog is a gap, not
   * a covered stream), so the scoring flips for this question.
   */
  inverted?: boolean;
  /**
   * Publishing-side questions only apply to writers. An artist who performs songs
   * they did not write has no songwriting share to collect, so scoring these
   * against them would invent a gap that does not exist.
   */
  publishingOnly?: boolean;
  /**
   * Not scored. Shifts the urgency of other actions (music spreading on social
   * makes unregistered publishing more expensive, it does not make it more likely).
   */
  modifier?: boolean;
}

/**
 * The check. Twelve questions, because each one maps to a DIFFERENT organization
 * or document. Anything that did not change the action list was cut.
 */
export const READINESS_QUESTIONS: ReadinessQuestion[] = [
  {
    key: 'writes_music',
    group: 'Your songs',
    label: 'Do you write or co-write the songs you release?',
    help: 'Writing the song and owning the recording are two separate things, collected by different people.',
    weight: 0, // a router, not a hole: it decides which questions below apply
  },
  {
    key: 'splits_documented',
    group: 'Your songs',
    label: 'Are the songwriting splits on every release written down and agreed by everyone?',
    help: 'A verbal agreement in the studio is not a split sheet.',
    weight: 12,
    publishingOnly: true,
  },
  {
    key: 'producers_documented',
    group: 'Your songs',
    label: 'If producers or co-writers worked on your songs, is their share in writing?',
    help: 'Producer points on the recording and a producer songwriting share are different claims.',
    weight: 8,
    publishingOnly: true,
  },
  {
    key: 'catalog_records',
    group: 'Your songs',
    label: 'Do you have the ISRC and ownership record for every release you have put out?',
    help: 'Without them, nobody can match a play to you even when they want to pay.',
    weight: 8,
  },
  {
    key: 'pro_registered',
    group: 'Registration',
    label: 'Are you signed up with a PRO (ASCAP, BMI, SESAC, or your country equivalent)?',
    help: 'The PRO collects performance royalties: radio, TV, venues, and streaming performance.',
    weight: 14,
    publishingOnly: true,
  },
  {
    key: 'songs_registered',
    group: 'Registration',
    label: 'Have you registered each individual song with that PRO?',
    help: 'Signing up as a writer collects nothing. The songs have to be registered one by one.',
    weight: 14,
    publishingOnly: true,
  },
  {
    key: 'mechanical_collection',
    group: 'Registration',
    label: 'Is somebody collecting your US mechanical royalties (the MLC, or an administrator)?',
    help: 'US streaming mechanicals are a separate pot from your distributor payout.',
    weight: 12,
    publishingOnly: true,
  },
  {
    key: 'soundexchange',
    group: 'Registration',
    label: 'Are you registered with SoundExchange?',
    help: 'US digital radio (Pandora, SiriusXM, webcasts) pays the performer and the recording owner, not the writer.',
    weight: 10,
  },
  {
    key: 'unregistered_backlog',
    group: 'Registration',
    label: 'Have you put out music in the last two years you are not sure was ever registered?',
    help: 'Back claims are not open forever, so an old backlog is the part that expires.',
    weight: 10,
    inverted: true,
  },
  {
    key: 'publishing_admin',
    group: 'Collection',
    label: 'Do you have a publishing administrator?',
    help: 'An administrator registers your songs everywhere and chases the money you cannot chase yourself.',
    weight: 8,
    publishingOnly: true,
  },
  {
    key: 'neighboring_rights',
    group: 'Collection',
    label: 'Is anybody collecting your neighbouring rights outside the US?',
    help: 'Most countries pay the performer for broadcast and public play. The US mostly does not, so it gets forgotten.',
    weight: 8,
  },
  {
    key: 'social_usage',
    group: 'Collection',
    label: 'Is your music being used on TikTok, Instagram, or YouTube by other people?',
    help: 'This does not change your score. It changes how fast the gaps above cost you.',
    weight: 0,
    modifier: true,
  },
];

export const READINESS_QUESTION_KEYS = READINESS_QUESTIONS.map((q) => q.key);

export type ReadinessAnswers = Record<string, ReadinessAnswer>;

export interface ReadinessAction {
  key: string;
  /** The move, in plain language. */
  title: string;
  /** Why it costs them. Loss-framed, never a promise of money. */
  why: string;
  /** Who actually does this. CRWN diagnoses, it does not collect. */
  where: string;
  links: { label: string; url: string }[];
  urgency: 'now' | 'soon' | 'later';
  /**
   * 'setup' when the artist said no (nothing is in place). 'verify' when they said
   * they were not sure, which is a different job: find out before you rebuild.
   */
  mode: 'setup' | 'verify';
  /** Sort key. Lower runs first. Most-critical-first, not easiest-first. */
  rank: number;
}

/**
 * The remediation catalog. Ranked by what fails worst if ignored, NOT by effort:
 * a stream nobody is registered to collect loses money every day it stays open,
 * and the backlog questions are the ones that can time out entirely.
 */
const ACTIONS: Record<string, Omit<ReadinessAction, 'key' | 'urgency' | 'mode'>> = {
  pro_registered: {
    rank: 1,
    title: 'Sign up with a PRO',
    why: 'Until you are affiliated, nobody is collecting performance royalties on your songs at all. That money does not wait for you, it gets distributed to everybody else.',
    where: 'ASCAP or BMI in the US, or your national society',
    links: [
      { label: 'ASCAP', url: 'https://www.ascap.com/' },
      { label: 'BMI', url: 'https://www.bmi.com/' },
    ],
  },
  songs_registered: {
    rank: 2,
    title: 'Register every song with your PRO, one by one',
    why: 'Being affiliated collects nothing on its own. A song your PRO has no record of is a song they cannot pay you for, no matter how much it is played.',
    where: 'Your PRO works portal',
    links: [
      { label: 'ASCAP', url: 'https://www.ascap.com/' },
      { label: 'BMI', url: 'https://www.bmi.com/' },
    ],
  },
  mechanical_collection: {
    rank: 3,
    title: 'Get your US mechanicals connected',
    why: 'Streaming pays a mechanical royalty on the song that is separate from the payout your distributor sends you. Unmatched, it sits in a pool and eventually goes to somebody else.',
    where: 'The MLC (free to join as a self-administered writer), or your publishing administrator',
    links: [{ label: 'The MLC', url: 'https://www.themlc.com/' }],
  },
  soundexchange: {
    rank: 4,
    title: 'Register with SoundExchange',
    why: 'US digital radio pays the performer and the recording owner directly. It never touches your distributor or your PRO, so if you are not registered it simply is not reaching you.',
    where: 'SoundExchange',
    links: [{ label: 'SoundExchange', url: 'https://www.soundexchange.com/' }],
  },
  splits_documented: {
    rank: 5,
    title: 'Get every songwriting split in writing',
    why: 'Undocumented splits block registration and turn into disputes exactly when a song starts earning. The friendliest session becomes the ugliest argument once there is money on the table.',
    where: 'A signed split sheet per song, before you register it',
    links: [],
  },
  unregistered_backlog: {
    rank: 6,
    title: 'Work through the releases you never registered',
    why: 'Back claims are not open forever. The older a release is, the more of it moves out of reach permanently, and this is the only part of the list with a clock on it.',
    where: 'Your PRO, the MLC, and SoundExchange, oldest release first',
    links: [],
  },
  publishing_admin: {
    rank: 7,
    title: 'Decide whether you need a publishing administrator',
    why: 'Self-administering works until your music travels. Registering across dozens of foreign societies by hand is where most independent artists quietly stop, and stop collecting.',
    where: 'An administrator (Songtrust, CD Baby Pro, Sentric and others) takes a percentage. Compare before you sign, and check the term length.',
    links: [{ label: 'Songtrust', url: 'https://www.songtrust.com/' }],
  },
  neighboring_rights: {
    rank: 8,
    title: 'Look into neighbouring rights outside the US',
    why: 'Most countries pay performers for broadcast and public play. The US mostly does not, so US artists never learn the stream exists and never claim it.',
    where: 'A neighbouring rights agent, or check whether your administrator already covers it',
    links: [],
  },
  catalog_records: {
    rank: 9,
    title: 'Put every release in one document with its ISRC and ownership',
    why: 'Every claim you will ever make starts with this list. Without it, you cannot prove what is yours, and you cannot even tell what is missing.',
    where: 'Your distributor dashboard has the ISRCs. CRWN stores an ISRC on each track.',
    links: [],
  },
  producers_documented: {
    rank: 10,
    title: 'Write down what your producers and co-writers actually get',
    why: 'Producer points on the recording and a producer songwriting share are two different claims. Leaving it verbal means you find out which one they meant during a dispute.',
    where: 'A signed agreement per song. Keep it separate from any CRWN revenue share.',
    links: [],
  },
};

export interface ReadinessResult {
  /** 0-100 coverage of the streams that apply to this artist. */
  score: number;
  band: string;
  bandNote: string;
  /** Total weight of applicable questions, and the weight actually covered. */
  applicableWeight: number;
  coveredWeight: number;
  /** How many applicable questions were answered "not sure". */
  unsureCount: number;
  actions: ReadinessAction[];
  /** True when the artist writes or co-writes, so publishing questions apply. */
  publishingApplies: boolean;
}

function band(score: number): { band: string; bandNote: string } {
  if (score >= 85) {
    return {
      band: 'Mostly covered',
      bandNote: 'Somebody is set up to collect on nearly every stream that applies to you. Keep it current as you release.',
    };
  }
  if (score >= 60) {
    return {
      band: 'Covered with gaps',
      bandNote: 'The main streams are handled, but the gaps below are collecting nothing while they stay open.',
    };
  }
  if (score >= 30) {
    return {
      band: 'Wide open',
      bandNote: 'More of your royalty streams have nobody assigned to them than have somebody. Start at the top of the list.',
    };
  }
  return {
    band: 'Nothing is set up to collect',
    bandNote: 'Outside your distributor payout, there is no one registered to collect on your behalf. The first two actions matter more than everything else.',
  };
}

/**
 * Score a set of answers and produce the ranked action list.
 *
 * Scoring rules:
 *   - Only APPLICABLE questions count. Publishing questions are skipped entirely
 *     for an artist who does not write, rather than scored as failures.
 *   - 'unsure' scores as uncovered. If the artist cannot say whether a stream is
 *     being collected, it is not being managed, and that is the honest read. It
 *     produces a "find out" action rather than a "set this up" action.
 *   - Nothing here is graded on a curve. A missing PRO is a missing PRO.
 */
export function scoreReadiness(answers: ReadinessAnswers): ReadinessResult {
  const writes = answers.writes_music === 'yes' || answers.writes_music === 'unsure';
  const viral = answers.social_usage === 'yes';

  let applicableWeight = 0;
  let coveredWeight = 0;
  let unsureCount = 0;
  const actions: ReadinessAction[] = [];

  for (const q of READINESS_QUESTIONS) {
    if (q.modifier || q.weight === 0) continue;
    if (q.publishingOnly && !writes) continue;

    const answer = answers[q.key];
    if (!answer) continue; // unanswered questions do not count against the score

    applicableWeight += q.weight;

    // Inverted questions (an unregistered backlog) are covered when the answer is 'no'.
    const covered = q.inverted ? answer === 'no' : answer === 'yes';
    if (covered) {
      coveredWeight += q.weight;
      continue;
    }
    if (answer === 'unsure') unsureCount += 1;

    const template = ACTIONS[q.key];
    if (!template) continue;

    // Urgency: the top three ranks are money accruing right now with nobody
    // assigned to it. Music circulating on social raises everything by one step,
    // because usage without registration is the expensive combination.
    let urgency: ReadinessAction['urgency'] = template.rank <= 3 ? 'now' : template.rank <= 6 ? 'soon' : 'later';
    if (viral && urgency !== 'now') urgency = urgency === 'soon' ? 'now' : 'soon';

    actions.push({
      ...template,
      key: q.key,
      urgency,
      mode: answer === 'unsure' ? 'verify' : 'setup',
    });
  }

  actions.sort((a, b) => a.rank - b.rank);

  const score = applicableWeight === 0 ? 0 : Math.round((coveredWeight / applicableWeight) * 100);

  return {
    score,
    ...band(score),
    applicableWeight,
    coveredWeight,
    unsureCount,
    actions,
    publishingApplies: writes,
  };
}

/** Strip anything that is not a known question key with a valid answer. */
export function sanitizeAnswers(input: unknown): ReadinessAnswers {
  const out: ReadinessAnswers = {};
  if (!input || typeof input !== 'object') return out;
  const valid: ReadinessAnswer[] = ['yes', 'no', 'unsure'];
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!READINESS_QUESTION_KEYS.includes(key)) continue;
    if (typeof value !== 'string') continue;
    if (!valid.includes(value as ReadinessAnswer)) continue;
    out[key] = value as ReadinessAnswer;
  }
  return out;
}

/** How many of the questions that apply to this artist have been answered. */
export function answeredCount(answers: ReadinessAnswers): { answered: number; total: number } {
  const writes = answers.writes_music === 'yes' || answers.writes_music === 'unsure';
  const applicable = READINESS_QUESTIONS.filter((q) => !(q.publishingOnly && !writes));
  return {
    answered: applicable.filter((q) => !!answers[q.key]).length,
    total: applicable.length,
  };
}

/** Is the Royalty Readiness dark-launch flag on? Reads admin_settings.royalty_readiness. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function isRoyaltyReadinessEnabled(admin: any): Promise<boolean> {
  try {
    const { data } = await admin
      .from('admin_settings')
      .select('value')
      .eq('key', 'royalty_readiness')
      .maybeSingle();
    return !!data?.value?.enabled;
  } catch {
    return false;
  }
}

/**
 * The disclaimer that must render anywhere this score is shown, in the app or on
 * a public tool. Not optional. Every input is self-reported and unverified.
 */
export const READINESS_DISCLAIMER =
  'This is a coverage checklist built from your own answers, not a royalty statement and not legal or financial advice. CRWN cannot see your registrations, so it cannot confirm what is or is not being collected. Use it to find the gaps, then confirm each one with the organization that handles it.';
