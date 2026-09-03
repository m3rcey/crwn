'use client';

// "Launch it": your funnel is ready. Here is the link, here is where to put it.
//
// Not a publishing scheduler and not a Meta integration. The artist gets the canonical drop
// link, a copy button, a print-ready QR (the same client-side encoder Song Lab uses), and picks
// ONE place to put it first: their bio, a post or story (copy from the existing Launch Kit
// generator, with the funnel link as the URL), an email to fans they already have (the Launch
// Kit's campaign drafts), or comment-to-DM (the automations screen, optional, never forced).
// Every action records the EXISTING fan_invited funnel event with a funnel_* method, which is
// what completes "Launch it" on the roadmap. Nothing new is stored.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, QrCode } from 'lucide-react';
import { useToast } from '@/components/shared/Toast';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { OptionSelect } from '@/components/ui/OptionSelect';
import { buildLaunchKit } from '@/lib/launchCampaign';
import { guidedFlowHref } from '@/lib/guidedSetup/flows';
import { guidedSetupTelemetry } from '@/lib/guidedSetup/telemetry';
import type { GuidedFlowProps } from '../types';
import { GuidedShell, Why } from '../GuidedShell';

type Path = 'bio' | 'post' | 'email' | 'dm';

interface Readiness {
  funnel: { id: string; status: string; publicToken: string | null; url: string | null } | null;
  primaryTier: { id: string; name: string; price: number } | null;
  readyForTraffic: boolean;
}

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

async function openQrSheet(url: string, artistName: string) {
  const QR = await import('qrcode');
  const dataUrl = await QR.toDataURL(url, { width: 1200, margin: 4, errorCorrectionLevel: 'H', color: { dark: '#000000', light: '#FFFFFF' } });
  const shortUrl = url.replace(/^https?:\/\//, '');
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>${artistName} on CRWN</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>body{font-family:Arial,Helvetica,sans-serif;background:#fff;color:#000;text-align:center;padding:24px}img{width:min(80vw,520px);height:auto}p{font-size:20px;margin:16px 0}.url{font-size:28px;font-weight:700;word-break:break-all}</style>
</head><body><img src="${dataUrl}" alt="QR code" /><p>Point your phone camera at the square.</p><p class="url">${shortUrl}</p><p>No camera? Type the address.</p></body></html>`);
  w.document.close();
}

export default function LaunchFlow({ context, entry }: GuidedFlowProps) {
  const router = useRouter();
  const { profile } = useAuth();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const { showToast } = useToast();
  const [r, setR] = useState<Readiness | null>(null);
  const [contactCount, setContactCount] = useState(0);
  const [path, setPath] = useState<Path | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      const [ready, contacts] = await Promise.all([
        fetch('/api/funnel-readiness').then((x) => (x.ok ? x.json() : null)).catch(() => null),
        supabase.from('fan_contacts').select('id', { count: 'exact', head: true }).eq('artist_id', context.artistId),
      ]);
      if (!active) return;
      setR(ready);
      setContactCount(contacts.count ?? 0);
    })();
    return () => {
      active = false;
    };
  }, [context.artistId, supabase]);

  const url = r?.funnel?.url ?? null;
  const live = r?.funnel?.status === 'active';
  const artistName = profile?.display_name || 'Your artist';

  const kit = useMemo(
    () =>
      url
        ? buildLaunchKit({
            artistName,
            shareUrl: url,
            freeTierName: context.tiers.find((t) => t.price === 0)?.name ?? null,
            paidTierName: r?.primaryTier?.name ?? null,
            paidPriceLabel: r?.primaryTier ? `${money(r.primaryTier.price)}/mo` : null,
            contactCount,
            patreonCount: 0,
          })
        : null,
    [url, artistName, context.tiers, r?.primaryTier, contactCount],
  );

  /** The one canonical signal: the existing fan_invited event with a funnel_* method. */
  const record = useCallback(
    (method: string) => {
      void fetch('/api/funnel/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: 'fan_invited',
          dedupeKey: `${context.artistId}:funnel:${method}`,
          metadata: { method: `funnel_${method}`, funnel: r?.funnel?.publicToken ?? null },
        }),
      }).catch(() => {});
    },
    [context.artistId, r?.funnel?.publicToken],
  );

  const copy = async (text: string, method: string, what = 'Copied.') => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(what, 'success');
    } catch {
      showToast(text, 'info');
    }
    record(method);
  };

  if (!r) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-crwn-gold border-t-transparent rounded-full animate-spin" aria-label="Loading" />
      </div>
    );
  }

  if (!url || !live) {
    return (
      <GuidedShell flow="launch" artistId={context.artistId} returnTo={entry.returnTo} steps={[{ id: 'off' }]} index={0} title="Turn your funnel on first" subtitle="A link that opens nothing is worse than no link." onContinue={() => router.push(`${guidedFlowHref('funnel')}?returnTo=${encodeURIComponent(entry.returnTo)}`)} continueLabel="Turn it on">
        <Why>Once the funnel is live, this screen gives you the link and the copy to put it in the world.</Why>
      </GuidedShell>
    );
  }

  const steps = [
    { id: 'link', group: 'Your link' },
    { id: 'path', group: 'Where first' },
    { id: 'do', group: 'Put it there' },
  ];
  const titles: Record<number, [string, string]> = {
    0: ['Your funnel is ready', 'This link joins a fan free, delivers your gift, and shows your offer.'],
    1: ['Where will you put it first?', 'One place. You can add the others any time.'],
    2: [
      path === 'bio' ? 'Put it in your bio' : path === 'post' ? 'Post it' : path === 'email' ? 'Email the fans you already have' : 'Turn comments into fans',
      path === 'bio' ? 'The one link every profile visitor sees.' : path === 'post' ? 'Copy is written for you. Paste it and add the link.' : path === 'email' ? `${contactCount} contacts are on your list.` : 'Optional. Needs your Instagram or Facebook connected.',
    ],
  };

  return (
    <GuidedShell
      flow="launch"
      artistId={context.artistId}
      returnTo={entry.returnTo}
      steps={steps}
      index={index}
      title={titles[index][0]}
      subtitle={titles[index][1]}
      onBack={index > 0 ? () => setIndex(index - 1) : undefined}
      onContinue={() => {
        if (index < 2) {
          setIndex(index + 1);
          return;
        }
        guidedSetupTelemetry.completed({ flow: 'launch', artistId: context.artistId, step: 3, totalSteps: 3 });
        router.push(entry.returnTo);
      }}
      continueLabel={index === 2 ? 'Done, back to Rise Mode' : 'Continue'}
      continueDisabled={index === 1 && !path}
    >
      {index === 0 && (
        <div className="space-y-3">
          <div className="rounded-xl bg-crwn-elevated p-4">
            <p className="text-xs uppercase tracking-wide text-crwn-text-secondary mb-1">The link</p>
            <p className="text-sm text-crwn-text break-all">{url}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button type="button" onClick={() => copy(url, 'link_copy', 'Link copied.')} className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-full text-sm font-semibold bg-crwn-gold text-crwn-bg press-scale">
              <Copy className="w-4 h-4" /> Copy the link
            </button>
            <button type="button" onClick={() => { void openQrSheet(url, artistName); record('qr'); }} className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-full text-sm font-semibold bg-crwn-elevated text-crwn-text press-scale">
              <QrCode className="w-4 h-4" /> Print a QR code
            </button>
          </div>
          <Why>Every visit, join and sale through this link shows up in Fan Automations. Fans never see a tier id or a token; they see your gift.</Why>
        </div>
      )}

      {index === 1 && (
        <div>
          <OptionSelect
            options={[
              { value: 'bio', label: 'My bio link', hint: 'Instagram, TikTok, wherever fans look you up' },
              { value: 'post', label: 'A post or story', hint: 'Copy is written for you' },
              { value: 'email', label: 'Email the fans I already have', hint: contactCount > 0 ? `${contactCount} on your list` : 'Import contacts first, or skip' },
              { value: 'dm', label: 'Comment-to-DM', hint: 'Optional: connect Instagram or Facebook' },
            ]}
            value={path}
            onChange={(v) => setPath(v as Path)}
            placeholder="Choose one"
          />
          <Why>Pick the place your fans already are. The link is the same everywhere.</Why>
        </div>
      )}

      {index === 2 && path === 'bio' && (
        <div className="space-y-3">
          <ol className="list-decimal list-inside space-y-1.5 text-sm text-crwn-text rounded-xl border border-crwn-elevated p-4">
            <li>Copy the link below.</li>
            <li>Open the app where your fans find you, then Edit profile.</li>
            <li>Paste it as your website or link. Save.</li>
          </ol>
          <button type="button" onClick={() => copy(url, 'bio', 'Link copied. Paste it in your bio.')} className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-full text-sm font-semibold bg-crwn-gold text-crwn-bg press-scale">
            <Copy className="w-4 h-4" /> Copy the link
          </button>
        </div>
      )}

      {index === 2 && path === 'post' && kit && (
        <div className="space-y-3">
          <div className="rounded-xl border border-crwn-elevated p-4">
            <p className="text-xs uppercase tracking-wide text-crwn-text-secondary mb-2">Caption</p>
            <p className="text-sm text-crwn-text whitespace-pre-wrap">{kit.socialCaption}</p>
            <button type="button" onClick={() => copy(kit.socialCaption, 'post', 'Caption copied.')} className="mt-3 text-sm text-crwn-gold press-scale">Copy caption</button>
          </div>
          <div className="rounded-xl border border-crwn-elevated p-4">
            <p className="text-xs uppercase tracking-wide text-crwn-text-secondary mb-2">Story</p>
            <p className="text-sm text-crwn-text whitespace-pre-wrap">{kit.storyCopy}</p>
            <button type="button" onClick={() => copy(kit.storyCopy, 'post', 'Story copy copied.')} className="mt-3 text-sm text-crwn-gold press-scale">Copy story text</button>
          </div>
          <Why>Add the link as the sticker or in the caption. On Instagram, the bio link is what a caption points at.</Why>
        </div>
      )}

      {index === 2 && path === 'email' && (
        <div className="space-y-3">
          <p className="text-sm text-crwn-text">The Launch Kit writes the announcement and a follow-up, addressed to your imported contacts, as drafts you approve before anything sends.</p>
          <button
            type="button"
            onClick={() => {
              record('email');
              router.push(`/studio/fans?view=campaigns&returnTo=${encodeURIComponent(`${guidedFlowHref('launch')}?returnTo=${encodeURIComponent(entry.returnTo)}`)}`);
            }}
            className="w-full py-3 rounded-full text-sm font-semibold bg-crwn-gold text-crwn-bg press-scale"
          >
            Open the Launch Kit
          </button>
          {contactCount === 0 && <Why>No contacts yet. Import the fans scattered across your other platforms first, from Fans in Studio.</Why>}
        </div>
      )}

      {index === 2 && path === 'dm' && (
        <div className="space-y-3">
          <p className="text-sm text-crwn-text">Connect Instagram or Facebook and CRWN answers a fan&apos;s comment with this link in a private reply. Optional: your link works everywhere without it.</p>
          <button
            type="button"
            onClick={() => {
              record('dm');
              router.push(`/studio/automations?returnTo=${encodeURIComponent(entry.returnTo)}`);
            }}
            className="w-full py-3 rounded-full text-sm font-semibold bg-crwn-gold text-crwn-bg press-scale"
          >
            Open Fan Automations
          </button>
        </div>
      )}
    </GuidedShell>
  );
}
