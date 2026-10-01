import { describe, it, expect } from 'vitest';
import {
  DRE_PLATINUM_OFFER, DRE_GOLD_OFFER, DRE_SILVER_OFFER, DRE_APPROVED_BENEFITS,
  DRE_BENEFIT_IDENTITIES, DRE_TIER_PRICES_CENTS, DRE_TIER_PROMISES, DRE_FUNNEL_PRIMARY_ITEM,
  DRE_BRONZE_SINGLES, PRINCE_DRE, DRE_DRIP,
} from './princeDre';
import { normalizeOfferExperience } from '../normalize';
import { benefitDelivery } from '../../benefitRegistry';
import { RECOMMENDED_LADDER } from '../../tierTemplate';

const OFFERS = [
  ['Platinum', DRE_PLATINUM_OFFER],
  ['Gold', DRE_GOLD_OFFER],
  ['Silver', DRE_SILVER_OFFER],
] as const;

describe('Prince Dre reference configs pass the write contract', () => {
  for (const [name, offer] of OFFERS) {
    it(`${name} normalizes with every preview and its CTA intact`, () => {
      const c = normalizeOfferExperience(offer, name);
      expect(c).not.toBeNull();
      expect(c!.cta).toBe(offer.cta);
      expect(c!.previews.length).toBe(offer.previews.length);
    });
  }
});

describe('the ladder matches the recommended rungs', () => {
  it('names and prices are the four stock rungs at the recommended prices', () => {
    const ladder = Object.fromEntries(RECOMMENDED_LADDER.map((r) => [r.name, r.priceCents]));
    expect(DRE_TIER_PRICES_CENTS).toEqual({ Bronze: 0, Silver: 1000, Gold: 2500, Platinum: 10000 });
    for (const [name, cents] of Object.entries(DRE_TIER_PRICES_CENTS)) expect(ladder[name]).toBe(cents);
    expect(Object.keys(DRE_TIER_PROMISES).sort()).toEqual(Object.keys(DRE_TIER_PRICES_CENTS).sort());
  });

  it('every structured identity is a supported registry key standing for an approved line', () => {
    for (const [rung, items] of Object.entries(DRE_BENEFIT_IDENTITIES)) {
      for (const it of items) {
        const def = benefitDelivery(it.key);
        expect(def && (def.support === 'recommended' || def.support === 'additional'), it.key).toBe(true);
        expect(DRE_APPROVED_BENEFITS[rung]).toContain(it.line);
      }
    }
  });
});

describe('truth discipline', () => {
  const everything = JSON.stringify([
    DRE_PLATINUM_OFFER, DRE_GOLD_OFFER, DRE_SILVER_OFFER, DRE_APPROVED_BENEFITS,
    DRE_TIER_PROMISES, DRE_FUNNEL_PRIMARY_ITEM,
  ]);
  const lower = everything.toLowerCase();

  it('a REAL preview names only songs and projects this launch actually uploads', () => {
    const uploaded = new Set([
      ...PRINCE_DRE.content!.tracks.map((t) => t.title),
      ...PRINCE_DRE.content!.projects.map((p) => p.title),
      ...PRINCE_DRE.vote!.options.map((o) => o.trackTitle),
    ]);
    const real = OFFERS.flatMap(([, o]) => o.previews).filter((p) => p.truth === 'real');
    expect(real.length).toBeGreaterThan(0);
    for (const p of real) for (const item of p.items ?? []) expect(uploaded.has(item.title), `${p.title}: ${item.title}`).toBe(true);
  });

  it('the copy never claims scarcity the research disproved (2026-09-30)', () => {
    // Every project can be found somewhere (Audiomack, YouTube, Apple Music, LiveMixtapes), so
    // "never on streaming", "unreleased" and "the public never got" are false.
    for (const phrase of ['never on streaming', 'unreleased project', 'unreleased sampler', 'public never got']) {
      expect(lower, phrase).not.toContain(phrase);
    }
  });

  it('every song of every project is uploaded exactly once, and the counts in the copy come from it', () => {
    const titles = PRINCE_DRE.content!.tracks.map((t) => t.title);
    expect(new Set(titles).size).toBe(titles.length);
    const onPage = titles.length + PRINCE_DRE.vote!.options.length;
    expect(everything).toContain(`(${onPage} songs)`);
    for (const t of DRE_BRONZE_SINGLES) expect(PRINCE_DRE.content!.tracks.find((x) => x.title === t)?.rung, t).toBe('Bronze');
  });

  it('the community card survives the write contract with its thread', () => {
    const c = normalizeOfferExperience(DRE_PLATINUM_OFFER, 'Platinum')!;
    const card = c.previews.find((p) => p.kind === 'status')!;
    expect(card.thread?.length).toBe(3);
    expect(card.thread?.find((t) => t.you)?.badge).toBe('Platinum');
  });

  it('a thread never rides a REAL preview (its names are illustrative)', () => {
    const forged = { ...DRE_PLATINUM_OFFER, previews: DRE_PLATINUM_OFFER.previews.map((p) => (p.kind === 'status' ? { ...p, truth: 'real' as const } : p)) };
    const c = normalizeOfferExperience(forged, 'Platinum')!;
    expect(c.previews.find((p) => p.kind === 'status')?.thread).toBeUndefined();
  });

  it('the hero art and the mock-video covers survive the write contract', () => {
    for (const [name, o] of [['Platinum', DRE_PLATINUM_OFFER], ['Gold', DRE_GOLD_OFFER]] as const) {
      const c = normalizeOfferExperience(o, name)!;
      expect(c.heroImageUrl).toMatch(/\/object\/public\/album-art\/.+\.webp$/);
    }
    const posters = OFFERS.flatMap(([n, o]) => normalizeOfferExperience(o, n)!.previews).filter((p) => p.posterUrl);
    expect(posters.map((p) => p.kind).sort()).toEqual(['session', 'video']);
  });

  it('a signed (private) image is never accepted as hero art', () => {
    const c = normalizeOfferExperience({ ...DRE_GOLD_OFFER, heroImageUrl: 'https://x.supabase.co/storage/v1/object/sign/audio/a.webp?token=abc' }, 'Gold')!;
    expect(c.heroImageUrl).toBeUndefined();
  });

  it('fan-facing headings never assume the fan knows a rung name', () => {
    for (const [, o] of OFFERS) expect(o.inherited?.heading).toBe('Also included');
  });

  it('promises no merch, no scarcity, no priority, no cadence, no rights', () => {
    for (const banned of ['merch', 'limited', 'priority', 'weekly', 'monthly', 'every month', 'royalt', 'ownership', 'guarantee']) {
      expect(lower.includes(banned), `banned term present: ${banned}`).toBe(false);
    }
  });

  it('no video plays until Dre records one: Platinum and Gold show only its cover', () => {
    // Founder direction 2026-09-28: he has not shot his video, so the slot is a cover still
    // (renderer: drawn play mark, "coming soon", nothing clickable). Silver has no slot.
    for (const o of [DRE_PLATINUM_OFFER, DRE_GOLD_OFFER]) {
      expect(o.vsl!.url).toBeNull();
      expect(o.vsl!.posterUrl).toMatch(/photo-vsl-thumb\.webp$/);
      const c = normalizeOfferExperience(o, 'Gold')!;
      expect(c.vsl?.posterUrl).toBe(o.vsl!.posterUrl);
    }
    expect(DRE_SILVER_OFFER.vsl!.url).toBeNull();
  });

  it('no em or en dashes, and no Join-tier buttons', () => {
    expect(/[—–]/.test(everything)).toBe(false);
    expect(/Join (Platinum|Gold|Silver|Bronze)/.test(everything)).toBe(false);
  });
});

// Founder, 2026-10-01: Gold gets the three remaining projects one a month, counted from each
// member's OWN start, ending with the best. It replaced the fan vote on a shared calendar. The
// copy must name the same projects in the same order the config drips them, and must not claim
// anything the oracle does not do.
describe('the Gold member drip', () => {
  const gold = JSON.stringify(DRE_GOLD_OFFER) + DRE_APPROVED_BENEFITS.Gold.join(' ') + DRE_TIER_PROMISES.Gold;
  const platinum = JSON.stringify(DRE_PLATINUM_OFFER);

  it('drips one project a month for three months to Gold, ending with The Return Of The Prince', () => {
    expect(DRE_DRIP.map((d) => d.months)).toEqual([1, 2, 3]);
    expect(DRE_DRIP[DRE_DRIP.length - 1].title).toBe('The Return Of The Prince');
    expect(PRINCE_DRE.drip).toEqual({ rung: 'Gold', projects: DRE_DRIP.map((d) => ({ title: d.title, months: d.months })) });
  });

  it('Gold names every drip project, in drip order', () => {
    const at = DRE_DRIP.map((d) => DRE_APPROVED_BENEFITS.Gold.join(' ').indexOf(d.title));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    for (const d of DRE_DRIP) expect(gold).toContain(d.title);
  });

  it('says the count restarts on rejoining, because started_at resets on every paid checkout', () => {
    expect(gold).toContain('the count starts again');
  });

  it('Platinum keeps all of it today and says Gold waits', () => {
    expect(platinum.toLowerCase()).not.toContain('only in platinum');
    for (const d of DRE_DRIP) expect(platinum).toContain(d.title);
  });

  it('no paid offer, card or promise mentions the retired vote or a passed date', () => {
    const all = gold + platinum + JSON.stringify(DRE_APPROVED_BENEFITS) + JSON.stringify(DRE_TIER_PROMISES);
    expect(all.toLowerCase()).not.toContain('vote');
    expect(/October 1(?!\d)/.test(all)).toBe(false);
    expect(PRINCE_DRE.vote!.retired).toBe(true);
    expect(DRE_BENEFIT_IDENTITIES.Bronze.map((i) => i.key)).not.toContain('creative_voting');
  });

  it('every drip project has tracks above Gold to delay, and its Bronze singles stay free', () => {
    for (const d of DRE_DRIP) {
      const project = PRINCE_DRE.content!.projects.find((p) => p.title === d.title)!;
      const rungs = project.trackTitles.map((t) => PRINCE_DRE.content!.tracks.find((x) => x.title === t)?.rung ?? 'vote-song');
      expect(rungs).toContain('Platinum');
      expect(rungs).not.toContain('Gold');
      expect(rungs).not.toContain('Silver');
    }
  });

  it('both paid offers give the same mixtape answer', () => {
    const answer = (o: typeof DRE_GOLD_OFFER) => o.faqs!.find((f) => f.q === 'Is the mixtape included?')!.a;
    expect(answer(DRE_GOLD_OFFER)).toBe(answer(DRE_PLATINUM_OFFER));
    expect(answer(DRE_GOLD_OFFER)).toContain('lives on CRWN');
  });
});
