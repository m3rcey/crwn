'use client';

// The ONE Tier Offer Experience renderer.
//
// It consumes a normalized config (src/lib/offerExperience) plus the tier and artist it
// is selling for, and renders the full fan-facing sales experience: hero with promise,
// price and the benefit-based CTA above the fold; optional VSL; ordered benefit previews
// with their REAL/EXAMPLE truth disclosed from data; the inherited-value strip; FAQs; a
// final CTA; and a sticky CTA while the fan scrolls. GB Platinum, GB Gold and every
// future artist render through this same component: nothing in this file knows any
// artist's name, and the sales philosophy it encodes is universal — do not tell fans
// what they get, show them what it feels like to have it.
//
// WHAT THIS COMPONENT MUST NEVER DO. It holds no checkout logic, no Stripe call, no
// entitlement check and no protected media: the purchase action arrives as `actionSlot`
// (the funnel's existing canonical CTA + sign-in-code cluster, one instance), previews
// render only bounded text and public artwork the normalizer already screened, and every
// EXAMPLE preview is disclosed because the truth state is a required field, not a label
// someone remembered to add.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, Lock, Mic, Play, Sparkles, Upload } from 'lucide-react';
import type { OfferPreview, TierOfferExperience as OfferConfig } from '@/lib/offerExperience/types';

export interface OfferTier {
  id: string;
  name: string;
  priceCents: number;
}

interface Props {
  artist: { name: string; avatarUrl: string | null };
  tier: OfferTier;
  config: OfferConfig;
  /** The funnel's existing purchase cluster (benefit CTA button + sign-in code box).
   *  Rendered ONCE, in the hero; the sticky and final CTAs scroll the fan back to it so
   *  checkout and auth state stay in exactly one place. */
  actionSlot: React.ReactNode;
  /** The decline path, e.g. "Not right now" into the downsell, or "Stay Bronze". */
  onDecline?: () => void;
  declineLabel?: string;
  /** Fired once when the fan presses play on the VSL. Analytics only. */
  onVslStart?: () => void;
  /** The sticky/final CTA label defaults to config.cta. */
  price: (cents: number) => string;
  /** The fan looking at the offer, when known: their first name and the supporter number they
   *  would get. The demonstrated comment thread's "You" row then shows THEIR name and THEIR pill
   *  ("Platinum #4"), exactly as /api/recognition would print it beside their comments. */
  viewer?: { name?: string | null; supporterNumber?: number | null };
}

/** The one truth chip. Rendered from data, never from a developer remembering. The words
 *  are the founder's (2026-09-28): "What it looks like" says the card illustrates the benefit
 *  in plain language a fan reads, where "Example experience" read as internal jargon. It is
 *  still the disclosure: it prints on every truth: 'example' preview and nowhere else. */
function ExampleChip() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-crwn-elevated text-crwn-text-secondary">
      <Sparkles className="w-3 h-3" /> What it looks like
    </span>
  );
}

function PreviewShell({ p, children }: { p: OfferPreview; children?: React.ReactNode }) {
  return (
    <section aria-label={p.title} className="neu-raised rounded-2xl p-5 bg-crwn-card text-center">
      {p.truth === 'example' && <div className="mb-2"><ExampleChip /></div>}
      <h3 className="text-base font-bold text-crwn-text">{p.title}</h3>
      {p.description && <p className="text-sm text-crwn-text-secondary mt-1.5">{p.description}</p>}
      {children}
    </section>
  );
}

/** EXAMPLE interactions are demonstrations of what members do, but the TAP is real: it
 *  jumps the fan to the purchase cluster, because reaching for the thing is the buying
 *  signal and dead air on that tap reads as broken. The assistive name says exactly
 *  that, so a screen reader is never told this submits anything. */
function DemoButton({ label, onTry }: { label: string; onTry?: () => void }) {
  return (
    <button
      type="button"
      onClick={onTry}
      aria-label={`${label}: a preview of what members do. Takes you to joining.`}
      className="inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-semibold bg-crwn-gold/25 text-crwn-gold press-scale"
    >
      {label}
    </button>
  );
}

function PreviewBody({ p, onTry, viewer }: { p: OfferPreview; onTry?: () => void; viewer?: Props['viewer'] }) {
  switch (p.kind) {
    case 'decision':
      return (
        <div className="mt-3 space-y-2">
          {(p.options || []).map((o, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl bg-crwn-elevated px-4 py-3 text-left">
              <span aria-hidden className="w-8 h-8 rounded-full bg-crwn-card flex items-center justify-center">
                <Play className="w-3.5 h-3.5 text-crwn-gold" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-crwn-text truncate">{o.label}</p>
                {o.sublabel && <p className="text-xs text-crwn-text-secondary truncate">{o.sublabel}</p>}
              </div>
            </div>
          ))}
          <div className="pt-1 text-center"><DemoButton label={p.actionLabel || 'Vote'} onTry={onTry} /></div>
        </div>
      );
    case 'submission':
      return (
        <div className="mt-3 rounded-xl bg-crwn-elevated p-4 space-y-2.5 text-left">
          {(p.fields || []).map((f, i) => (
            <div key={i}>
              <p className="text-[11px] uppercase tracking-wide text-crwn-text-secondary mb-1">{f.label}</p>
              <div className="rounded-lg bg-crwn-card px-3 py-2.5 text-sm text-crwn-text-secondary/60 flex items-center gap-2">
                {i === 0 ? <Upload className="w-3.5 h-3.5 shrink-0" /> : <Mic className="w-3.5 h-3.5 shrink-0" />}
                <span className="truncate">{f.placeholder || ''}</span>
              </div>
            </div>
          ))}
          <div className="pt-1 text-center"><DemoButton label={p.actionLabel || 'Submit for consideration'} onTry={onTry} /></div>
        </div>
      );
    case 'collection':
      return (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {(p.items || []).map((it, i) => (
            <div key={i} className="rounded-xl bg-crwn-elevated p-3 text-left">
              {it.artUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.artUrl} alt={`${it.title} artwork`} loading="lazy" className="w-full aspect-square object-cover rounded-lg mb-2" />
              ) : (
                <div aria-hidden className="w-full aspect-square rounded-lg bg-crwn-card mb-2 flex items-center justify-center">
                  {it.locked ? <Lock className="w-5 h-5 text-crwn-gold/60" /> : <Play className="w-5 h-5 text-crwn-gold/60" />}
                </div>
              )}
              <p className="text-xs font-medium text-crwn-text truncate">{it.title}</p>
              {it.subtitle && <p className="text-[11px] text-crwn-text-secondary truncate">{it.subtitle}</p>}
            </div>
          ))}
        </div>
      );
    case 'timeline':
      return (
        <ol className="mt-3 flex flex-wrap items-center justify-center gap-y-2">
          {(p.steps || []).map((s, i, arr) => (
            <li key={i} className="flex items-center">
              <span className={`text-xs px-3 py-1.5 rounded-full ${s.participates ? 'bg-crwn-gold text-crwn-bg font-semibold' : 'bg-crwn-elevated text-crwn-text-secondary'}`}>
                {s.label}
              </span>
              {i < arr.length - 1 && <span aria-hidden className="mx-1.5 text-crwn-text-secondary/50">→</span>}
            </li>
          ))}
        </ol>
      );
    case 'window':
      return (
        <div className="mt-3 rounded-xl bg-crwn-elevated px-4 py-3 flex items-center justify-center gap-3">
          <p className="text-sm text-crwn-text">{p.actionLabel || 'Submission window'}</p>
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
            p.windowState === 'open' ? 'bg-crwn-gold text-crwn-bg'
            : p.windowState === 'upcoming' ? 'bg-crwn-gold/20 text-crwn-gold'
            : 'bg-crwn-card text-crwn-text-secondary'
          }`}>
            {p.windowState === 'open' ? 'Open' : p.windowState === 'upcoming' ? 'Upcoming' : 'Closed'}
          </span>
        </div>
      );
    case 'status':
      if (p.thread && p.thread.length) {
        // Drawn like CommentItem: avatar initial, name, the gold rung pill, the comment. The
        // fan's own row is outlined so they can see where they would sit among the others.
        return (
          <div className="mt-3 space-y-2 text-left">
            {p.thread.map((raw, i) => {
              const c = raw.you
                ? {
                    ...raw,
                    name: viewer?.name?.trim() || raw.name,
                    badge: raw.badge && viewer?.supporterNumber ? `${raw.badge} #${viewer.supporterNumber}` : raw.badge,
                  }
                : raw;
              return (
              <div
                key={i}
                className={`flex gap-3 rounded-xl px-3 py-3 ${c.you ? 'bg-crwn-gold/10 ring-1 ring-crwn-gold/60' : 'bg-crwn-elevated'}`}
              >
                <span className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold ${c.you ? 'bg-crwn-gold text-crwn-bg' : 'bg-crwn-card text-crwn-text-secondary'}`}>
                  {c.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-crwn-text text-sm">{c.name}</span>
                    {c.badge ? (
                      <span className="px-2 py-0.5 text-xs font-medium bg-crwn-gold/20 text-crwn-gold rounded-full">{c.badge}</span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-sm text-crwn-text-secondary">{c.text}</p>
                </div>
              </div>
              );
            })}
          </div>
        );
      }
      return (
        <div className="mt-3 flex items-center justify-center gap-3 rounded-xl bg-crwn-elevated px-4 py-3">
          <span className="text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-crwn-gold text-crwn-bg">{p.badge || 'Member'}</span>
          <p className="text-sm text-crwn-text-secondary">shows beside your name across the artist&apos;s world</p>
        </div>
      );
    case 'audio':
      return (
        <div className="mt-3 space-y-2 text-left">
          {(p.items && p.items.length ? p.items : [{ title: p.title }]).map((it, i) => (
            <div key={i} className="rounded-xl bg-crwn-elevated px-4 py-3 flex items-center gap-3">
              {it.artUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.artUrl} alt="" loading="lazy" className="w-11 h-11 rounded-lg object-cover shrink-0" />
              ) : (
                <span aria-hidden className="w-11 h-11 rounded-full bg-crwn-gold text-crwn-bg flex items-center justify-center shrink-0">
                  <Play className="w-5 h-5 ml-0.5" />
                </span>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-crwn-text truncate">{it.title}</p>
                {/* A still progress bar: the shape of the player members get, not a
                    control pretending to be one. */}
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-crwn-card overflow-hidden">
                  <div className="h-full w-1/3 bg-crwn-gold/60 rounded-full" />
                </div>
              </div>
              <Lock className="w-4 h-4 text-crwn-gold/60 shrink-0" aria-label="Members only" />
            </div>
          ))}
          <div className="pt-1 text-center">
            <DemoButton label={p.actionLabel || 'Unlock the music'} onTry={onTry} />
          </div>
        </div>
      );
    case 'session':
    case 'video':
    case 'image':
      return (
        <div className="mt-3 rounded-xl overflow-hidden bg-crwn-elevated">
          {p.posterUrl ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.posterUrl} alt={p.title} loading="lazy" className="w-full aspect-video object-cover" />
              {p.kind !== 'image' ? (
                // A session or video preview reads as a video: a drawn play mark, never a
                // control. There is no video behind it, so nothing is clickable.
                <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="w-14 h-14 rounded-full bg-crwn-bg/70 ring-2 ring-crwn-gold flex items-center justify-center">
                    <Play className="w-6 h-6 text-crwn-gold ml-0.5" fill="currentColor" />
                  </span>
                </span>
              ) : null}
            </div>
          ) : (
            <div aria-hidden className="w-full aspect-video flex items-center justify-center">
              <Play className="w-8 h-8 text-crwn-gold/50" />
            </div>
          )}
        </div>
      );
    default:
      return null;
  }
}

export function TierOfferExperience({ artist, tier, config, actionSlot, onDecline, declineLabel, onVslStart, price, viewer }: Props) {
  const actionRef = useRef<HTMLDivElement>(null);
  const [heroVisible, setHeroVisible] = useState(true);
  const [vslStarted, setVslStarted] = useState(false);

  // The sticky bar appears only once the hero's action has scrolled away, so the page
  // never shows two identical CTAs at once.
  useEffect(() => {
    const el = actionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(([e]) => setHeroVisible(e.isIntersecting), { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const scrollToAction = useCallback(() => {
    actionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const vsl = config.vsl && config.vsl.url ? config.vsl : null;
  // No video yet, but a cover for it (founder decision 2026-09-28, an exception to "null url
  // renders nothing"): the slot shows the cover of the video the artist is about to shoot, as
  // a still with a drawn play mark and a plain "coming soon" line. Nothing is clickable.
  const vslCover = !vsl && config.vsl?.posterUrl ? config.vsl.posterUrl : null;

  return (
    <div className="space-y-6 pb-24">
      {/* ── HERO: promise, price and the benefit CTA, above the fold. ── */}
      <div className="neu-raised rounded-2xl p-6 bg-crwn-card text-center">
        <p className="text-xs uppercase tracking-wide text-crwn-gold mb-2">
          {tier.name} · {price(tier.priceCents)}
        </p>
        <h1 className="text-2xl font-bold text-crwn-text leading-tight">{config.promise}</h1>
        <p className="text-sm text-crwn-text-secondary mt-2">{config.description}</p>
        <div ref={actionRef} className="mt-5">
          {actionSlot}
        </div>
        {config.secondaryCue && (
          <button
            onClick={() => document.getElementById(`offer-previews-${tier.id}`)?.scrollIntoView({ behavior: 'smooth' })}
            className="mt-3 w-full text-sm text-crwn-text-secondary flex items-center justify-center gap-1 press-scale"
          >
            {config.secondaryCue} <ChevronDown className="w-4 h-4" />
          </button>
        )}
        {/* The photo sits UNDER the action, not above the promise. Above it, a 16:9 image pushed
            the buy button below the fold on a laptop, and on the drop page (where the unlocked
            song sits above this card) below the fold on every phone. Measured 2026-09-30. */}
        {config.heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={config.heroImageUrl} alt="" className="w-full aspect-video object-cover rounded-xl mt-5" />
        ) : null}
      </div>

      {/* ── VSL. Null url renders NOTHING (the ratified catalog rule); a placeholder
             video is disclosed as an example, never implied to be the artist's. ── */}
      {vsl && (
        <div className="neu-raised rounded-2xl overflow-hidden bg-crwn-card">
          {vsl.isPlaceholder && (
            <div className="px-4 pt-3 text-center"><ExampleChip /></div>
          )}
          <div className="p-4">
            {/* Lazy: metadata only, never autoplay, sound stays off until the fan acts. */}
            <video
              controls
              preload="metadata"
              playsInline
              poster={vsl.posterUrl}
              onPlay={() => {
                if (!vslStarted) { setVslStarted(true); onVslStart?.(); }
              }}
              className="w-full rounded-xl bg-black aspect-video"
              aria-label={vsl.isPlaceholder ? 'Example video' : `${artist.name} video`}
            >
              <source src={vsl.url ?? undefined} type="video/mp4" />
            </video>
          </div>
        </div>
      )}

      {vslCover && (
        <div className="neu-raised rounded-2xl overflow-hidden bg-crwn-card p-4">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={vslCover} alt={`${artist.name}`} className="w-full rounded-xl aspect-video object-cover" />
            <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="w-16 h-16 rounded-full bg-crwn-bg/70 ring-2 ring-crwn-gold flex items-center justify-center">
                <Play className="w-7 h-7 text-crwn-gold ml-0.5" fill="currentColor" />
              </span>
            </span>
          </div>
          <p className="mt-2 text-xs text-center text-crwn-text-secondary">{`Video from ${artist.name} coming soon`}</p>
        </div>
      )}

      {/* ── Benefit previews, in merchandised order. ── */}
      <div id={`offer-previews-${tier.id}`} className="space-y-4">
        {config.previews.map((p, i) => (
          <PreviewShell key={i} p={p}>
            <PreviewBody p={p} onTry={scrollToAction} viewer={viewer} />
          </PreviewShell>
        ))}
      </div>

      {/* ── Inherited value: presentation of canonical cumulative entitlements. ── */}
      {config.inherited && (
        <div className="neu-raised rounded-2xl p-5 bg-crwn-card">
          <h3 className="text-base font-bold text-crwn-text text-center">{config.inherited.heading}</h3>
          <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {config.inherited.items.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-crwn-text">
                <Check className="w-4 h-4 text-crwn-gold mt-0.5 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── FAQ ── */}
      {config.faqs && config.faqs.length > 0 && (
        <div className="neu-raised rounded-2xl p-5 bg-crwn-card">
          <h3 className="text-base font-bold text-crwn-text mb-2 text-center">Questions</h3>
          {config.faqs.map((f, i) => (
            <details key={i} className="group border-t border-white/5 py-3">
              <summary className="text-sm font-medium text-crwn-text cursor-pointer list-none flex items-center justify-between gap-2">
                {f.q}
                <ChevronDown className="w-4 h-4 text-crwn-text-secondary group-open:rotate-180 transition-transform shrink-0" />
              </summary>
              <p className="text-sm text-crwn-text-secondary mt-2">{f.a}</p>
            </details>
          ))}
        </div>
      )}

      {/* ── Final CTA: same outcome, back to the ONE action cluster. ── */}
      <div className="neu-raised rounded-2xl p-6 bg-crwn-card text-center">
        <p className="text-xs uppercase tracking-wide text-crwn-gold mb-1">{tier.name} · {price(tier.priceCents)}</p>
        <p className="text-lg font-bold text-crwn-text mb-4">{config.promise}</p>
        <button
          onClick={scrollToAction}
          className="w-full py-3 rounded-full font-semibold bg-crwn-gold text-crwn-bg press-scale"
        >
          {config.cta}
        </button>
        {config.reassurance && (
          <p className="mt-2 text-xs text-center text-crwn-text-secondary">{config.reassurance}</p>
        )}
        {onDecline && (
          <button onClick={onDecline} className="mt-3 w-full text-sm text-crwn-text-secondary press-scale">
            {declineLabel || 'Not right now'}
          </button>
        )}
      </div>

      {/* ── Sticky CTA: appears once the hero action scrolls away; safe-area aware. ── */}
      {!heroVisible && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 px-4 pt-2 bg-crwn-bg/95 backdrop-blur border-t border-white/10"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          <div className="max-w-lg mx-auto flex items-center gap-3 py-1.5">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-crwn-gold whitespace-nowrap">
                {tier.name} · {price(tier.priceCents)}
              </p>
            </div>
            <button
              onClick={scrollToAction}
              className="flex-1 py-2.5 rounded-full font-semibold text-sm bg-crwn-gold text-crwn-bg press-scale truncate"
            >
              {config.cta}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
