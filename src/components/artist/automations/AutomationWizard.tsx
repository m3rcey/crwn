'use client';

// The Fan Automation setup wizard: plain-English questions, one decision per screen, on the
// shared Wizard primitive. The artist never sees a webhook, a token, a trigger graph, or a
// node: they answer what should happen and CRWN builds the automation.
//
// Screen order mirrors the fan's journey: where CRWN listens -> which comments -> what
// people see -> what CRWN sends -> what fans get -> the primary offer -> the cheaper fallback
// -> review. Primary/downsell default from deriveOfferTiers over the artist's LIVE tiers and
// stay editable; prices always render from those rows, never from anything typed here.
//
// Rise Mode Guided Setup (2026-09-03) added three things without a second wizard:
//   existing  reopen a saved row (draft, paused or active). The row IS the draft; resume lands
//             on the first decision it does not answer (src/lib/fanAutomations/automationResume.ts).
//   mode      'magnet' runs the screens up to the gift and saves a DRAFT ("Give fans something
//             worth joining for"); 'funnel' runs the offer screens and switches it on ("Turn it
//             on"); 'full' is the original all-in-one wizard on /studio/automations.
//   flow      when launched from Rise Mode, the flow key for telemetry and the sticky footer.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Upload } from 'lucide-react';
import { Wizard } from '@/components/ui/Wizard';
import { OptionSelect } from '@/components/ui/OptionSelect';
import { useToast } from '@/components/shared/Toast';
import { supabase } from '@/lib/supabase/client';
import { shareTitle, SHARE_TITLE_MAX } from '@/lib/shareMetadata';
import { deriveOfferTiers } from '@/lib/fanAutomations/offerTiers';
import { funnelResumeScreen, magnetResumeScreen } from '@/lib/fanAutomations/automationResume';
import { guidedSetupTelemetry } from '@/lib/guidedSetup/telemetry';
import { guidedFlowHref, type GuidedFlowKey } from '@/lib/guidedSetup/flows';
import type { ArtistContext } from '@/hooks/useArtistContext';

/**
 * What a pasted drop link actually looks like.
 *
 * The title an artist types here is not only the drop page's headline: it is the headline
 * every link preview renders (iMessage, WhatsApp, Slack, Instagram DMs), and a preview cuts
 * off around 40 characters. The field accepts 120, so without this the artist writes a
 * sentence and a fan is sent half of one. `shareTitle` is the SAME function the drop page's
 * generateMetadata calls, so this card cannot drift from the real preview.
 */
function SharePreview({ title, description }: { title: string; description: string }) {
  const trimmed = title.trim();
  if (!trimmed) return null;
  const shown = shareTitle(trimmed);
  const cut = trimmed.length > SHARE_TITLE_MAX;
  return (
    <div className="rounded-xl bg-crwn-elevated p-4">
      <p className="text-[11px] uppercase tracking-wide text-crwn-text-secondary mb-2">
        When you paste the link
      </p>
      <div className="border-l-2 border-crwn-gold pl-3">
        <p className="text-sm font-semibold text-crwn-text">{shown}</p>
        {description.trim() && (
          <p className="text-xs text-crwn-text-secondary mt-1 line-clamp-2">{description.trim()}</p>
        )}
      </div>
      {cut && (
        <p className="text-xs text-crwn-text-secondary mt-2">
          Cut at {SHARE_TITLE_MAX} characters. Shorten it and a fan sees the whole thing.
        </p>
      )}
    </div>
  );
}

interface ProviderPost {
  id: string;
  caption: string;
  thumbnailUrl: string | null;
  permalink: string | null;
}

interface ConnectionInfo {
  provider: 'instagram' | 'facebook';
  providerUsername: string | null;
  status: string;
}

/** A saved funnel row, as /api/fan-automations returns it. Reopening reads every field back. */
export interface ExistingAutomation {
  id: string;
  provider: string;
  status: string;
  public_token: string;
  trigger_media_ids: string[];
  trigger_keywords: string[];
  public_reply: string;
  dm_message: string;
  magnet_kind: string | null;
  magnet_title: string;
  magnet_description: string;
  magnet_file_key: string | null;
  magnet_file_name: string | null;
  magnet_track_id: string | null;
  gold_tier_id: string | null;
  gold_item_title: string;
  gold_item_description: string;
  silver_tier_id: string | null;
  nurture_sequence_id: string | null;
  connection_id: string | null;
}

export type AutomationWizardMode = 'full' | 'magnet' | 'funnel';

export interface AutomationSaveResult {
  id: string;
  publicToken: string | null;
  activated: boolean;
}

interface Props {
  ctx: ArtistContext;
  connections: ConnectionInfo[];
  onClose: () => void;
  onSaved: (result: AutomationSaveResult) => void;
  existing?: ExistingAutomation | null;
  mode?: AutomationWizardMode;
  flow?: GuidedFlowKey;
}

type ScreenKey =
  | 'provider' | 'posts' | 'keywords' | 'public-reply' | 'dm'
  | 'magnet-kind' | 'magnet-detail' | 'magnet-title' | 'magnet-promise' | 'magnet-review'
  | 'gold-tier' | 'gold-item' | 'silver-tier' | 'nurture' | 'funnel-review' | 'review';

const inputCls = 'w-full rounded-xl bg-crwn-elevated px-4 py-3 text-sm text-crwn-text placeholder:text-crwn-text-secondary outline-none';

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

export function AutomationWizard({ ctx, connections, onClose, onSaved, existing = null, mode = 'full', flow }: Props) {
  const { showToast } = useToast();

  const paidTiers = useMemo(() => ctx.tiers.filter((t) => t.price > 0), [ctx.tiers]);
  const freeTierName = useMemo(() => ctx.tiers.find((t) => t.price === 0)?.name ?? 'your free tier', [ctx.tiers]);
  const derived = useMemo(() => deriveOfferTiers(ctx.tiers.map((t) => ({ id: t.id, name: t.name, price: t.price }))), [ctx.tiers]);
  const hasActiveConnection = connections.some((c) => c.status === 'active');

  // Stored pointers are re-validated against LIVE tiers: a tier deleted elsewhere resolves to
  // the derivation, never to a dead id.
  const liveOr = (id: string | null | undefined, fallback: string | null) =>
    id && paidTiers.some((t) => t.id === id) ? id : fallback;

  const [provider, setProvider] = useState<'instagram' | 'facebook' | 'link' | null>(
    (existing?.provider as 'instagram' | 'facebook' | 'link' | undefined) ??
      connections.find((c) => c.status === 'active')?.provider ??
      (mode === 'full' ? null : 'link'),
  );
  const [anyPost, setAnyPost] = useState(existing ? existing.trigger_media_ids.length === 0 : true);
  const [selectedPosts, setSelectedPosts] = useState<string[]>(existing?.trigger_media_ids ?? []);
  const [keywords, setKeywords] = useState(existing?.trigger_keywords.join(', ') ?? '');
  const [publicReply, setPublicReply] = useState(existing?.public_reply ?? 'Check your DMs 👑');
  const [dmMessage, setDmMessage] = useState(existing?.dm_message ?? '');
  const [magnetKind, setMagnetKind] = useState<'upload' | 'track' | null>((existing?.magnet_kind as 'upload' | 'track' | null) ?? null);
  const [magnetFileKey, setMagnetFileKey] = useState<string | null>(existing?.magnet_file_key ?? null);
  const [magnetFileName, setMagnetFileName] = useState<string | null>(existing?.magnet_file_name ?? null);
  const [uploading, setUploading] = useState(false);
  const [magnetTrackId, setMagnetTrackId] = useState<string | null>(existing?.magnet_track_id ?? null);
  const [magnetTitle, setMagnetTitle] = useState(existing?.magnet_title ?? '');
  const [magnetDescription, setMagnetDescription] = useState(existing?.magnet_description ?? '');
  const [goldTierId, setGoldTierId] = useState<string | null>(liveOr(existing?.gold_tier_id, derived.gold?.id ?? null));
  const [goldItemTitle, setGoldItemTitle] = useState(existing?.gold_item_title ?? '');
  const [goldItemDescription, setGoldItemDescription] = useState(existing?.gold_item_description ?? '');
  const [silverTierId, setSilverTierId] = useState<string | null>(liveOr(existing?.silver_tier_id, derived.silver?.id ?? null));
  // Optional funnel-specific nurture: which of the artist's sequences a claim through
  // THIS funnel enters (a boxing funnel can nurture differently from a story funnel).
  // Empty = the artist's default free-join sequence, if they have one.
  const [nurtureSequenceId, setNurtureSequenceId] = useState<string | null>(existing?.nurture_sequence_id ?? null);
  const [sequences, setSequences] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sequences?artistId=${ctx.artistId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.sequences) {
          setSequences(d.sequences.filter((q: { is_active: boolean }) => q.is_active).map((q: { id: string; name: string }) => ({ id: q.id, name: q.name })));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [ctx.artistId]);
  const [saving, setSaving] = useState(false);

  const [posts, setPosts] = useState<ProviderPost[] | null>(null);
  const [tracks, setTracks] = useState<{ id: string; title: string }[] | null>(null);

  const connected = provider ? connections.some((c) => c.provider === provider && c.status === 'active') : false;

  useEffect(() => {
    if (!provider || !connected) return;
    fetch(`/api/social-connect/media?artistId=${ctx.artistId}&provider=${provider}`)
      .then((r) => r.json())
      .then((d) => setPosts(Array.isArray(d.posts) ? d.posts : []))
      .catch(() => setPosts([]));
  }, [provider, connected, ctx.artistId]);

  // Any of the artist's active tracks can be the gift (the server validates the same set).
  // The fan receives a short-lived signed link at claim time, so a members-only track stays
  // members-only on the page and still opens for the person who just joined.
  useEffect(() => {
    supabase
      .from('tracks')
      .select('id, title, is_active')
      .eq('artist_id', ctx.artistId)
      .then(({ data }) => setTracks((data || []).filter((t) => t.is_active !== false).map((t) => ({ id: t.id, title: t.title }))));
  }, [ctx.artistId]);

  const startConnect = useCallback(async (p: 'instagram' | 'facebook') => {
    const res = await fetch('/api/social-connect/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artistId: ctx.artistId, provider: p }),
    });
    const data = await res.json();
    if (res.ok && data.url) {
      window.location.href = data.url; // external Meta authorize URL
    } else {
      showToast(data.error || 'Could not start the connection.', 'error');
    }
  }, [ctx.artistId, showToast]);

  const uploadMagnet = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const res = await fetch('/api/fan-automations/magnet-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistId: ctx.artistId, filename: file.name, contentType: file.type }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Upload failed.', 'error');
        return;
      }
      const put = await fetch(data.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      if (!put.ok) {
        showToast('Upload failed. Try again.', 'error');
        return;
      }
      setMagnetFileKey(data.key);
      setMagnetFileName(data.filename);
      showToast('File uploaded.', 'success');
    } finally {
      setUploading(false);
    }
  }, [ctx.artistId, showToast]);

  // LINK ONLY is a first-class source, not a workaround. An artist whose traffic comes
  // from a bio link, a QR code, or an external tool like ManyChat needs the same funnel
  // with none of the Meta machinery, and the comment matcher already only routes events
  // through automations that HAVE a connection, so a connection-less funnel simply never
  // receives a comment. Everything after "the drop" is identical, which is the point:
  // one engine, and the link is another way in.
  const linkOnly = provider === 'link';
  const metaScreens: { key: ScreenKey; group: string }[] = linkOnly
    ? []
    : [
        { key: 'posts', group: 'Listen' },
        { key: 'keywords', group: 'Listen' },
        { key: 'public-reply', group: 'Reply' },
        { key: 'dm', group: 'Reply' },
      ];
  const magnetScreens: { key: ScreenKey; group: string }[] = [
    { key: 'magnet-kind', group: 'The drop' },
    { key: 'magnet-detail', group: 'The drop' },
    { key: 'magnet-title', group: 'The drop' },
    { key: 'magnet-promise', group: 'The drop' },
  ];
  const goldTier = paidTiers.find((t) => t.id === goldTierId) ?? null;
  const cheaperExists = !!goldTier && paidTiers.some((t) => t.id !== goldTier.id && t.price < goldTier.price);
  // The tier question is asked only when there is a choice to make.
  const askGoldTier = paidTiers.length !== 1;

  const screens: { key: ScreenKey; group: string }[] =
    mode === 'magnet'
      ? [
          // A new funnel for an artist with a connection may still be a comment funnel; a
          // saved row already knows its source, and an artist with no connection has one answer.
          ...(!existing && hasActiveConnection ? [{ key: 'provider' as const, group: 'Source' }] : []),
          ...(existing || !hasActiveConnection ? [] : metaScreens),
          ...magnetScreens,
          { key: 'magnet-review', group: 'Preview' },
        ]
      : mode === 'funnel'
        ? [
            ...(askGoldTier ? [{ key: 'gold-tier' as const, group: 'The offer' }] : []),
            { key: 'gold-item', group: 'The offer' },
            ...(cheaperExists ? [{ key: 'silver-tier' as const, group: 'The offer' }] : []),
            ...(sequences.length > 0 ? [{ key: 'nurture' as const, group: 'Follow-up' }] : []),
            { key: 'funnel-review', group: 'Turn it on' },
          ]
        : [
            { key: 'provider', group: 'Source' },
            ...metaScreens,
            ...magnetScreens,
            { key: 'gold-tier', group: 'The offer' },
            { key: 'gold-item', group: 'The offer' },
            { key: 'silver-tier', group: 'The offer' },
            { key: 'review', group: 'Launch' },
          ];

  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, screens.length - 1);
  const screen = screens[safeIndex].key;

  // Resume once, from the row, after the tracks list arrives (a track magnet's validity needs it).
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || mode === 'full' || tracks === null) return;
    resumed.current = true;
    const key: ScreenKey =
      mode === 'magnet'
        ? magnetResumeScreen(existing, (id) => tracks.some((t) => t.id === id))
        : existing
          ? funnelResumeScreen(existing, paidTiers.map((t) => t.id), askGoldTier)
          : 'gold-item';
    const at = screens.findIndex((s) => s.key === key);
    setIndex(at >= 0 ? at : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, mode]);

  // Telemetry when launched from Rise Mode.
  const started = useRef(false);
  useEffect(() => {
    if (!flow) return;
    if (!started.current) {
      started.current = true;
      guidedSetupTelemetry.started({ flow, artistId: ctx.artistId, step: safeIndex + 1, totalSteps: screens.length });
    }
    guidedSetupTelemetry.stepReached({ flow, artistId: ctx.artistId, step: safeIndex + 1, totalSteps: screens.length });
  }, [flow, ctx.artistId, safeIndex, screens.length]);

  const canContinue = (): boolean => {
    switch (screen) {
      case 'provider': return provider === 'link' ? true : (!!provider && connected);
      case 'posts': return anyPost || selectedPosts.length > 0;
      case 'dm': return dmMessage.trim().length > 0;
      case 'magnet-kind': return magnetKind !== null;
      case 'magnet-detail': return magnetKind === 'upload' ? !!magnetFileKey : !!magnetTrackId;
      case 'magnet-title': return magnetTitle.trim().length > 0;
      case 'gold-tier': return !!goldTierId;
      case 'gold-item': return goldItemTitle.trim().length > 0 && !!goldTierId;
      case 'funnel-review': return !!goldTierId && !!magnetKind;
      default: return true;
    }
  };

  const save = useCallback(async (activate: boolean) => {
    setSaving(true);
    try {
      const fields = {
        triggerMediaIds: anyPost ? [] : selectedPosts,
        triggerKeywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
        publicReply,
        dmMessage,
        magnetKind,
        magnetTitle,
        magnetDescription,
        magnetFileKey,
        magnetFileName,
        magnetTrackId,
        goldTierId,
        goldItemTitle,
        goldItemDescription,
        silverTierId,
        nurtureSequenceId,
      };
      let id = existing?.id ?? null;
      let publicToken = existing?.public_token ?? null;
      if (!id) {
        const res = await fetch('/api/fan-automations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ artistId: ctx.artistId, provider, ...fields }),
        });
        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || 'Could not save.', 'error');
          return;
        }
        id = data.id;
        publicToken = data.publicToken ?? null;
      } else {
        const res = await fetch(`/api/fan-automations/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ artistId: ctx.artistId, fields }),
        });
        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || 'Could not save.', 'error');
          return;
        }
      }
      let activated = false;
      if (activate && id) {
        const act = await fetch(`/api/fan-automations/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ artistId: ctx.artistId, action: 'activate' }),
        });
        const actData = await act.json();
        if (!act.ok) {
          showToast(actData.error || 'Saved. Finish the missing piece to turn it on.', 'warning');
          onSaved({ id: id!, publicToken, activated: false });
          return;
        }
        activated = true;
      }
      showToast(activated ? 'Your funnel is live.' : mode === 'magnet' ? 'Saved. Your gift is ready for the funnel.' : 'Draft saved.', 'success');
      onSaved({ id: id!, publicToken, activated });
    } finally {
      setSaving(false);
    }
  }, [ctx.artistId, existing, mode, provider, anyPost, selectedPosts, keywords, publicReply, dmMessage, magnetKind, magnetTitle, magnetDescription, magnetFileKey, magnetFileName, magnetTrackId, goldTierId, goldItemTitle, goldItemDescription, silverTierId, nurtureSequenceId, onSaved, showToast]);

  const tierLabel = (id: string | null) => {
    const t = paidTiers.find((x) => x.id === id);
    return t ? `${t.name} (${money(t.price)}/mo)` : 'Not set';
  };
  const jumpTo = (key: ScreenKey) => {
    const at = screens.findIndex((s) => s.key === key);
    if (at >= 0) setIndex(at);
  };

  const body = () => {
    switch (screen) {
      case 'provider':
        return (
          <div className="space-y-4">
            <OptionSelect
              options={[
                { value: 'link', label: 'A link I share', hint: 'Bio, story, QR code, or any tool you already use' },
                { value: 'instagram', label: 'Instagram', hint: 'Comments on your professional account' },
                { value: 'facebook', label: 'Facebook Page', hint: 'Comments on your Page posts' },
              ]}
              value={provider}
              onChange={(v) => setProvider(v as 'instagram' | 'facebook' | 'link')}
              placeholder="Where do fans come from?"
            />
            {linkOnly && (
              <p className="text-sm text-crwn-text-secondary">
                CRWN gives you a link. Put it anywhere: your bio, a story, a QR code, or a tool
                like ManyChat. Everything after this is the same, and you can connect a social
                account later without rebuilding it.
              </p>
            )}
            {provider && provider !== 'link' && !connected && (
              <div className="rounded-xl bg-crwn-elevated p-4">
                <p className="text-sm text-crwn-text-secondary mb-3">
                  Every comment on an unconnected account is a fan you never hear from. Connect once and CRWN answers all of them.
                </p>
                <button
                  onClick={() => startConnect(provider)}
                  className="px-5 py-2.5 rounded-full font-semibold text-sm bg-crwn-gold text-crwn-bg press-scale"
                >
                  Connect {provider === 'instagram' ? 'Instagram' : 'Facebook'}
                </button>
              </div>
            )}
            {provider && provider !== 'link' && connected && (
              <p className="text-sm text-crwn-text-secondary flex items-center gap-2">
                <Check className="w-4 h-4 text-crwn-gold" /> Connected
              </p>
            )}
          </div>
        );
      case 'posts':
        return (
          <div className="space-y-4">
            <div className="flex gap-2">
              <button
                onClick={() => setAnyPost(true)}
                className={`px-4 py-2 rounded-full text-sm font-medium ${anyPost ? 'bg-crwn-gold text-crwn-bg' : 'bg-crwn-elevated text-crwn-text-secondary'}`}
              >
                Any post
              </button>
              <button
                onClick={() => setAnyPost(false)}
                className={`px-4 py-2 rounded-full text-sm font-medium ${!anyPost ? 'bg-crwn-gold text-crwn-bg' : 'bg-crwn-elevated text-crwn-text-secondary'}`}
              >
                Specific posts
              </button>
            </div>
            {!anyPost && (
              posts === null ? (
                <p className="text-sm text-crwn-text-secondary">Loading your recent posts…</p>
              ) : posts.length === 0 ? (
                <p className="text-sm text-crwn-text-secondary">No recent posts found on the connected account.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {posts.map((p) => {
                    const on = selectedPosts.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedPosts((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 ${on ? 'border-crwn-gold' : 'border-transparent'}`}
                      >
                        {p.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-crwn-elevated flex items-center justify-center p-2">
                            <span className="text-[10px] text-crwn-text-secondary line-clamp-4">{p.caption || 'Post'}</span>
                          </div>
                        )}
                        {on && (
                          <span className="absolute top-1 right-1 bg-crwn-gold rounded-full p-0.5">
                            <Check className="w-3 h-3 text-crwn-bg" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )
            )}
          </div>
        );
      case 'keywords':
        return (
          <div className="space-y-3">
            <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="e.g. DROP, VAULT" className={inputCls} />
            <p className="text-xs text-crwn-text-secondary">
              Separate keywords with commas. Leave it empty and every comment on the posts you picked gets the DM.
            </p>
          </div>
        );
      case 'public-reply':
        return (
          <div className="space-y-3">
            <input value={publicReply} onChange={(e) => setPublicReply(e.target.value)} maxLength={300} className={inputCls} />
            <p className="text-xs text-crwn-text-secondary">
              Everyone scrolling sees this under their comment. Leave it empty to skip the public reply.
            </p>
          </div>
        );
      case 'dm':
        return (
          <div className="space-y-3">
            <textarea value={dmMessage} onChange={(e) => setDmMessage(e.target.value)} maxLength={900} rows={5} placeholder={"You asked, here it is. This is the record nobody outside my circle has heard yet."} className={inputCls} />
            <p className="text-xs text-crwn-text-secondary">
              CRWN adds your drop link at the end automatically. This is the one message the platform lets you send, so make it count.
            </p>
          </div>
        );
      case 'magnet-kind':
        return (
          <OptionSelect
            options={[
              { value: 'track', label: 'One of my tracks', hint: 'A song from your CRWN page, delivered privately' },
              { value: 'upload', label: 'A file I upload', hint: 'Unreleased track, PDF, stems, a video' },
            ]}
            value={magnetKind}
            onChange={(v) => setMagnetKind(v as 'upload' | 'track')}
            placeholder="What do fans get?"
          />
        );
      case 'magnet-detail':
        return magnetKind === 'upload' ? (
          <div className="space-y-3">
            <label className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-crwn-elevated p-8 cursor-pointer text-sm text-crwn-text-secondary">
              <Upload className="w-4 h-4 text-crwn-gold" />
              {uploading ? 'Uploading…' : magnetFileName ? magnetFileName : 'Tap to upload (audio, PDF, ZIP, image, MP4)'}
              <input
                type="file"
                className="hidden"
                accept="audio/*,application/pdf,application/zip,image/*,video/mp4"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadMagnet(f); }}
              />
            </label>
            <p className="text-xs text-crwn-text-secondary">Fans get a private, expiring download link. The file never gets a public URL.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <OptionSelect
              options={(tracks ?? []).map((t) => ({ value: t.id, label: t.title }))}
              value={magnetTrackId}
              onChange={setMagnetTrackId}
              placeholder={tracks === null ? 'Loading your tracks…' : tracks.length ? 'Pick a track' : 'No tracks yet'}
            />
            <p className="text-xs text-crwn-text-secondary">
              A members-only track stays locked on your page. The fan who just joined gets a private link that expires.
            </p>
          </div>
        );
      case 'magnet-title':
        return (
          <div className="space-y-3">
            <input value={magnetTitle} onChange={(e) => setMagnetTitle(e.target.value)} maxLength={120} placeholder='e.g. "Unreleased: Midnight Tape"' className={inputCls} />
            <SharePreview title={magnetTitle} description={magnetDescription} />
          </div>
        );
      case 'magnet-promise':
        return (
          <div className="space-y-3">
            <textarea value={magnetDescription} onChange={(e) => setMagnetDescription(e.target.value)} maxLength={500} rows={3} placeholder="One line on why they want it" className={inputCls} />
            <p className="text-xs text-crwn-text-secondary">Optional. Shows on the drop page above the email box, and under the title wherever the link is pasted.</p>
            <SharePreview title={magnetTitle} description={magnetDescription} />
          </div>
        );
      case 'magnet-review':
        return (
          <div className="space-y-3 text-sm">
            <SharePreview title={magnetTitle} description={magnetDescription} />
            <ol className="space-y-2 rounded-xl bg-crwn-elevated p-4 list-decimal list-inside text-crwn-text">
              <li>A fan opens your link and sees <span className="font-semibold">{magnetTitle || 'your gift'}</span>.</li>
              <li>They enter an email. No account, no password.</li>
              <li>CRWN delivers {magnetKind === 'track' ? 'the track' : 'the file'} right there, and joins them to {freeTierName}.</li>
              <li>Then they see your paid offer. That part is the next move.</li>
            </ol>
            {existing?.public_token && (
              <a
                href={`/drop/${existing.public_token}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-crwn-gold text-sm press-scale"
              >
                Open the real page as a preview
              </a>
            )}
            <p className="text-xs text-crwn-text-secondary">
              Saved as a draft. Your link opens only after you turn the funnel on.
            </p>
          </div>
        );
      case 'gold-tier':
        return paidTiers.length === 0 ? (
          <div className="rounded-xl bg-crwn-elevated p-4 text-sm text-crwn-text-secondary">
            Without a paid tier this funnel stops at the free list, and the fans it catches have nothing to buy.{' '}
            <a href={guidedFlowHref('offer')} className="text-crwn-gold">Build your offer</a> first.
          </div>
        ) : (
          <OptionSelect
            options={paidTiers.map((t) => ({ value: t.id, label: t.name, hint: `${money(t.price)}/mo` }))}
            value={goldTierId}
            onChange={setGoldTierId}
            placeholder="Which tier do you offer?"
          />
        );
      case 'gold-item':
        return (
          <div className="space-y-3">
            <input value={goldItemTitle} onChange={(e) => setGoldItemTitle(e.target.value)} maxLength={120} placeholder='e.g. "The full Midnight Sessions vault"' className={inputCls} />
            <textarea value={goldItemDescription} onChange={(e) => setGoldItemDescription(e.target.value)} maxLength={500} rows={3} placeholder="One or two lines selling it" className={inputCls} />
            <p className="text-xs text-crwn-text-secondary">
              Name the single best thing inside {tierLabel(goldTierId)}. Fans see the tease, members get the thing.
            </p>
          </div>
        );
      case 'silver-tier': {
        const options = paidTiers
          .filter((t) => t.id !== goldTierId && (goldTier?.price ?? Infinity) > t.price)
          .map((t) => ({ value: t.id, label: t.name, hint: `${money(t.price)}/mo` }));
        return options.length === 0 ? (
          <div className="rounded-xl bg-crwn-elevated p-4 text-sm text-crwn-text-secondary">
            No tier sits under your offer yet, so fans who hesitate have nowhere cheaper to land and simply leave.{' '}
            <a href={guidedFlowHref('offer')} className="text-crwn-gold">Add a lower tier</a> to catch them. You can turn it on without one.
          </div>
        ) : (
          <OptionSelect options={options} value={silverTierId} onChange={setSilverTierId} placeholder="The fallback offer" />
        );
      }
      case 'nurture':
        return (
          <div className="space-y-3">
            <OptionSelect
              options={[{ value: '', label: 'My free-join follow-up', hint: 'Whichever sequence is switched on for new free members' }, ...sequences.map((q) => ({ value: q.id, label: q.name }))]}
              value={nurtureSequenceId ?? ''}
              onChange={(v) => setNurtureSequenceId(v || null)}
              placeholder="My free-join follow-up"
            />
            <p className="text-xs text-crwn-text-secondary">
              Fans who claim this drop enter this sequence. It stops for anyone who buys past its goal.
            </p>
          </div>
        );
      case 'funnel-review': {
        const line = (k: string, v: string, key?: ScreenKey) => (
          <div key={k} className="rounded-xl bg-crwn-elevated p-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-crwn-text-secondary">{k}</p>
              <p className="text-crwn-text mt-1">{v}</p>
            </div>
            {key && screens.some((s) => s.key === key) && (
              <button type="button" onClick={() => jumpTo(key)} className="text-xs text-crwn-gold shrink-0 press-scale">Change</button>
            )}
          </div>
        );
        const seqName = nurtureSequenceId ? sequences.find((q) => q.id === nurtureSequenceId)?.name : null;
        return (
          <div className="space-y-3 text-sm">
            {line('They join free into', freeTierName)}
            {line('They get', magnetTitle || 'your gift')}
            {line('Then they see', `${goldItemTitle || 'your standout item'} inside ${tierLabel(goldTierId)}`, askGoldTier ? 'gold-tier' : 'gold-item')}
            {line('If they say no', silverTierId ? tierLabel(silverTierId) : 'No cheaper option. They stay free.', cheaperExists ? 'silver-tier' : undefined)}
            {line(
              'If they still do not buy',
              seqName ? `They hear from you: ${seqName}.` : sequences.length ? 'They hear from your free-join follow-up, if one is on.' : 'They hear nothing yet. Follow-up is the next move, and turning on does not wait for it.',
              sequences.length ? 'nurture' : undefined,
            )}
            <p className="text-xs text-crwn-text-secondary">Turning it on makes your link live. You can pause it any time from Fan Automations.</p>
          </div>
        );
      }
      case 'review':
        return (
          <div className="space-y-3 text-sm">
            {sequences.length > 0 ? (
              <div className="rounded-xl bg-crwn-elevated p-3">
                <p className="text-xs uppercase tracking-wide text-crwn-text-secondary mb-2">Nurture after the claim (optional)</p>
                <OptionSelect
                  options={[{ value: '', label: 'My default free-join sequence' }, ...sequences.map((q) => ({ value: q.id, label: q.name }))]}
                  value={nurtureSequenceId ?? ''}
                  onChange={(v) => setNurtureSequenceId(v || null)}
                  placeholder="My default free-join sequence"
                />
                <p className="text-[11px] text-crwn-text-secondary/70 mt-1.5">
                  Fans who claim this drop enter this email sequence. It stops for anyone who upgrades past its goal.
                </p>
              </div>
            ) : null}
            {[
              ['Trigger', `${keywords.trim() ? `Comments with "${keywords}"` : 'Any comment'} on ${anyPost ? 'any post' : `${selectedPosts.length} post${selectedPosts.length === 1 ? '' : 's'}`} (${provider})`],
              ['Public reply', publicReply || 'None'],
              ['Private message', dmMessage || 'Not written yet'],
              ['The drop', magnetTitle || 'Not set'],
              ['Free membership', 'Fans join your free tier when they claim it'],
              ['The offer', `${goldItemTitle || 'Standout item not named'} inside ${tierLabel(goldTierId)}`],
              ['If they pass', silverTierId ? tierLabel(silverTierId) : 'No downsell'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-crwn-elevated p-3">
                <p className="text-xs uppercase tracking-wide text-crwn-text-secondary">{k}</p>
                <p className="text-crwn-text mt-1 whitespace-pre-wrap">{v}</p>
              </div>
            ))}
            <button
              onClick={() => save(false)}
              disabled={saving}
              className="w-full py-3 rounded-full text-sm font-medium bg-crwn-elevated text-crwn-text press-scale disabled:opacity-60"
            >
              Save as draft
            </button>
          </div>
        );
    }
  };

  const titles: Record<ScreenKey, [string, string]> = {
    'provider': ['Where should CRWN listen?', 'Comments there become fans here.'],
    'posts': ['Which posts?', 'All of them, or just the ones announcing this drop.'],
    'keywords': ['Which comments trigger it?', 'A keyword keeps it intentional. Empty means everyone.'],
    'public-reply': ['What should people see after they comment?', 'This shows publicly under their comment.'],
    'dm': ['What do you want CRWN to send them privately?', 'Write it like a DM to one fan.'],
    'magnet-kind': ['What can you give a fan right now?', 'The gift is the reason a stranger hands you their email. It is delivered the second they do.'],
    'magnet-detail': ['The gift itself', ''],
    'magnet-title': ['Name it', 'The headline on your drop page, and on the link preview anywhere you paste it.'],
    'magnet-promise': ['Why do they want it?', ''],
    'magnet-review': ['What a fan will see', 'The page your link opens, in words.'],
    'gold-tier': ['After the gift, what do you offer?', 'The membership a brand-new fan should want most.'],
    'gold-item': ['The standout item', 'The one thing inside that tier a new fan cannot get anywhere else.'],
    'silver-tier': ['If they say not now', 'A lighter option catches the fans the big offer loses.'],
    'nurture': ['Who follows up when they do not buy?', 'Fans who join free enter this sequence. It stops the moment they buy.'],
    'funnel-review': ['Confirm the path', 'This is exactly what a fan will experience.'],
    'review': ['Look it over', 'This is exactly what a fan will experience.'],
  };

  const continueLabel =
    screen === 'review' ? 'Activate automation'
      : screen === 'funnel-review' ? 'Turn it on'
        : screen === 'magnet-review' ? 'Save my gift'
          : 'Continue';

  return (
    <Wizard
      steps={screens.map((s) => ({ id: s.key, group: s.group }))}
      currentIndex={safeIndex}
      title={titles[screen][0]}
      subtitle={titles[screen][1] || undefined}
      onBack={safeIndex > 0 ? () => setIndex((i) => i - 1) : undefined}
      onContinue={() => {
        if (screen === 'review' || screen === 'funnel-review') { void save(true); return; }
        if (screen === 'magnet-review') { void save(false); return; }
        setIndex((i) => Math.min(i + 1, screens.length - 1));
      }}
      continueLabel={continueLabel}
      continueDisabled={!canContinue()}
      continueLoading={saving}
      onSkip={['keywords', 'magnet-promise', 'silver-tier', 'nurture'].includes(screen) ? () => setIndex((i) => Math.min(i + 1, screens.length - 1)) : undefined}
      onClose={onClose}
      stickyFooter={!!flow}
    >
      {body()}
    </Wizard>
  );
}
