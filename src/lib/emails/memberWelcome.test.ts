import { describe, it, expect } from 'vitest';
import { memberWelcomeEmail, memberWelcomeFrom, type MemberWelcomeInput } from './memberWelcome';
import { pickStartHereTrack } from './memberWelcomeServer';

// The member welcome (2026-10-02). It replaced a paid welcome that listed three hard-coded perks
// unrelated to the tier and pointed at CRWN's feed, and it is the first email a FREE member ever
// gets from the artist-page join.

const base: MemberWelcomeInput = {
  fanName: 'Tasha Reed',
  artistName: 'Prince Dre',
  artistSlug: 'princedre',
  tierName: 'Gold',
  isPaid: true,
  benefitLines: ['🎵 A new project every month you stay', '💬 Members-only posts'],
  startHere: { title: 'Brick City', trackId: 't1' },
  nextRung: null,
};

describe('memberWelcomeEmail', () => {
  it('leads with one thing to play, linked to the artist, never to a CRWN hub', () => {
    const { html, text } = memberWelcomeEmail(base);
    expect(text).toContain('Play Brick City: https://thecrwn.app/princedre/track/t1');
    expect(html).not.toContain('/home"');
    expect(html).not.toContain('Go to Your Feed');
  });

  it('prints the tier card lines it was given, and invents none', () => {
    const { text, html } = memberWelcomeEmail(base);
    expect(text).toContain('- A new project every month you stay');
    for (const generic of ['Exclusive Music', 'Shop', 'Community']) expect(html).not.toContain(generic);
  });

  it('free: names ONE concrete thing the next rung adds, with no deadline or scarcity', () => {
    const { text } = memberWelcomeEmail({
      ...base,
      isPaid: false,
      tierName: 'Bronze',
      nextRung: { name: 'Silver', priceCents: 1000, headline: '🎧 Hear new songs 7 days early' },
    });
    expect(text).toContain('Silver ($10/mo) adds: Hear new songs 7 days early.');
    expect(text).not.toMatch(/limited|spots|hurry|today only|last chance/i);
  });

  it('paid: never tries to sell the next rung in the welcome', () => {
    const { text } = memberWelcomeEmail({ ...base, nextRung: { name: 'Platinum', priceCents: 10000, headline: 'x' } });
    expect(text).not.toContain('Platinum');
  });

  it('with nothing playable, it opens the artist page and promises nothing it cannot keep', () => {
    const { text } = memberWelcomeEmail({ ...base, startHere: null });
    expect(text).toContain("Open Prince Dre's page: https://thecrwn.app/princedre");
  });

  it('never greets a fan by an email-shaped seed name', () => {
    expect(memberWelcomeEmail({ ...base, fanName: 'tasha@gmail.com' }).text.startsWith('Hey,')).toBe(true);
  });

  it('escapes artist-controlled text in HTML and keeps the From header well-formed', () => {
    const { html } = memberWelcomeEmail({ ...base, artistName: '<script>x</script>' });
    expect(html).not.toContain('<script>');
    expect(memberWelcomeFrom('Dre "The" <King>\r\nBcc: x')).toBe('Dre The KingBcc: x via CRWN <hello@thecrwn.app>');
  });

  it('carries no em or en dashes', () => {
    const { subject, html, text } = memberWelcomeEmail({ ...base, isPaid: false, nextRung: { name: 'Silver', priceCents: 1000, headline: null } });
    expect(`${subject}${html}${text}`).not.toMatch(/[–—]/);
  });
});

describe('pickStartHereTrack', () => {
  const now = new Date('2026-10-02T00:00:00Z');
  const t = (id: string, o: Record<string, unknown>) => ({
    id,
    title: id,
    is_free: false,
    allowed_tier_ids: [],
    public_release_date: null,
    tier_unlock_months: null,
    created_at: '2026-09-01T00:00:00Z',
    ...o,
  });

  it('paid: the newest track this rung unlocks on day one', () => {
    const tracks = [
      t('old', { allowed_tier_ids: ['gold'], created_at: '2026-08-01T00:00:00Z' }),
      t('new', { allowed_tier_ids: ['gold'], created_at: '2026-09-20T00:00:00Z' }),
    ];
    expect(pickStartHereTrack(tracks, 'gold', true, now)?.id).toBe('new');
  });

  it('paid: never a track the member drip still holds back for this rung', () => {
    const tracks = [
      t('dripped', { allowed_tier_ids: ['gold'], tier_unlock_months: { gold: 2 }, created_at: '2026-09-25T00:00:00Z' }),
      t('open', { allowed_tier_ids: ['gold'], created_at: '2026-09-01T00:00:00Z' }),
    ];
    expect(pickStartHereTrack(tracks, 'gold', true, now)?.id).toBe('open');
  });

  it('free: never a track inside a members-first window', () => {
    const tracks = [
      t('window', { is_free: true, allowed_tier_ids: ['gold'], public_release_date: '2026-11-01T00:00:00Z', created_at: '2026-09-30T00:00:00Z' }),
      t('public', { is_free: true, created_at: '2026-09-01T00:00:00Z' }),
    ];
    expect(pickStartHereTrack(tracks, 'bronze', false, now)?.id).toBe('public');
  });

  it('nothing playable: null, never a locked guess', () => {
    expect(pickStartHereTrack([t('locked', { allowed_tier_ids: ['platinum'] })], 'bronze', false, now)).toBeNull();
  });
});
