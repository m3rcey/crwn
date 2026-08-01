'use client';

// LaunchKit — the launch campaign composer (Launch Wizard Stage 8).
//
// Generates the whole launch kit from what the artist ACTUALLY built (their
// page link, their free front door, their entry paid tier, their imported
// audience): announcement + follow-up emails as reviewable campaign DRAFTS,
// plus social caption, story copy, and DM copy to paste anywhere. Nothing
// sends from here: drafts open in the existing composer, and the send stays
// behind the compliant contacts sender (attested + subscribed + suppression).

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { buildLaunchKit, suggestLaunchDate, type LaunchKit as Kit } from '@/lib/launchCampaign';
import { isPresentableArtistName } from '@/lib/publicName';
import { Rocket, Copy, ChevronDown, Loader2, Mail } from 'lucide-react';

interface LaunchKitProps {
  artistId: string;
  /** Called after drafts are created so the campaign list can refresh. */
  onDraftsCreated: () => void;
}

export function LaunchKit({ artistId, onDraftsCreated }: LaunchKitProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [kit, setKit] = useState<Kit | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [contactCount, setContactCount] = useState(0);
  // Controlled vs full launch. A genuine binary, so two buttons rather than a
  // dropdown (the UX rule's stated exception). Controlled is the default because
  // a launch email that lands wrong cannot be unsent, and the small group is how
  // an artist finds that out while it is still fixable.
  const [launchType, setLaunchType] = useState<'controlled' | 'full'>('controlled');

  useEffect(() => {
    if (!user) return;
    let active = true;
    const supabase = createBrowserSupabaseClient();
    (async () => {
      const [{ data: artist }, { data: profile }, { data: tiers }, contactsRes, patreonRes] = await Promise.all([
        supabase.from('artist_profiles').select('slug').eq('id', artistId).maybeSingle(),
        supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
        supabase
          .from('subscription_tiers')
          .select('name, price')
          .eq('artist_id', artistId)
          .not('is_active', 'is', false)
          .order('price', { ascending: true }),
        supabase
          .from('fan_contacts')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artistId)
          .eq('is_subscribed_email', true),
        supabase
          .from('fan_contacts')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artistId)
          .contains('tags', ['patreon']),
      ]);
      if (!active || !artist?.slug) return;

      const free = (tiers ?? []).find((t) => (Number(t.price) || 0) === 0) ?? null;
      const paid = (tiers ?? []).find((t) => (Number(t.price) || 0) > 0) ?? null;
      // display_name defaults to the signup email; never sign an email with that.
      const name =
        profile?.display_name && isPresentableArtistName(profile.display_name)
          ? profile.display_name
          : artist.slug;

      setContactCount(contactsRes.count ?? 0);
      setKit(
        buildLaunchKit({
          artistName: name,
          shareUrl: `https://thecrwn.app/${artist.slug}`,
          freeTierName: free?.name ?? null,
          paidTierName: paid?.name ?? null,
          paidPriceLabel: paid ? `$${Math.round((Number(paid.price) || 0) / 100)}/mo` : null,
          contactCount: contactsRes.count ?? 0,
          patreonCount: patreonRes.count ?? 0,
        }),
      );
    })();
    return () => {
      active = false;
    };
  }, [user, artistId]);

  if (!kit) return null;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} copied!`, 'success');
    } catch {
      showToast('Could not copy. Select the text and copy it manually.', 'error');
    }
  };

  const createDrafts = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const post = (payload: Record<string, unknown>) =>
        fetch('/api/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      // Controlled launch sends the announcement to a small test group first; a
      // full launch sends to everyone eligible. The follow-up always goes to
      // everyone. Both are DRAFTS the artist opens and reviews.
      const res1 = await post({
        artistId,
        name: kit.announcement.name,
        subject: kit.announcement.subject,
        body: kit.announcement.body,
        filters:
          launchType === 'controlled'
            ? { audience: 'contacts', testCount: kit.suggestedTestCount }
            : { audience: 'contacts' },
      });
      const j1 = await res1.json();
      if (!res1.ok) throw new Error(j1.error || 'Could not create the announcement draft');
      const res2 = await post({
        artistId,
        name: kit.followUp.name,
        subject: kit.followUp.subject,
        body: kit.followUp.body,
        filters: { audience: 'contacts' },
      });
      const j2 = await res2.json();
      if (!res2.ok) throw new Error(j2.error || 'Could not create the follow-up draft');
      setCreated(true);
      showToast('Two drafts created. Open them below to review and send.', 'success');
      onDraftsCreated();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not create the drafts', 'error');
    } finally {
      setCreating(false);
    }
  };

  const launchDate = suggestLaunchDate(new Date());
  const dateLabel = launchDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="bg-crwn-surface rounded-xl border border-crwn-gold/40 p-4 mb-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-crwn-gold/10 flex items-center justify-center shrink-0">
            <Rocket className="w-4 h-4 text-crwn-gold" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-crwn-text">Launch kit</p>
            <p className="text-xs text-crwn-text-secondary truncate">
              Your announcement, follow-up, and social copy, written from your actual offer. Nothing sends
              without your review.
            </p>
          </div>
        </div>
        <ChevronDown
          className={`w-5 h-5 text-crwn-text-secondary shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {/* Emails → reviewable drafts */}
          <div className="border border-crwn-elevated rounded-xl p-4">
            <p className="text-sm font-medium text-crwn-text flex items-center gap-2">
              <Mail className="w-4 h-4 text-crwn-gold" />
              Two emails, ready to review
            </p>
            <p className="text-xs text-crwn-text-secondary mt-1">
              The announcement and the follow-up for a few days later. {kit.segmentSuggestion}
            </p>

            {/* Controlled vs full launch. Two options, so two buttons. */}
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(
                [
                  {
                    key: 'controlled' as const,
                    title: 'Controlled launch',
                    detail: `Announcement to ${Math.min(kit.suggestedTestCount, contactCount || kit.suggestedTestCount)} contacts first`,
                  },
                  {
                    key: 'full' as const,
                    title: 'Full launch',
                    detail:
                      contactCount > 0
                        ? `Announcement to all ${contactCount} contacts`
                        : 'Announcement to every eligible contact',
                  },
                ]
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setLaunchType(opt.key)}
                  disabled={created}
                  className={`text-left rounded-xl border px-3 py-2.5 transition-colors disabled:opacity-50 ${
                    launchType === opt.key
                      ? 'border-crwn-gold bg-crwn-gold/10'
                      : 'border-crwn-elevated hover:border-crwn-gold/40'
                  }`}
                >
                  <span className="block text-sm font-medium text-crwn-text">{opt.title}</span>
                  <span className="block text-xs text-crwn-text-secondary mt-0.5">{opt.detail}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-crwn-text-secondary mt-2">
              {launchType === 'controlled'
                ? 'A launch email cannot be unsent. The small group is how you catch a broken link or a wrong price while it is still fixable.'
                : 'Everyone hears at once. Best when you have sent to this list before and know it lands.'}
            </p>

            <p className="text-xs text-crwn-text-secondary mt-1">Good send day: {dateLabel}.</p>
            <button
              type="button"
              onClick={createDrafts}
              disabled={creating || created}
              className="inline-flex items-center gap-2 mt-3 bg-crwn-gold text-crwn-bg text-sm font-semibold px-5 py-2 rounded-full hover:bg-crwn-gold/90 disabled:opacity-40 transition-colors"
            >
              {creating && <Loader2 className="w-4 h-4 animate-spin" />}
              {created ? 'Drafts created, review them below' : 'Create both drafts'}
            </button>
          </div>

          {/* Copy-paste assets: the manual launch path */}
          {(
            [
              { label: 'Social caption', text: kit.socialCaption },
              { label: 'Story copy', text: kit.storyCopy },
              { label: 'DM copy', text: kit.dmCopy },
              { label: 'Share link', text: kit.shareUrl },
            ] as const
          ).map((asset) => (
            <div key={asset.label} className="border border-crwn-elevated rounded-xl p-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-xs font-medium uppercase tracking-wide text-crwn-text-secondary">{asset.label}</p>
                <button
                  type="button"
                  onClick={() => copy(asset.text, asset.label)}
                  className="inline-flex items-center gap-1.5 text-xs text-crwn-gold hover:underline shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </button>
              </div>
              <p className="text-sm text-crwn-text whitespace-pre-wrap">{asset.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
