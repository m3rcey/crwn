// memberWelcomeServer.ts: SERVER ONLY. Reads what the member welcome needs and sends it.
//
// Every value is read from canonical rows: the artist's name and slug, the tier the fan actually
// joined, that tier's card lines (tierCardBenefitLines, the same function the public card uses),
// and ONE track the fan can play today. Best-effort by contract: a welcome must never fail a join
// or a checkout, so every failure is logged and swallowed.

import { resend } from '@/lib/resend';
import { tierCardBenefitLines, cardLinesModeOf } from '@/lib/tierCardBenefits';
import { memberWelcomeEmail, memberWelcomeFrom, type MemberWelcomeInput } from './memberWelcome';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

interface TrackRow {
  id: string;
  title: string | null;
  is_free: boolean | null;
  allowed_tier_ids: string[] | null;
  public_release_date: string | null;
  tier_unlock_months: Record<string, number> | null;
  created_at: string;
}

/**
 * PURE: the one track to send a new member to first, or null.
 *
 * Paid: the newest track this rung unlocks on day one (named in allowed_tier_ids with no member
 * drip delay for it). That is the thing they just paid for. Free, or a paid rung with nothing of
 * its own yet: the newest public track (free, and not inside a members-first window).
 * Conservative on purpose: when in doubt it picks nothing rather than a locked track, because the
 * track page is the gate and a welcome that opens on a lock is worse than one that opens the page.
 */
export function pickStartHereTrack(tracks: TrackRow[], tierId: string, isPaid: boolean, now: Date): TrackRow | null {
  const newestFirst = [...tracks].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  if (isPaid) {
    const unlocked = newestFirst.find((t) => {
      const allowed = Array.isArray(t.allowed_tier_ids) ? t.allowed_tier_ids : [];
      if (!allowed.includes(tierId)) return false;
      const months = t.tier_unlock_months?.[tierId];
      return !(typeof months === 'number' && months > 0);
    });
    if (unlocked) return unlocked;
  }
  return (
    newestFirst.find((t) => {
      if (!t.is_free) return false;
      const date = t.public_release_date ? Date.parse(t.public_release_date) : NaN;
      const inWindow = !Number.isNaN(date) && date > now.getTime() && (t.allowed_tier_ids ?? []).length > 0;
      return !inWindow;
    }) ?? null
  );
}

export async function sendMemberWelcome(
  admin: Admin,
  opts: { fanId: string; fanEmail?: string | null; fanName?: string | null; artistId: string; tierId: string },
): Promise<boolean> {
  try {
    const [{ data: artist }, { data: tier }, { data: tiers }] = await Promise.all([
      admin.from('artist_profiles').select('id, slug, user_id').eq('id', opts.artistId).maybeSingle(),
      admin.from('subscription_tiers').select('id, name, price, access_config').eq('id', opts.tierId).maybeSingle(),
      admin
        .from('subscription_tiers')
        .select('id, name, price, access_config')
        .eq('artist_id', opts.artistId)
        .eq('is_active', true)
        .order('price', { ascending: true }),
    ]);
    if (!artist || !tier) return false;

    let email = opts.fanEmail ?? null;
    let fanName = opts.fanName ?? null;
    if (!email || !fanName) {
      const [{ data: au }, { data: prof }] = await Promise.all([
        email ? Promise.resolve({ data: null }) : admin.auth.admin.getUserById(opts.fanId),
        fanName ? Promise.resolve({ data: null }) : admin.from('profiles').select('display_name').eq('id', opts.fanId).maybeSingle(),
      ]);
      email = email ?? au?.user?.email ?? null;
      fanName = fanName ?? prof?.display_name ?? null;
    }
    if (!email) return false;

    const isPaid = (Number(tier.price) || 0) > 0;
    // The next rung up, by price, and the first line its card shows.
    const higher = ((tiers ?? []) as { id: string; name: string; price: number; access_config: unknown }[]).find(
      (t) => (Number(t.price) || 0) > (Number(tier.price) || 0),
    );

    const benefitIds = [tier.id, ...(higher ? [higher.id] : [])];
    const [{ data: benefitRows }, { data: artistProfile }, { data: tracks }] = await Promise.all([
      admin.from('tier_benefits').select('tier_id, benefit_type, config').in('tier_id', benefitIds),
      admin.from('profiles').select('display_name').eq('id', artist.user_id).maybeSingle(),
      admin
        .from('tracks')
        .select('id, title, is_free, allowed_tier_ids, public_release_date, tier_unlock_months, created_at')
        .eq('artist_id', opts.artistId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);
    type BenefitRow = { tier_id: string; benefit_type: string; config: Record<string, unknown> | null };
    const rowsFor = (id: string) => ((benefitRows ?? []) as BenefitRow[]).filter((r) => r.tier_id === id);
    const linesFor = (t: { id: string; access_config: unknown }) =>
      tierCardBenefitLines(
        rowsFor(t.id),
        (t.access_config as { benefits?: unknown } | null)?.benefits,
        cardLinesModeOf(t.access_config),
      );

    const start = pickStartHereTrack((tracks ?? []) as TrackRow[], tier.id, isPaid, new Date());
    const input: MemberWelcomeInput = {
      fanName,
      artistName: artistProfile?.display_name || 'Your artist',
      artistSlug: artist.slug ?? null,
      tierName: tier.name || (isPaid ? 'your tier' : 'the free tier'),
      isPaid,
      benefitLines: linesFor(tier),
      startHere: start ? { title: start.title || 'the newest track', trackId: start.id } : null,
      nextRung:
        !isPaid && higher
          ? { name: higher.name, priceCents: Number(higher.price) || 0, headline: linesFor(higher)[0] ?? null }
          : null,
    };

    const { subject, html, text } = memberWelcomeEmail(input);
    const { error } = await resend.emails.send({
      from: memberWelcomeFrom(input.artistName),
      to: email,
      subject,
      html,
      text,
    });
    if (error) {
      console.error('[memberWelcome] send failed:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[memberWelcome] failed:', err);
    return false;
  }
}
