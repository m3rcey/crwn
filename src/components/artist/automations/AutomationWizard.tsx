'use client';

// The Fan Automation setup wizard: plain-English questions, one decision per screen, on the
// shared Wizard primitive. The artist never sees a webhook, a token, a trigger graph, or a
// node: they answer what should happen and CRWN builds the automation.
//
// Screen order mirrors the fan's journey: where CRWN listens -> which comments -> what
// people see -> what CRWN sends -> what fans get -> the Gold offer -> the Silver fallback
// -> review. Gold/Silver default from deriveOfferTiers over the artist's LIVE tiers and stay
// editable; prices always render from those rows, never from anything typed here.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Upload } from 'lucide-react';
import { Wizard } from '@/components/ui/Wizard';
import { OptionSelect } from '@/components/ui/OptionSelect';
import { useToast } from '@/components/shared/Toast';
import { supabase } from '@/lib/supabase/client';
import { deriveOfferTiers } from '@/lib/fanAutomations/offerTiers';
import type { ArtistContext } from '@/hooks/useArtistContext';

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

interface Props {
  ctx: ArtistContext;
  connections: ConnectionInfo[];
  onClose: () => void;
  onSaved: () => void;
}

type ScreenKey =
  | 'provider' | 'posts' | 'keywords' | 'public-reply' | 'dm'
  | 'magnet-kind' | 'magnet-detail' | 'magnet-title' | 'magnet-promise'
  | 'gold-tier' | 'gold-item' | 'silver-tier' | 'review';

const inputCls = 'w-full rounded-xl bg-crwn-elevated px-4 py-3 text-sm text-crwn-text placeholder:text-crwn-text-secondary outline-none';

export function AutomationWizard({ ctx, connections, onClose, onSaved }: Props) {
  const { showToast } = useToast();

  const paidTiers = useMemo(() => ctx.tiers.filter((t) => t.price > 0), [ctx.tiers]);
  const derived = useMemo(() => deriveOfferTiers(ctx.tiers.map((t) => ({ id: t.id, name: t.name, price: t.price }))), [ctx.tiers]);

  const [provider, setProvider] = useState<'instagram' | 'facebook' | 'link' | null>(
    connections.find((c) => c.status === 'active')?.provider ?? null,
  );
  const [anyPost, setAnyPost] = useState(true);
  const [selectedPosts, setSelectedPosts] = useState<string[]>([]);
  const [keywords, setKeywords] = useState('');
  const [publicReply, setPublicReply] = useState('Check your DMs 👑');
  const [dmMessage, setDmMessage] = useState('');
  const [magnetKind, setMagnetKind] = useState<'upload' | 'track' | null>(null);
  const [magnetFileKey, setMagnetFileKey] = useState<string | null>(null);
  const [magnetFileName, setMagnetFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [magnetTrackId, setMagnetTrackId] = useState<string | null>(null);
  const [magnetTitle, setMagnetTitle] = useState('');
  const [magnetDescription, setMagnetDescription] = useState('');
  const [goldTierId, setGoldTierId] = useState<string | null>(derived.gold?.id ?? null);
  const [goldItemTitle, setGoldItemTitle] = useState('');
  const [goldItemDescription, setGoldItemDescription] = useState('');
  const [silverTierId, setSilverTierId] = useState<string | null>(derived.silver?.id ?? null);
  // Optional funnel-specific nurture: which of the artist's sequences a claim through
  // THIS funnel enters (a boxing funnel can nurture differently from a story funnel).
  // Empty = the artist's default free-join sequence, if they have one.
  const [nurtureSequenceId, setNurtureSequenceId] = useState<string | null>(null);
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
  const [freeTracks, setFreeTracks] = useState<{ id: string; title: string }[]>([]);

  const connected = provider ? connections.some((c) => c.provider === provider && c.status === 'active') : false;

  useEffect(() => {
    if (!provider || !connected) return;
    fetch(`/api/social-connect/media?artistId=${ctx.artistId}&provider=${provider}`)
      .then((r) => r.json())
      .then((d) => setPosts(Array.isArray(d.posts) ? d.posts : []))
      .catch(() => setPosts([]));
  }, [provider, connected, ctx.artistId]);

  useEffect(() => {
    supabase
      .from('tracks')
      .select('id, title')
      .eq('artist_id', ctx.artistId)
      .eq('is_free', true)
      .then(({ data }) => setFreeTracks(data || []));
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
  const screens: { key: ScreenKey; group: string }[] = [
    { key: 'provider', group: 'Source' },
    ...(linkOnly ? [] : ([
      { key: 'posts', group: 'Listen' },
      { key: 'keywords', group: 'Listen' },
      { key: 'public-reply', group: 'Reply' },
      { key: 'dm', group: 'Reply' },
    ] as { key: ScreenKey; group: string }[])),
    { key: 'magnet-kind', group: 'The drop' },
    { key: 'magnet-detail', group: 'The drop' },
    { key: 'magnet-title', group: 'The drop' },
    { key: 'magnet-promise', group: 'The drop' },
    { key: 'gold-tier', group: 'The offer' },
    { key: 'gold-item', group: 'The offer' },
    { key: 'silver-tier', group: 'The offer' },
    { key: 'review', group: 'Launch' },
  ];
  const [index, setIndex] = useState(0);
  const screen = screens[index].key;

  const canContinue = (): boolean => {
    switch (screen) {
      case 'provider': return provider === 'link' ? true : (!!provider && connected);
      case 'posts': return anyPost || selectedPosts.length > 0;
      case 'dm': return dmMessage.trim().length > 0;
      case 'magnet-kind': return magnetKind !== null;
      case 'magnet-detail': return magnetKind === 'upload' ? !!magnetFileKey : !!magnetTrackId;
      case 'magnet-title': return magnetTitle.trim().length > 0;
      case 'gold-tier': return !!goldTierId;
      case 'gold-item': return goldItemTitle.trim().length > 0;
      default: return true;
    }
  };

  const save = useCallback(async (activate: boolean) => {
    setSaving(true);
    try {
      const payload = {
        artistId: ctx.artistId,
        provider,
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
      const res = await fetch('/api/fan-automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Could not save.', 'error');
        return;
      }
      if (activate) {
        const act = await fetch(`/api/fan-automations/${data.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ artistId: ctx.artistId, action: 'activate' }),
        });
        const actData = await act.json();
        if (!act.ok) {
          showToast(actData.error || 'Saved as a draft. Finish the missing piece to turn it on.', 'warning');
          onSaved();
          return;
        }
      }
      showToast(activate ? 'Your automation is live.' : 'Draft saved.', 'success');
      onSaved();
    } finally {
      setSaving(false);
    }
  }, [ctx.artistId, provider, anyPost, selectedPosts, keywords, publicReply, dmMessage, magnetKind, magnetTitle, magnetDescription, magnetFileKey, magnetFileName, magnetTrackId, goldTierId, goldItemTitle, goldItemDescription, silverTierId, nurtureSequenceId, onSaved, showToast]);

  const tierLabel = (id: string | null) => {
    const t = paidTiers.find((x) => x.id === id);
    return t ? `${t.name} ($${(t.price / 100).toFixed(0)}/mo)` : 'Not set';
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
              { value: 'upload', label: 'A file I upload', hint: 'Unreleased track, PDF, stems, a video' },
              { value: 'track', label: 'One of my free tracks', hint: 'Already on your CRWN page' },
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
          <OptionSelect
            options={freeTracks.map((t) => ({ value: t.id, label: t.title }))}
            value={magnetTrackId}
            onChange={setMagnetTrackId}
            placeholder={freeTracks.length ? 'Pick a free track' : 'No free tracks yet'}
          />
        );
      case 'magnet-title':
        return (
          <input value={magnetTitle} onChange={(e) => setMagnetTitle(e.target.value)} maxLength={120} placeholder='e.g. "Unreleased: Midnight Tape"' className={inputCls} />
        );
      case 'magnet-promise':
        return (
          <div className="space-y-3">
            <textarea value={magnetDescription} onChange={(e) => setMagnetDescription(e.target.value)} maxLength={500} rows={3} placeholder="One line on why they want it" className={inputCls} />
            <p className="text-xs text-crwn-text-secondary">Optional. Shows on the drop page above the email box.</p>
          </div>
        );
      case 'gold-tier':
        return paidTiers.length === 0 ? (
          <div className="rounded-xl bg-crwn-elevated p-4 text-sm text-crwn-text-secondary">
            Without a paid tier this automation stops at the free list, and the fans it catches have nothing to buy.{' '}
            <a href="/account/tiers" className="text-crwn-gold">Set up your tiers</a> first.
          </div>
        ) : (
          <OptionSelect
            options={paidTiers.map((t) => ({ value: t.id, label: t.name, hint: `$${(t.price / 100).toFixed(0)}/mo` }))}
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
          .filter((t) => t.id !== goldTierId && (paidTiers.find((g) => g.id === goldTierId)?.price ?? Infinity) > t.price)
          .map((t) => ({ value: t.id, label: t.name, hint: `$${(t.price / 100).toFixed(0)}/mo` }));
        return options.length === 0 ? (
          <div className="rounded-xl bg-crwn-elevated p-4 text-sm text-crwn-text-secondary">
            No tier sits under your offer yet, so fans who hesitate have nowhere cheaper to land and simply leave.{' '}
            <a href="/account/tiers" className="text-crwn-gold">Add a lower tier</a> to catch them. You can activate without one.
          </div>
        ) : (
          <OptionSelect options={options} value={silverTierId} onChange={setSilverTierId} placeholder="The fallback offer" />
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
    'magnet-kind': ['What do they get?', 'The drop is the reason they hand you their email.'],
    'magnet-detail': ['The drop itself', ''],
    'magnet-title': ['Name the drop', 'This is the headline on your drop page.'],
    'magnet-promise': ['Why do they want it?', ''],
    'gold-tier': ['After the drop, what do you offer?', 'The membership a brand-new fan should want most.'],
    'gold-item': ['The standout item', 'The one thing inside that tier a new fan cannot get anywhere else.'],
    'silver-tier': ['If they say not now', 'A lighter option catches the fans the big offer loses.'],
    'review': ['Look it over', 'This is exactly what a fan will experience.'],
  };

  return (
    <Wizard
      steps={screens.map((s) => ({ id: s.key, group: s.group }))}
      currentIndex={index}
      title={titles[screen][0]}
      subtitle={titles[screen][1] || undefined}
      onBack={index > 0 ? () => setIndex((i) => i - 1) : undefined}
      onContinue={() => {
        if (screen === 'review') { void save(true); return; }
        setIndex((i) => Math.min(i + 1, screens.length - 1));
      }}
      continueLabel={screen === 'review' ? 'Activate automation' : 'Continue'}
      continueDisabled={!canContinue()}
      continueLoading={saving}
      onSkip={['keywords', 'magnet-promise', 'silver-tier'].includes(screen) ? () => setIndex((i) => i + 1) : undefined}
      onClose={onClose}
    >
      {body()}
    </Wizard>
  );
}
