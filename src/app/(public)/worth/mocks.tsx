'use client';

// Animated phone-frame mockups of the real CRWN app, modeled on actual screens
// (tiers, earnings, leaderboard, AI actions, community, shop, sync). Used on /worth
// to show the product instead of describing it. Animations trigger on scroll via
// useInView + the fadeInUp/slideIn keyframes already in globals.css.

import { useEffect, useState, type ReactNode } from 'react';
import { useInView } from '@/hooks/useInView';
import {
  Home, Compass, MessageCircle, Library, User, Signal, BatteryFull,
  Check, X, Users, Trophy, Zap, Bot, Crown, Lock, Heart, Share2,
  ShoppingBag, Disc3, Globe, Power, Plus, Scissors, Play, Download,
} from 'lucide-react';

// Count-up number that animates once its mock scrolls into view.
function AnimatedNumber({
  end, active, prefix = '', suffix = '', duration = 1400,
}: { end: number; active: boolean; prefix?: string; suffix?: string; duration?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    let start: number | undefined;
    let raf = 0;
    const step = (ts: number) => {
      if (start === undefined) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setN(Math.floor(p * end));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, end, duration]);
  return <span>{prefix}{n.toLocaleString('en-US')}{suffix}</span>;
}

const NAV = [
  { icon: Home, label: 'Home' },
  { icon: Compass, label: 'Explore' },
  { icon: MessageCircle, label: 'Messages' },
  { icon: Library, label: 'Library' },
  { icon: User, label: 'Profile' },
];

function StatusBar() {
  return (
    <div className="relative flex items-center justify-between px-4 pt-2.5 pb-1 text-[11px] text-crwn-text">
      <span className="font-semibold tabular-nums">7:58</span>
      <div className="absolute left-1/2 -translate-x-1/2 top-2 w-16 h-4 rounded-full bg-black" />
      <div className="flex items-center gap-1">
        <Signal className="w-3.5 h-3.5" />
        <span className="font-medium text-[10px]">LTE</span>
        <BatteryFull className="w-5 h-5" />
      </div>
    </div>
  );
}

function BottomNav() {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-t border-crwn-elevated bg-crwn-bg">
      <span className="text-crwn-gold font-extrabold text-xs mr-1">CRWN</span>
      {NAV.map((n) => (
        <div key={n.label} className="flex flex-col items-center gap-0.5">
          <n.icon className="w-3.5 h-3.5 text-crwn-text-secondary" />
          <span className="text-[7px] text-crwn-text-secondary">{n.label}</span>
        </div>
      ))}
    </div>
  );
}

function TabRow({ active }: { active: string }) {
  const tabs = ['Music', 'Live', 'Tiers', 'Shop', 'Community', 'Leaderboard'];
  return (
    <div className="flex gap-3 text-[12px] border-b border-crwn-elevated pb-2 mb-3 overflow-hidden">
      {tabs.map((t) => (
        <span
          key={t}
          className={`whitespace-nowrap ${t === active ? 'text-crwn-gold font-semibold' : 'text-crwn-text-secondary'}`}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[320px] rounded-[2rem] border border-crwn-elevated bg-crwn-bg overflow-hidden shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)]">
      <StatusBar />
      <div className="px-3.5 pb-4 pt-1 min-h-[300px]">{children}</div>
      <BottomNav />
    </div>
  );
}

// --- Screens ---

export function TiersMock({ subs }: { subs?: { t1: number; t2: number; t3: number } }) {
  const { ref, isInView } = useInView();
  const tiers = [
    { name: 'The Wave', price: '$0', members: null as number | null, perks: ['🎵 Exclusive tracks', '💬 Community posts'], subscribed: false, accent: false },
    { name: 'The Inner Circle', price: '$10', members: subs ? Math.floor(subs.t1) : null, perks: ['🎵 Exclusive tracks', '⏰ 7-day early access', '🏷️ 10% shop discount'], subscribed: true, accent: true },
    { name: 'The Vault', price: '$25', members: subs ? Math.floor(subs.t2) : null, perks: ['🎚️ Stems & multitracks', '🎤 Monthly live Q&A'], subscribed: false, accent: false },
    { name: 'The Throne', price: '$100', members: subs ? Math.floor(subs.t3) : null, perks: ['📞 Monthly 1-on-1', '🎶 Custom song / qtr'], subscribed: false, accent: false },
  ];
  return (
    <PhoneFrame>
      <TabRow active="Tiers" />
      <div ref={ref} className="space-y-2.5">
        {tiers.map((t, i) => (
          <div
            key={t.name}
            style={{ animationDelay: `${i * 110}ms` }}
            className={`${isInView ? 'animate-[fadeInUp_0.5s_ease-out_both]' : 'opacity-0'} rounded-xl p-3 border ${t.accent ? 'border-crwn-gold bg-crwn-gold/5' : 'border-crwn-elevated bg-crwn-surface'}`}
          >
            {t.subscribed && (
              <div className="text-[10px] text-crwn-gold font-semibold mb-1 flex items-center gap-1">
                <Check className="w-3 h-3" /> Subscribed
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-crwn-gold font-semibold text-sm">{t.name}</span>
              {t.members != null && (
                <span className="flex items-center gap-1 text-[10px] text-crwn-text-secondary">
                  <Users className="w-3 h-3" /> {t.members.toLocaleString('en-US')}
                </span>
              )}
            </div>
            <div className="text-lg font-bold">
              {t.price}<span className="text-xs text-crwn-text-secondary font-normal">/mo</span>
            </div>
            <ul className="mt-2 space-y-1">
              {t.perks.map((p) => (
                <li key={p} className="flex items-center gap-1.5 text-[11px] text-crwn-text-secondary">
                  <Check className="w-3 h-3 text-crwn-gold shrink-0" /> {p}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </PhoneFrame>
  );
}

export function EarningsMock({ balanceCents }: { balanceCents?: number }) {
  const { ref, isInView } = useInView();
  const balance = balanceCents && balanceCents > 0 ? Math.round(balanceCents / 100) : 2418;
  const rows = [
    { t: 'Throne · Monthly', d: 'Today', a: '+$100.00' },
    { t: 'The Vault · Monthly', d: 'Today', a: '+$25.00' },
    { t: 'Stem pack sale', d: 'Yesterday', a: '+$25.00' },
    { t: 'Inner Circle · Monthly', d: '2 days ago', a: '+$10.00' },
  ];
  return (
    <PhoneFrame>
      <div className="text-sm font-bold mb-3">Earnings</div>
      <div ref={ref} className="space-y-2">
        {rows.map((r, i) => (
          <div
            key={r.t}
            style={{ animationDelay: `${i * 110}ms` }}
            className={`${isInView ? 'animate-[slideIn_0.45s_ease-out_both]' : 'opacity-0'} flex items-center gap-2 rounded-xl bg-crwn-surface border border-crwn-elevated p-2.5`}
          >
            <div className="w-7 h-7 rounded-full bg-green-500/15 flex items-center justify-center shrink-0">
              <Users className="w-3.5 h-3.5 text-green-400" />
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-medium truncate">{r.t}</div>
              <div className="text-[10px] text-crwn-text-secondary">{r.d}</div>
            </div>
            <div className="ml-auto text-crwn-gold font-bold text-sm">{r.a}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-xl bg-crwn-surface border border-crwn-elevated p-3 flex items-center justify-between">
        <div>
          <div className="text-[11px] text-crwn-text-secondary">Available balance</div>
          <div className="text-xl font-bold text-crwn-gold"><AnimatedNumber end={balance} active={isInView} prefix="$" /></div>
        </div>
        <div className="bg-crwn-gold text-crwn-bg text-xs font-semibold rounded-full px-3 py-2">Cash Out</div>
      </div>
    </PhoneFrame>
  );
}

export function LeaderboardMock({ payers }: { payers?: number }) {
  const { ref, isInView } = useInView();
  // Top-fan points scale with the size of the paying fanbase; spend is per-person (tier-based).
  const base = payers && payers > 0 ? Math.max(70, Math.round(payers * 1.8)) : 161;
  const fracs = [1, 0.68, 0.46, 0.43, 0.34, 0.32];
  const rows = [
    { name: 'Aaliyah James', badge: '🥇', spent: '$175' },
    { name: 'Jordan Rivers', badge: '⭐', spent: '$120' },
    { name: 'Maya Chen', badge: '🔥', spent: '$80' },
    { name: 'Tyler Brooks', rank: 4, spent: '$75' },
    { name: 'Marcus Lee', rank: 5, spent: '$60' },
    { name: 'Dex Thompson', rank: 6, spent: '$55' },
  ].map((r, i) => ({ ...r, pts: Math.round(base * fracs[i]) }));
  return (
    <PhoneFrame>
      <TabRow active="Leaderboard" />
      <div className="flex items-center gap-1.5 text-sm font-bold">
        <Trophy className="w-4 h-4 text-crwn-gold" /> Top Supporters
      </div>
      <div className="text-[10px] text-crwn-text-secondary mb-2 ml-6">
        {payers && payers > 0 ? `of ${Math.floor(payers).toLocaleString('en-US')} paying fans` : 'your biggest fans'}
      </div>
      <div ref={ref} className="divide-y divide-crwn-elevated">
        {rows.map((r, i) => (
          <div
            key={r.name}
            style={{ animationDelay: `${i * 80}ms` }}
            className={`${isInView ? 'animate-[slideIn_0.4s_ease-out_both]' : 'opacity-0'} flex items-center gap-2 py-2`}
          >
            <div className="w-5 text-center text-xs text-crwn-text-secondary">{r.badge ?? r.rank}</div>
            <div className="w-6 h-6 rounded-full bg-crwn-elevated text-[10px] flex items-center justify-center text-crwn-text-secondary shrink-0">{r.name[0]}</div>
            <div className="min-w-0">
              <div className="text-[12px] font-medium truncate">{r.name}</div>
              <div className="text-[10px] text-crwn-text-secondary">{r.spent} spent</div>
            </div>
            <div className="ml-auto text-crwn-gold font-semibold text-[12px]">
              <AnimatedNumber end={r.pts} active={isInView} suffix=" pts" />
            </div>
          </div>
        ))}
      </div>
    </PhoneFrame>
  );
}

export function AiActionsMock() {
  const { ref, isInView } = useInView();
  const cards = [
    { cat: 'TIER PRICING', status: 'Caution', statusColor: 'text-red-400 bg-red-500/10', title: 'Raise Wave tier to $15/mo — RPV up 62%', desc: 'Audience converting better and can bear a higher price. Adds ~$40/mo to MRR.' },
    { cat: 'EMAIL CAMPAIGN', status: 'Review', statusColor: 'text-crwn-gold bg-crwn-gold/10', title: 'Email fans: 1-on-1 sessions to $100', desc: 'Selling out at $75 with 6 slots left. Draft ready.' },
    { cat: 'DISCOUNT CODE', status: 'Review', statusColor: 'text-crwn-gold bg-crwn-gold/10', title: '20% off code for churned fans', desc: 'Win-back sequence active. Targets 3 fans who canceled on price.' },
  ];
  return (
    <PhoneFrame>
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-4 h-4 text-crwn-gold" />
        <span className="text-sm font-bold">Pending Actions</span>
        <span className="text-[10px] text-crwn-gold bg-crwn-gold/10 rounded-full px-2 py-0.5 animate-pulse">3 awaiting</span>
      </div>
      <div ref={ref} className="space-y-2.5">
        {cards.map((c, i) => (
          <div
            key={c.cat}
            style={{ animationDelay: `${i * 130}ms` }}
            className={`${isInView ? 'animate-[fadeInUp_0.5s_ease-out_both]' : 'opacity-0'} rounded-xl bg-crwn-surface border border-crwn-elevated p-3`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-6 h-6 rounded-md bg-crwn-gold/10 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-crwn-gold" />
              </div>
              <span className="text-[9px] uppercase tracking-wide text-crwn-text-secondary">{c.cat}</span>
              <span className={`text-[9px] rounded px-1.5 py-0.5 ${c.statusColor}`}>{c.status}</span>
            </div>
            <div className="text-[12px] font-semibold leading-snug mb-1">{c.title}</div>
            <div className="text-[10px] text-crwn-text-secondary leading-snug mb-2">{c.desc}</div>
            <div className="flex gap-2">
              <div className="flex-1 bg-crwn-gold text-crwn-bg text-[11px] font-semibold rounded-full py-1.5 flex items-center justify-center gap-1">
                <Check className="w-3 h-3" /> Approve
              </div>
              <div className="px-3 border border-crwn-elevated text-crwn-text-secondary text-[11px] rounded-full py-1.5 flex items-center gap-1">
                <X className="w-3 h-3" /> Reject
              </div>
            </div>
          </div>
        ))}
      </div>
    </PhoneFrame>
  );
}

export function CommunityMock({ fans }: { fans?: number }) {
  const { ref, isInView } = useInView();
  const base = fans && fans > 0 ? Math.floor(fans) : 90;
  const posts = [
    { text: "What do y'all want to see more of… BTS content or me making the song in real time? Lmk", exclusive: false, likes: Math.max(6, Math.round(base * 0.42)), comments: Math.max(2, Math.round(base * 0.11)) },
    { text: 'Droppin an unreleased track in here this Friday for yall only', exclusive: true, likes: Math.max(4, Math.round(base * 0.55)), comments: Math.max(1, Math.round(base * 0.14)) },
  ];
  return (
    <PhoneFrame>
      <TabRow active="Community" />
      <div ref={ref} className="space-y-2.5">
        {posts.map((p, i) => (
          <div
            key={i}
            style={{ animationDelay: `${i * 140}ms` }}
            className={`${isInView ? 'animate-[fadeInUp_0.5s_ease-out_both]' : 'opacity-0'} rounded-xl bg-crwn-surface border border-crwn-elevated p-3`}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 shrink-0" />
              <span className="text-[12px] font-semibold">Mercey</span>
              <Crown className="w-3 h-3 text-crwn-gold" />
              <span className="text-[10px] text-crwn-text-secondary">· 3/9/2026</span>
            </div>
            {p.exclusive && (
              <div className="flex items-center gap-1 text-[10px] text-crwn-gold mb-1">
                <Lock className="w-3 h-3" /> Exclusive
              </div>
            )}
            <div className="text-[12px] text-crwn-text mb-2 leading-snug">{p.text}</div>
            <div className="flex items-center gap-4 text-[11px] text-crwn-text-secondary">
              <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5" /> {p.likes}</span>
              <span className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> {p.comments}</span>
              <Share2 className="w-3.5 h-3.5" />
            </div>
          </div>
        ))}
      </div>
    </PhoneFrame>
  );
}

export function ShopMock() {
  const { ref, isInView } = useInView();
  const items = [
    { name: 'Early Access Pass', price: '$10', desc: 'Every release, 7 days early.', Icon: ShoppingBag },
    { name: 'Producer Pack Vol. 1', price: '$25', desc: '5 beats, stems included.', Icon: Disc3 },
  ];
  return (
    <PhoneFrame>
      <TabRow active="Shop" />
      <div ref={ref} className="grid grid-cols-2 gap-2">
        {items.map((it, i) => (
          <div
            key={it.name}
            style={{ animationDelay: `${i * 120}ms` }}
            className={`${isInView ? 'animate-[fadeInUp_0.5s_ease-out_both]' : 'opacity-0'} rounded-xl bg-crwn-surface border border-crwn-elevated overflow-hidden`}
          >
            <div className="h-20 bg-gradient-to-br from-crwn-gold/25 to-crwn-bg flex items-center justify-center">
              <it.Icon className="w-7 h-7 text-crwn-gold/80" />
            </div>
            <div className="p-2.5">
              <span className="text-[8px] text-blue-300 bg-blue-500/15 rounded px-1.5 py-0.5">Digital</span>
              <div className="text-[12px] font-semibold mt-1 leading-tight">{it.name}</div>
              <div className="text-[10px] text-crwn-text-secondary mt-0.5 mb-2 leading-tight">{it.desc}</div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">{it.price}</span>
                <span className="bg-crwn-gold text-crwn-bg text-[11px] font-semibold rounded-md px-3 py-1">Buy</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </PhoneFrame>
  );
}

export function SequencesMock() {
  const { ref, isInView } = useInView();
  const rows = [
    { name: 'Welcome Series', trigger: 'New subscription', steps: '2 steps' },
    { name: 'Win-Back Campaign', trigger: 'Win-back', steps: '3 steps' },
    { name: 'Abandoned Cart Recovery', trigger: 'Abandoned cart', steps: '3 steps' },
    { name: 'Post-Purchase Upsell', trigger: 'Post-purchase', steps: '2 steps' },
    { name: 'Tier Upgrade Nudge', trigger: 'Tier upgrade', steps: '1 step' },
  ];
  return (
    <PhoneFrame>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-bold">Sequences</div>
          <div className="text-[10px] text-crwn-text-secondary">Automated email drips on autopilot</div>
        </div>
        <div className="flex items-center gap-1 bg-crwn-gold text-crwn-bg text-[11px] font-semibold rounded-full px-3 py-1.5">
          <Plus className="w-3 h-3" /> New
        </div>
      </div>
      <div ref={ref} className="space-y-2">
        {rows.map((r, i) => (
          <div
            key={r.name}
            style={{ animationDelay: `${i * 90}ms` }}
            className={`${isInView ? 'animate-[slideIn_0.4s_ease-out_both]' : 'opacity-0'} flex items-center gap-2 rounded-xl bg-crwn-surface border border-crwn-elevated p-2.5`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-semibold truncate">{r.name}</span>
                <span className="text-[8px] text-green-400 bg-green-500/10 rounded px-1.5 py-0.5 shrink-0">Active</span>
              </div>
              <div className="text-[10px] text-crwn-text-secondary">{r.trigger} · {r.steps}</div>
            </div>
            <div className="w-7 h-7 rounded-lg border border-green-500/40 flex items-center justify-center shrink-0">
              <Power className="w-3.5 h-3.5 text-green-400" />
            </div>
          </div>
        ))}
      </div>
    </PhoneFrame>
  );
}

export function LiveMock() {
  const { ref, isInView } = useInView();
  return (
    <PhoneFrame>
      <TabRow active="Live" />
      <div ref={ref} className={isInView ? 'animate-[fadeInUp_0.5s_ease-out_both]' : 'opacity-0'}>
        <div className="text-sm font-bold mb-2">Recordings</div>
        <div className="rounded-xl bg-crwn-surface border border-crwn-elevated overflow-hidden">
          <div className="relative h-36 bg-gradient-to-br from-crwn-gold/25 to-crwn-bg flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-crwn-gold flex items-center justify-center">
              <Play className="w-5 h-5 text-crwn-bg ml-0.5" />
            </div>
            <span className="absolute top-2 left-2 text-[10px] font-semibold bg-red-500 text-white rounded px-1.5 py-0.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
            </span>
            <span className="absolute bottom-2 right-2 text-[10px] bg-black/70 text-white rounded px-1.5 py-0.5">1:10:24</span>
          </div>
          <div className="p-3">
            <div className="text-[13px] font-semibold">Friday listening party</div>
            <div className="text-[10px] text-crwn-text-secondary mb-2">Ticketed · 84 watching</div>
            <span className="inline-flex items-center gap-1 text-[11px] border border-crwn-elevated rounded-full px-3 py-1">
              <Download className="w-3 h-3" /> Download full stream
            </span>
          </div>
        </div>
        <p className="text-[10px] text-crwn-text-secondary mt-2">Every stream auto-saves. Sell the replay, gate it, or hand it to your clippers.</p>
      </div>
    </PhoneFrame>
  );
}

export function ClipperMock() {
  const { ref, isInView } = useInView();
  const rows = [
    { name: '@dreadvisuals', views: '48K views', earned: '+$60' },
    { name: '@thehiphopplug', views: '22K views', earned: '+$30' },
    { name: '@clipgod', views: '15K views', earned: '+$20' },
    { name: '@fancentral', views: '9K views', earned: '+$10' },
  ];
  return (
    <PhoneFrame>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-sm font-bold">
          <Scissors className="w-4 h-4 text-crwn-gold" /> Clip & Earn
        </div>
        <span className="text-[10px] text-crwn-gold bg-crwn-gold/10 rounded-full px-2 py-0.5">10% per signup</span>
      </div>
      <div ref={ref} className="space-y-2">
        {rows.map((r, i) => (
          <div
            key={r.name}
            style={{ animationDelay: `${i * 90}ms` }}
            className={`${isInView ? 'animate-[slideIn_0.4s_ease-out_both]' : 'opacity-0'} flex items-center gap-2 rounded-xl bg-crwn-surface border border-crwn-elevated p-2.5`}
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-crwn-gold shrink-0" />
            <div className="min-w-0">
              <div className="text-[12px] font-medium truncate">{r.name}</div>
              <div className="text-[10px] text-crwn-text-secondary">{r.views}</div>
            </div>
            <div className="ml-auto text-crwn-gold font-bold text-sm">{r.earned}</div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-crwn-text-secondary mt-2">Clippers download your streams, cut them up, and post everywhere. They earn only when a clip converts a subscriber.</p>
    </PhoneFrame>
  );
}

export function SyncMock() {
  const { ref, isInView } = useInView();
  const stats = [
    { n: 26, l: 'Opportunities', c: 'text-crwn-text' },
    { n: 18, l: 'Near You', c: 'text-crwn-gold' },
    { n: 9, l: 'Genre Match', c: 'text-green-400' },
  ];
  return (
    <PhoneFrame>
      <div className="text-sm font-bold mb-3">Sync licensing</div>
      <div ref={ref} className="grid grid-cols-3 gap-2 mb-3">
        {stats.map((s, i) => (
          <div
            key={s.l}
            style={{ animationDelay: `${i * 100}ms` }}
            className={`${isInView ? 'animate-[fadeInUp_0.45s_ease-out_both]' : 'opacity-0'} rounded-xl bg-crwn-surface border border-crwn-elevated p-2.5 text-center`}
          >
            <div className={`text-lg font-bold ${s.c}`}><AnimatedNumber end={s.n} active={isInView} /></div>
            <div className="text-[9px] text-crwn-text-secondary">{s.l}</div>
          </div>
        ))}
      </div>
      <div className="rounded-xl bg-crwn-surface border border-crwn-elevated p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[12px] font-semibold">Video Game — Ambient Brief</span>
          <span className="text-[9px] text-blue-300 bg-blue-500/15 rounded px-1.5 py-0.5">Brief</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-crwn-text-secondary mb-2">
          <Globe className="w-3 h-3" /> Online · <span className="text-crwn-gold">$20–$80</span>
        </div>
        <div className="bg-crwn-gold text-crwn-bg text-[11px] font-semibold rounded-full py-1.5 text-center">Register</div>
      </div>
    </PhoneFrame>
  );
}
