// experienceSteps.ts: the PURE step model for "Show fans why the paid tier is worth it", the
// V1 Offer Builder (Rise Mode Guided Setup, 2026-09-03).
//
// A structured writer over the EXISTING Tier Offer Experience contract. CRWN owns the layout;
// the artist supplies truthful content. Every decision here becomes a field the normalizer
// already bounds, and the two honesty rules stay where they live: a preview carries its truth
// state from the artist's CHOICE (a real thing, their own media, or a labelled example), never
// from a typed flag, and the button is checked by isBenefitCta before publish.
//
// Required to launch: the promise, a benefit-based button, one truthful preview per important
// benefit. Recommended: the FAQ (drafted deterministically from tier facts). Optional: a video.
// There is no proof screen because the contract has no proof field; when there is real proof
// to show, it becomes a preview, and inventing one is exactly what this flow must never do.

import { benefitDelivery, type BenefitType } from '@/lib/benefitRegistry';
import { isBenefitCta, safePosterUrl } from '@/lib/offerExperience/normalize';
import { OFFER_LIMITS, type OfferFaq, type OfferPreview, type PreviewKind, type TierOfferExperience } from '@/lib/offerExperience/types';
import type { ReadinessState } from '@/lib/benefitReadiness';

export type ExperienceStepKey = 'promise' | 'cta' | 'benefits' | 'preview-benefit' | 'vsl' | 'faq' | 'preview' | 'publish';

export interface ExperienceStepDef {
  key: ExperienceStepKey;
  /** For preview-benefit steps, which benefit this screen is about. */
  benefit?: BenefitType;
  group: string;
  title: string;
  subtitle: string;
  requirement: 'launch' | 'truth' | 'recommended' | 'optional';
}

export type PreviewChoice = 'real' | 'media' | 'example' | 'skip';

export interface BenefitFacts {
  benefit: BenefitType;
  state: ReadinessState;
  fact: string;
  /** Titles of the artist's own gated tracks, for collection and audio previews. Public words only. */
  gatedTrackTitles: string[];
}

export interface MediaCandidate {
  label: string;
  url: string;
}

export interface PreviewDecision {
  benefit: BenefitType;
  choice: PreviewChoice;
  title: string;
  description: string;
  mediaUrl: string | null;
}

export interface ExperienceState {
  tier: { id: string; name: string; price: number; description: string | null } | null;
  /** Supported, non-manual benefits on the tier, in ladder order. */
  benefits: BenefitFacts[];
  promise: string;
  description: string;
  cta: string;
  decisions: Record<string, PreviewDecision>;
  vslUrl: string;
  faqs: OfferFaq[];
  inheritedFrom: { heading: string; items: string[] } | null;
}

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

/** Which benefits deserve a preview screen: supported and CRWN-delivered. Manual promises stay words. */
export function previewableBenefits(rows: BenefitFacts[]): BenefitFacts[] {
  return rows.filter((r) => {
    const def = benefitDelivery(r.benefit);
    return !!def && def.support !== 'manual' && def.support !== 'retired';
  });
}

/** A "real" preview is only offered when readiness says the thing exists. */
export function canUseReal(state: ReadinessState): boolean {
  return state === 'ready' || state === 'active' || state === 'upcoming';
}

/** Three buttons that name the outcome, from the tier's own benefits. Never "Join". */
export function suggestCtas(benefits: BenefitFacts[], tierName: string): string[] {
  const out: string[] = [];
  for (const b of benefits) {
    const def = benefitDelivery(b.benefit);
    if (!def) continue;
    const label = def.label.replace(/^(Hear|Get|Watch|Help|Send|Go|See)\b/, (m) => m);
    if (isBenefitCta(label, tierName) && label.length <= OFFER_LIMITS.cta && !out.includes(label)) out.push(label);
    if (out.length === 3) break;
  }
  if (out.length < 3 && isBenefitCta('Get closer to the music', tierName)) out.push('Get closer to the music');
  if (out.length < 3) out.push('Unlock everything inside');
  return out.slice(0, 3).filter((c) => isBenefitCta(c, tierName));
}

/** The one-line promise, from the tier itself, then the first benefit. */
export function suggestPromise(s: ExperienceState): string {
  if (s.tier?.description?.trim()) return s.tier.description.trim().slice(0, OFFER_LIMITS.promise);
  const first = s.benefits[0] ? benefitDelivery(s.benefits[0].benefit) : undefined;
  return (first?.fanMeaning ?? '').slice(0, OFFER_LIMITS.promise);
}

/** A default description under the promise, from what the tier delivers. */
export function suggestDescription(s: ExperienceState): string {
  const labels = s.benefits.map((b) => benefitDelivery(b.benefit)?.label).filter((x): x is string => !!x).slice(0, 3);
  if (!labels.length) return '';
  const list = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
  return `${list}. Everything opens the moment you join.`.slice(0, OFFER_LIMITS.description);
}

/**
 * Three answers to the questions every fan asks, from facts CRWN can stand behind. No cadence
 * is promised, no result is claimed, and cancellation is described as the Stripe portal makes it.
 */
export function draftFaqs(s: ExperienceState): OfferFaq[] {
  const name = s.tier?.name ?? 'this tier';
  const price = s.tier ? `${money(s.tier.price)} a month` : 'the monthly price';
  return [
    { q: 'What happens the moment I join?', a: `Everything listed for ${name} opens right away. Anything with a date shows that date on the page before you pay.` },
    { q: 'Can I cancel?', a: `Yes, any time, from your account. You keep access until the end of the month you paid for.` },
    { q: 'What if I am already a member?', a: `Upgrading moves you to ${name} for ${price} and you keep everything from the tiers below it.` },
  ];
}

/** Turn one decision into the contract's preview shape. Null when the artist skipped it. */
export function buildPreview(d: PreviewDecision, facts: BenefitFacts | undefined): OfferPreview | null {
  const def = benefitDelivery(d.benefit);
  if (!def || d.choice === 'skip') return null;
  const kind: PreviewKind = d.choice === 'media' ? 'image' : (def.previewKind ?? 'image');
  const title = (d.title.trim() || def.label).slice(0, OFFER_LIMITS.previewTitle);
  const description = (d.description.trim() || (d.choice === 'real' ? facts?.fact ?? def.fanMeaning : def.fanMeaning)).slice(0, OFFER_LIMITS.previewDescription);
  const truth: OfferPreview['truth'] = d.choice === 'example' ? 'example' : 'real';
  const p: OfferPreview = { kind, truth, title, description };

  if (d.choice === 'media') {
    const url = safePosterUrl(d.mediaUrl);
    if (!url) return null;
    p.posterUrl = url;
    return p;
  }

  switch (kind) {
    case 'decision':
      p.options = [{ label: 'Version A' }, { label: 'Version B' }, { label: 'Version C' }];
      p.actionLabel = 'Cast a vote';
      break;
    case 'submission':
      p.fields = [{ label: 'Your idea', placeholder: 'A beat, a hook, a reference' }];
      p.actionLabel = 'Submit for consideration';
      break;
    case 'collection':
    case 'audio': {
      const titles = (facts?.gatedTrackTitles ?? []).slice(0, OFFER_LIMITS.maxItems);
      if (titles.length && truth === 'real') p.items = titles.map((t) => ({ title: t, locked: true }));
      else if (truth === 'example') p.items = [{ title: 'Unreleased demo', locked: true }, { title: 'Alternate take', locked: true }, { title: 'Voice memo', locked: true }];
      break;
    }
    case 'window':
      p.windowState = facts?.state === 'active' ? 'open' : facts?.state === 'upcoming' ? 'upcoming' : 'closed';
      break;
    case 'status':
      p.badge = 'Member';
      break;
    case 'timeline':
      p.steps = [{ label: 'Beat' }, { label: 'Hook', participates: true }, { label: 'Verse' }, { label: 'Release' }];
      break;
    default:
      break;
  }
  return p;
}

/** The config the publish route receives. The route normalizes it again; this is the same shape. */
export function buildConfig(s: ExperienceState): TierOfferExperience {
  const previews = s.benefits
    .map((b) => buildPreview(s.decisions[b.benefit] ?? { benefit: b.benefit, choice: 'skip', title: '', description: '', mediaUrl: null }, b))
    .filter((p): p is OfferPreview => !!p)
    .slice(0, OFFER_LIMITS.maxPreviews);
  const out: TierOfferExperience = {
    promise: s.promise.trim().slice(0, OFFER_LIMITS.promise),
    description: s.description.trim().slice(0, OFFER_LIMITS.description),
    cta: s.cta.trim().slice(0, OFFER_LIMITS.cta),
    secondaryCue: 'See what you get',
    previews,
  };
  const vsl = safePosterUrl(s.vslUrl.trim());
  if (vsl) out.vsl = { url: vsl };
  if (s.inheritedFrom && s.inheritedFrom.items.length) out.inherited = s.inheritedFrom;
  if (s.faqs.length) out.faqs = s.faqs.slice(0, OFFER_LIMITS.maxFaqs);
  return out;
}

export function visibleSteps(s: ExperienceState): ExperienceStepDef[] {
  const steps: ExperienceStepDef[] = [
    { key: 'promise', group: 'The promise', title: 'What does a fan get by joining?', subtitle: 'One line at the top of the page. Say the outcome, not the tier name.', requirement: 'truth' },
    { key: 'cta', group: 'The promise', title: 'What does the button say?', subtitle: 'It answers "what do I get by pressing this?". Join and the tier name are refused.', requirement: 'truth' },
    { key: 'benefits', group: 'What fans get', title: 'Here is what fans get', subtitle: 'From your offer. Each one can be shown, not just listed.', requirement: 'launch' },
  ];
  for (const b of previewableBenefits(s.benefits)) {
    const def = benefitDelivery(b.benefit)!;
    steps.push({
      key: 'preview-benefit',
      benefit: b.benefit,
      group: 'Show it',
      title: `How should fans see what "${def.label}" feels like?`,
      subtitle: 'A real thing that exists, your own artwork, or a clearly labelled example.',
      requirement: 'truth',
    });
  }
  steps.push(
    { key: 'vsl', group: 'Strengthen', title: 'Add a video?', subtitle: 'A public link to a video you already host. Skipping shows nothing, which is honest.', requirement: 'optional' },
    { key: 'faq', group: 'Strengthen', title: 'Answer the obvious questions', subtitle: 'CRWN drafted three from facts. Edit or drop any of them.', requirement: 'recommended' },
    { key: 'preview', group: 'Publish', title: 'This is the page fans will see', subtitle: 'Exactly as it renders on your link.', requirement: 'launch' },
    { key: 'publish', group: 'Publish', title: 'Publish it', subtitle: 'It goes live on your funnel link the moment you continue.', requirement: 'launch' },
  );
  return steps;
}

export function canContinue(step: ExperienceStepDef, s: ExperienceState): boolean {
  switch (step.key) {
    case 'promise':
      return s.promise.trim().length > 0 && s.description.trim().length > 0;
    case 'cta':
      return s.cta.trim().length > 0 && isBenefitCta(s.cta, s.tier?.name);
    case 'preview-benefit': {
      const d = step.benefit ? s.decisions[step.benefit] : undefined;
      if (!d) return false;
      if (d.choice === 'media') return !!safePosterUrl(d.mediaUrl);
      return true;
    }
    case 'preview':
      return buildConfig(s).previews.length > 0 || previewableBenefits(s.benefits).length === 0;
    default:
      return true;
  }
}

/**
 * Where to resume. In-flight text lives in the browser (a short flow); the canonical row is
 * the published page. With no draft, a published page resumes at review; a fresh tier starts
 * at the promise.
 */
export function resumeIndex(steps: ExperienceStepDef[], s: ExperienceState, hasPublished: boolean): number {
  const at = (k: ExperienceStepKey) => Math.max(0, steps.findIndex((st) => st.key === k));
  if (!s.promise.trim() || !s.description.trim()) return at('promise');
  if (!canContinue(steps[at('cta')], s)) return at('cta');
  const firstOpen = steps.findIndex((st) => st.key === 'preview-benefit' && !canContinue(st, s));
  if (firstOpen >= 0) return firstOpen;
  return hasPublished ? at('preview') : at('vsl');
}

/** The decision a benefit starts with: real when it exists, example otherwise. */
export function defaultDecision(b: BenefitFacts): PreviewDecision {
  return { benefit: b.benefit, choice: canUseReal(b.state) ? 'real' : 'example', title: '', description: '', mediaUrl: null };
}

/** Public artwork the artist already exposes. Anything not plainly public is dropped. */
export function mediaCandidates(input: { avatarUrl: string | null; bannerUrl: string | null; albumArt: { title: string; url: string | null }[] }): MediaCandidate[] {
  const out: MediaCandidate[] = [];
  const seen = new Set<string>();
  const push = (label: string, url: string | null) => {
    const safe = safePosterUrl(url);
    if (!safe || seen.has(safe)) return;
    seen.add(safe);
    out.push({ label, url: safe });
  };
  push('Your profile photo', input.avatarUrl);
  push('Your banner', input.bannerUrl);
  for (const a of input.albumArt) push(`Artwork: ${a.title}`, a.url);
  return out.slice(0, 12);
}
