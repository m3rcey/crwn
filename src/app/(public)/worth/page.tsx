'use client';

import { useEffect, useMemo, useState, type ReactNode, type ComponentType } from 'react';
import {
  Crown, TrendingUp, Lock, Sparkles, Check, ChevronDown, ArrowRight,
  Music, DollarSign, Users, Mail, Zap, Wallet, BarChart3, HelpCircle,
  Disc3, Radio, Video, ShoppingBag, CreditCard, Landmark, Repeat, X, Star,
  MessageCircle, Globe,
} from 'lucide-react';
import {
  calculate,
  getAssumptions,
  fmtDollars,
  fmtCount,
  RECOMMENDED_TIER_PRICES,
  type AggressivenessPreset,
  type CalcAssumptions,
} from '@/lib/leadCalculator';

import {
  TiersMock, EarningsMock, LeaderboardMock, AiActionsMock,
  CommunityMock, ShopMock, SyncMock, SequencesMock,
} from './mocks';

// Primary CTA target: the scheduling page where the artist books a Zoom call.
const BOOK_CALL_URL = 'https://cal.com/jnwcreative';

// Brand gold as RGB for inline opacity steps (single-hue composition bar).
const GOLD = '212,175,55';

const PRESETS: { key: AggressivenessPreset; label: string }[] = [
  { key: 'conservative', label: 'Conservative' },
  { key: 'punchy', label: 'Realistic' },
  { key: 'aggressive', label: 'Optimistic' },
];

// The recommended tier blueprint the calculator's math rests on.
const TIERS = [
  {
    name: 'Inner Circle', price: '$10/mo', accent: false,
    perks: ['Exclusive tracks', '7-day early access', 'DMs with you', '10% shop discount'],
  },
  {
    name: 'The Vault', price: '$25/mo', accent: true,
    perks: ['Stems & multitracks', '14-day early access', 'Monthly group live Q&A', 'Voice-note replies'],
  },
  {
    name: 'Throne', price: '$100/mo', accent: false,
    perks: ['Day-0 first listen', 'Monthly 1-on-1 video call', '1 custom song / quarter', 'Credits on releases'],
  },
];

const WATERFALL = [
  { day: 'Day 0', label: 'Throne gets it first', sub: 'First listen + stems on sale' },
  { day: 'Day 14', label: 'The Vault', sub: 'Second in line' },
  { day: 'Day 30', label: 'Inner Circle', sub: 'Entry tier unlocks it' },
  { day: 'Day 45', label: 'Free tier on CRWN', sub: 'Everyone on CRWN, email captured' },
  { day: 'Day 60', label: 'Spotify / Apple / DSPs', sub: 'The leftovers get the pennies' },
];

// Every revenue stream that adds up to the number at the top of the page.
const MONETIZE_WAYS: { icon: ComponentType<{ className?: string }>; title: string; line: string; tag: string }[] = [
  { icon: Crown, title: 'Monthly memberships', line: 'Fans subscribe every month for exclusive drops and perks. Up to 3 tiers.', tag: 'Recurring' },
  { icon: Disc3, title: 'Tracks, stems & remixes', line: 'Sell songs, beat stems, and multitracks as one-off downloads.', tag: 'One-off' },
  { icon: Radio, title: 'Live sessions', line: 'Charge a ticket to go live, or make it a tier perk.', tag: 'Ticketed' },
  { icon: Video, title: 'Access to you', line: 'Priority DMs, voice notes, 1-on-1 video calls, custom songs.', tag: 'Premium' },
  { icon: ShoppingBag, title: 'Shop & merch', line: 'Digital products, sample packs, merch. Members get discounts.', tag: 'Shop' },
  { icon: Star, title: 'Custom & experiences', line: 'Custom verses, shoutouts, one-of-one experiences. Name your price.', tag: 'Whale' },
];

// Illustrative revenue composition (a healthy artist's mix). Single-hue bar.
const REVENUE_MIX = [
  { label: 'Memberships', pct: 52 },
  { label: 'Tracks & stems', pct: 16 },
  { label: 'Access & customs', pct: 16 },
  { label: 'Live', pct: 9 },
  { label: 'Shop', pct: 7 },
];
const MIX_OPACITY = [1, 0.78, 0.6, 0.44, 0.3];

const COMPARE = [
  { label: 'Pay per fan', streaming: 'Fractions of a cent', crwn: '$10–$200 / month' },
  { label: 'Who you reach', streaming: 'The algorithm decides', crwn: 'Every fan, directly' },
  { label: 'Your cut', streaming: 'They keep most of it', crwn: 'You keep up to 92%' },
  { label: 'Fan data', streaming: 'You get none', crwn: 'Names, emails, phones' },
  { label: 'Payout', streaming: 'Months later, if at all', crwn: 'Straight to your bank' },
];

const AUDIENCE_TOOLS = [
  { icon: '✉️', name: 'Email campaigns', desc: 'Reach every fan directly.' },
  { icon: '💬', name: 'SMS marketing', desc: 'Text supporters when it matters.' },
  { icon: '🔁', name: 'Automated sequences', desc: 'Welcome & win-back on autopilot.' },
  { icon: '🔗', name: 'Smart links & presaves', desc: 'Capture emails on every release.' },
  { icon: '🏷️', name: 'Discount codes', desc: 'Run drops and promos.' },
  { icon: '🛒', name: 'Cart recovery', desc: 'Win back near-checkouts.' },
];

const OBJECTIONS = [
  { q: 'My fans won’t pay.', a: 'You don’t need all of them. If even 1% of your followers pay $15/mo, that’s more than most independent artists make from streaming in a year. The number above already assumes only a small, realistic slice pays.' },
  { q: 'I’m too small for this.', a: 'Small is the whole point. 100 real fans beats 100,000 passive streams. CRWN is built for the artist streaming can’t pay yet.' },
  { q: 'I don’t have time to run all this.', a: 'The built-in AI manager and automated sequences do the heavy lifting. Set your tiers once and it runs in the background.' },
  { q: 'Is it really free to start?', a: 'Yes. Free to sign up, no card required. You only ever pay a small fee on money you actually earn.' },
];

const STEPS = [
  { n: '1', title: 'Book a quick call', body: 'We build your setup live on a 15-minute Zoom: tiers, pricing, the plan.' },
  { n: '2', title: 'Publish your page', body: 'Your artist page and tiers go live in minutes. No tech skills.' },
  { n: '3', title: 'Point your fans to it', body: 'Drop the link in your bio. Earn from the fans you already have.' },
];

const FAQS = [
  { q: 'What does it cost?', a: 'Free to start. You keep 88–92% of what you earn depending on your plan; CRWN only takes a small fee on actual sales.' },
  { q: 'How do fans pay me?', a: 'By card through Stripe. Every subscription, sale, and tip is paid straight to your bank account.' },
  { q: 'Do I keep my masters and rights?', a: 'Yes, 100%. It’s your catalog, your audience, and your data. CRWN is a tool, not a label.' },
  { q: 'Can I still release on Spotify and Apple?', a: 'Absolutely. CRWN is additive. Use the release waterfall so paying fans get new music first and the DSPs get it last.' },
  { q: 'How fast can I set up?', a: 'Same day. Most artists are live within an hour of their call.' },
];

const FAN_MATH = [
  { fans: '100', rev: '$1,500' },
  { fans: '500', rev: '$7,500' },
  { fans: '1,000', rev: '$15,000' },
];

export default function WorthCalculatorPage() {
  const [listeners, setListeners] = useState('50000');
  const [followers, setFollowers] = useState('');
  const [streaming, setStreaming] = useState('');
  const [preset, setPreset] = useState<AggressivenessPreset>('conservative');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Advanced overrides (start from preset, let the artist tune down/up).
  const base = useMemo(() => getAssumptions(preset), [preset]);
  const [superfanPct, setSuperfanPct] = useState<number | null>(null);
  const [alacarte, setAlacarte] = useState<number | null>(null);

  const [email, setEmail] = useState('');
  const [captureState, setCaptureState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  // Prefill inputs from URL query params so outreach links land on the artist's
  // own number, e.g. /worth?listeners=50000&followers=20000 (followers optional).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const l = params.get('listeners');
    const f = params.get('followers');
    const s = params.get('streaming');
    if (l && /\d/.test(l)) setListeners(l.replace(/\D/g, ''));
    if (f && /\d/.test(f)) setFollowers(f.replace(/\D/g, ''));
    if (s && /[\d.]/.test(s)) setStreaming(s.replace(/[^\d.]/g, ''));
  }, []);

  const assumptions: CalcAssumptions = {
    ...base,
    superfanRate: superfanPct != null ? superfanPct / 100 : base.superfanRate,
    alacarteArpuCents: alacarte != null ? alacarte * 100 : base.alacarteArpuCents,
  };

  const inputs = {
    monthlyListeners: parseInt(listeners.replace(/\D/g, ''), 10) || 0,
    engagedFollowers: parseInt(followers.replace(/\D/g, ''), 10) || 0,
    currentStreamingCents: Math.round((parseFloat(streaming.replace(/[^\d.]/g, '')) || 0) * 100),
  };

  const result = useMemo(() => calculate(inputs, assumptions), [
    inputs.monthlyListeners, inputs.engagedFollowers, inputs.currentStreamingCents,
    assumptions.superfanRate, assumptions.alacarteArpuCents, assumptions.reachRate,
  ]);

  const handleCapture = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setCaptureState('error');
      return;
    }
    setCaptureState('sending');
    try {
      const res = await fetch('/api/leads/calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          monthlyListeners: inputs.monthlyListeners,
          netAnnualCents: result.netAnnualCents,
        }),
      });
      setCaptureState(res.ok ? 'done' : 'error');
    } catch {
      setCaptureState('error');
    }
  };

  const hasNumber = inputs.monthlyListeners > 0 || inputs.engagedFollowers > 0;
  const monthlyLabel = hasNumber ? `${fmtDollars(result.netMrrCents)}/mo` : 'money';
  const annualLabel = hasNumber ? fmtDollars(result.netAnnualCents) : '';

  return (
    <div className="min-h-screen bg-crwn-bg text-crwn-text">
      <div className="max-w-3xl mx-auto px-4 py-12 sm:py-16 page-fade-in">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-crwn-gold/20 flex items-center justify-center">
            <Crown className="w-8 h-8 text-crwn-gold" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">
            How much money are you leaving on the table?
          </h1>
          <p className="text-crwn-text-secondary max-w-xl mx-auto">
            Streaming pays pennies. Your real superfans would pay you directly, if you gave them
            somewhere to. Punch in your numbers and see what you&apos;re walking away from every month.
          </p>
        </div>

        {/* Inputs */}
        <div className="bg-crwn-surface border border-crwn-elevated rounded-2xl p-6 mb-6">
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Monthly listeners" hint="if you have it" value={listeners} onChange={setListeners} placeholder="50,000" />
            <Field label="Followers" hint="if you have it" value={followers} onChange={setFollowers} placeholder="20,000" />
            <Field label="Streaming $ / mo" hint="optional" value={streaming} onChange={setStreaming} placeholder="auto" prefix="$" />
          </div>
          <p className="text-xs text-crwn-text-secondary/70 mt-3">
            Enter whatever you have. Just monthly listeners or just followers (Instagram, TikTok) is enough, both is sharper.
          </p>

          {/* Preset */}
          <div className="mt-6">
            <div className="text-xs text-crwn-text-secondary mb-2">Assumptions</div>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPreset(p.key)}
                  className={`py-2 px-3 rounded-full text-sm font-medium transition-colors ${
                    preset === p.key
                      ? 'bg-crwn-gold text-crwn-bg'
                      : 'bg-crwn-elevated text-crwn-text-secondary hover:text-crwn-text'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Advanced */}
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="mt-4 flex items-center gap-1 text-xs text-crwn-text-secondary hover:text-crwn-gold transition-colors"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            Adjust the assumptions yourself
          </button>
          {showAdvanced && (
            <div className="mt-4 space-y-5 border-t border-crwn-elevated pt-4">
              <Slider
                label="% of your audience who ever pay"
                value={superfanPct ?? Math.round(base.superfanRate * 100)}
                min={1} max={10} step={1} suffix="%"
                onChange={setSuperfanPct}
              />
              <Slider
                label="Extra spend per paying fan / mo (stems, sessions, custom work)"
                value={alacarte ?? Math.round(base.alacarteArpuCents / 100)}
                min={0} max={25} step={1} prefix="$"
                onChange={setAlacarte}
              />
              <p className="text-xs text-crwn-text-secondary/70">
                Reach: {Math.round(assumptions.reachRate * 100)}% of your audience counted as engaged · Tier prices: $
                {RECOMMENDED_TIER_PRICES.tier1PriceCents / 100} / $
                {RECOMMENDED_TIER_PRICES.tier2PriceCents / 100} / $
                {RECOMMENDED_TIER_PRICES.tier3PriceCents / 100} · Whale split 70 / 22 / 8 · Fee 8% (Pro)
              </p>
            </div>
          )}
        </div>

        {/* Result */}
        <div className="bg-gradient-to-b from-crwn-gold/10 to-crwn-surface border border-crwn-gold/30 rounded-2xl p-6 sm:p-8 mb-6 text-center">
          <div className="text-sm uppercase tracking-wide text-crwn-text-secondary mb-2">
            You&apos;re leaving roughly
          </div>
          <div className="text-5xl sm:text-6xl font-bold text-crwn-gold mb-1">
            {hasNumber ? fmtDollars(result.netMrrCents) : '–'}<span className="text-2xl sm:text-3xl font-bold">/mo</span>
          </div>
          <div className="text-crwn-text-secondary mb-6">
            on the table every month{hasNumber ? `. That's ${fmtDollars(result.netAnnualCents)} a year` : ''}
          </div>

          {hasNumber && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-left">
                <Stat label="Per year" value={fmtDollars(result.netAnnualCents)} />
                <Stat label="Paying superfans" value={fmtCount(result.payers)} />
                <Stat
                  label="vs. streaming income"
                  value={result.multipleVsStreaming ? `${Math.round(result.multipleVsStreaming)}×` : '–'}
                />
                <Stat label="Subscriptions / mo" value={fmtDollars(result.subsMrrCents)} />
                <Stat label="À la carte / mo" value={fmtDollars(result.alacarteMrrCents)} />
                <Stat label="Streaming / mo" value={fmtDollars(result.streamingMrrCents)} />
              </div>
              <p className="text-xs text-crwn-text-secondary/70 mt-4">
                Estimate from {fmtCount(result.addressable)} addressable fans ·{' '}
                {Math.round(assumptions.superfanRate * 1000) / 10}% become paying superfans. Adjust the
                assumptions above. The math is yours to check.
              </p>
            </>
          )}
        </div>

        {/* Email capture + CTA */}
        <div className="bg-crwn-surface border border-crwn-elevated rounded-2xl p-6 mb-14">
          {captureState === 'done' ? (
            <div className="flex items-center gap-2 text-crwn-gold justify-center py-2">
              <Check className="w-5 h-5" /> On its way. Check your inbox for the full breakdown.
            </div>
          ) : (
            <>
              <div className="text-center mb-4">
                <div className="font-semibold mb-1">Get your full breakdown + the setup blueprint</div>
                <div className="text-sm text-crwn-text-secondary">
                  We&apos;ll email the numbers and the exact tier setup to copy.
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (captureState === 'error') setCaptureState('idle'); }}
                  placeholder="you@email.com"
                  className="flex-1 px-4 py-3 bg-crwn-bg border border-crwn-elevated rounded-xl text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold transition-colors"
                />
                <button
                  onClick={handleCapture}
                  disabled={captureState === 'sending'}
                  className="px-6 py-3 bg-crwn-elevated text-crwn-text font-medium rounded-full hover:bg-crwn-elevated/70 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {captureState === 'sending' ? 'Sending…' : 'Email it to me'}
                </button>
              </div>
              {captureState === 'error' && (
                <p className="text-xs text-red-400 mt-2 text-center">Enter a valid email and try again.</p>
              )}
            </>
          )}

          <a
            href={BOOK_CALL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 w-full flex items-center justify-center gap-2 bg-crwn-gold text-crwn-bg font-semibold py-4 px-6 rounded-full hover:bg-crwn-gold/90 transition-colors"
          >
            Book a free 15-min call, keep this money <ArrowRight className="w-5 h-5" />
          </a>
          <p className="text-center text-xs text-crwn-text-secondary mt-3">
            A quick Zoom. We&apos;ll show you exactly how to capture this. No pitch.
          </p>
        </div>

        {/* Streaming vs CRWN */}
        <section className="mb-14">
          <SectionHeading icon={DollarSign}>Streaming vs. CRWN</SectionHeading>
          <p className="text-crwn-text-secondary text-sm mb-5">
            Same fans. Wildly different math. Streaming rents your audience back to you.
          </p>
          <CompareTable />
        </section>

        {/* Where the number comes from */}
        <section className="mb-14">
          <SectionHeading icon={BarChart3}>Where {hasNumber ? fmtDollars(result.netMrrCents) + '/mo' : 'the number'} comes from</SectionHeading>
          <p className="text-crwn-text-secondary text-sm mb-5">
            It&apos;s not one big thing. It&apos;s a stack of small ones, all from the same fans.
          </p>
          <div className="bg-crwn-surface border border-crwn-elevated rounded-2xl p-6">
            <RevenueStack />
          </div>
        </section>

        {/* Fan math */}
        <section className="mb-6">
          <SectionHeading icon={Users}>You don&apos;t need millions of streams</SectionHeading>
          <p className="text-crwn-text-secondary text-sm mb-5">
            A small group of real supporters changes everything. Do the math on paying fans, not plays:
          </p>
          <div className="grid grid-cols-3 gap-3">
            {FAN_MATH.map((m) => (
              <div key={m.fans} className="bg-crwn-surface border border-crwn-elevated rounded-2xl p-5 text-center">
                <div className="text-2xl sm:text-3xl font-bold text-crwn-gold">{m.fans}</div>
                <div className="text-xs text-crwn-text-secondary mb-2">fans × $15/mo</div>
                <div className="text-lg font-semibold">{m.rev}/mo</div>
              </div>
            ))}
          </div>
        </section>

        <BookCTA sub="A 15-minute Zoom. We map your exact setup. No pitch.">
          {hasNumber ? `Show me how to capture my ${monthlyLabel}` : 'Show me how it works'}
        </BookCTA>

        {/* What is CRWN + product mock */}
        <section className="mb-14">
          <SectionHeading icon={Music}>Wait, what is CRWN?</SectionHeading>
          <p className="text-crwn-text-secondary text-sm mb-6">
            A platform to sell directly to your fans: memberships, songs, stems, live sessions, even
            access to you. No label. No middleman. No algorithm. You keep up to 92%, paid to your bank.
            Fans pick a tier and pay you every month:
          </p>
          <TiersMock subs={hasNumber ? { t1: result.tier1Subs, t2: result.tier2Subs, t3: result.tier3Subs } : undefined} />
        </section>

        {/* Everything you can charge for */}
        <section className="mb-14">
          <SectionHeading icon={Sparkles}>Everything you can charge for</SectionHeading>
          <p className="text-crwn-text-secondary text-sm mb-5">
            Every one of these is a revenue stream you switch on. Stack them, and the number adds up fast.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {MONETIZE_WAYS.map((w) => (
              <div key={w.title} className="bg-crwn-surface border border-crwn-elevated rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full bg-crwn-gold/15 flex items-center justify-center shrink-0">
                    <w.icon className="w-5 h-5 text-crwn-gold" />
                  </div>
                  <div className="font-semibold">{w.title}</div>
                </div>
                <p className="text-sm text-crwn-text-secondary leading-relaxed mb-3">{w.line}</p>
                <span className="inline-block text-[10px] uppercase tracking-wide text-crwn-gold bg-crwn-gold/10 rounded-full px-2 py-1">{w.tag}</span>
              </div>
            ))}
          </div>
          <p className="text-crwn-text-secondary text-sm mt-6 mb-4">Your storefront, live in minutes:</p>
          <ShopMock />
        </section>

        {/* The tier setup */}
        <section className="mb-14">
          <SectionHeading icon={Crown}>The setup that captures it</SectionHeading>
          <p className="text-crwn-text-secondary text-sm mb-5">
            A free tier to capture everyone, then three paid tiers built to catch the whale.
          </p>
          <div className="grid sm:grid-cols-3 gap-4">
            {TIERS.map((t) => (
              <div
                key={t.name}
                className={`rounded-2xl p-5 border ${
                  t.accent ? 'border-crwn-gold/50 bg-crwn-gold/5' : 'border-crwn-elevated bg-crwn-surface'
                }`}
              >
                <div className="font-semibold">{t.name}</div>
                <div className="text-crwn-gold text-lg font-bold mb-3">{t.price}</div>
                <ul className="space-y-1.5">
                  {t.perks.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm text-crwn-text-secondary">
                      <Check className="w-4 h-4 text-crwn-gold shrink-0 mt-0.5" /> {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Release waterfall (visual timeline) */}
        <section className="mb-14">
          <SectionHeading icon={TrendingUp}>Release like the majors don&apos;t</SectionHeading>
          <p className="text-crwn-text-secondary text-sm mb-6">
            The scarce good isn&apos;t the song, it&apos;s time. Every tier is a skip-the-line pass.
            DSPs get it last, on purpose.
          </p>
          <div className="bg-crwn-surface border border-crwn-elevated rounded-2xl p-6">
            {WATERFALL.map((w, i) => (
              <div key={w.day} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-3.5 h-3.5 rounded-full shrink-0 mt-1 ${i === WATERFALL.length - 1 ? 'bg-crwn-elevated' : 'bg-crwn-gold'}`} />
                  {i < WATERFALL.length - 1 && <div className="w-0.5 flex-1 bg-crwn-elevated my-1" />}
                </div>
                <div className={i < WATERFALL.length - 1 ? 'pb-5' : ''}>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-crwn-gold bg-crwn-gold/10 rounded-full px-2 py-0.5">{w.day}</span>
                    <span className="font-medium text-sm flex items-center gap-1">
                      {i < WATERFALL.length - 1 && <Lock className="w-3 h-3 text-crwn-gold" />}
                      {w.label}
                    </span>
                  </div>
                  <p className="text-xs text-crwn-text-secondary mt-1">{w.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <BookCTA sub="Free to start. No card required.">Book my free 15-min call</BookCTA>

        {/* Community */}
        <section className="mb-14">
          <SectionHeading icon={MessageCircle}>A gated community they pay to be in</SectionHeading>
          <p className="text-crwn-text-secondary text-sm mb-6">
            Post exclusive updates, unreleased snippets, and behind-the-scenes only your paying fans can
            see. It&apos;s the room they subscribe to get into.
          </p>
          <CommunityMock />
        </section>

        {/* Own your audience */}
        <section className="mb-14">
          <SectionHeading icon={Mail}>Own your audience, don&apos;t rent it</SectionHeading>
          <p className="text-crwn-text-secondary text-sm mb-5">
            Algorithms decide who sees your posts. Your fan list doesn&apos;t. CRWN hands you their
            contact info and the tools to reach them any time.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {AUDIENCE_TOOLS.map((t) => (
              <div key={t.name} className="bg-crwn-surface border border-crwn-elevated rounded-2xl p-4">
                <div className="text-2xl mb-2">{t.icon}</div>
                <div className="font-semibold text-sm mb-1">{t.name}</div>
                <p className="text-xs text-crwn-text-secondary">{t.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-crwn-text-secondary text-sm mt-6 mb-4">Set your automations once, they run forever:</p>
          <SequencesMock />
        </section>

        {/* AI manager + mock */}
        <section className="mb-14">
          <SectionHeading icon={Zap}>A manager built in</SectionHeading>
          <p className="text-crwn-text-secondary text-sm mb-6">
            An AI manager watches your numbers and hands you decisions to approve, raise a price, email
            fans, win back churn. You make music; it grows the business.
          </p>
          <AiActionsMock />
        </section>

        {/* Money flow + fees */}
        <section className="mb-14">
          <SectionHeading icon={Wallet}>Keep up to 92%, paid to your bank</SectionHeading>
          <p className="text-crwn-text-secondary text-sm mb-6">
            Streaming pays fractions of a cent and keeps most of it. On CRWN the money flows straight
            to you, powered by Stripe. No label cut, no 30% middleman.
          </p>
          <MoneyFlow />
          <div className="bg-crwn-surface border border-crwn-elevated rounded-2xl p-6 mt-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-crwn-text-secondary">You keep</span>
              <span className="text-crwn-gold font-bold">up to 92%</span>
            </div>
            <div className="h-3 rounded-full bg-crwn-elevated overflow-hidden">
              <div className="h-full bg-crwn-gold rounded-full" style={{ width: '92%' }} />
            </div>
            <div className="text-xs text-crwn-text-secondary mt-2">Free plan keeps 88%. Pro keeps 92%. Every plan pays out straight to your bank.</div>
          </div>
        </section>

        {/* Payouts mock */}
        <section className="mb-14">
          <SectionHeading icon={CreditCard}>Watch it hit your account</SectionHeading>
          <p className="text-crwn-text-secondary text-sm mb-6">
            Every subscription and sale lands in your balance in real time. Cash out anytime, or auto-payout
            every week. No invoices, no waiting on a label.
          </p>
          <EarningsMock balanceCents={hasNumber ? result.netMrrCents : undefined} />
        </section>

        {/* Analytics mock */}
        <section className="mb-14">
          <SectionHeading icon={Users}>See who actually supports you</SectionHeading>
          <p className="text-crwn-text-secondary text-sm mb-6">
            A live leaderboard ranks your biggest supporters by name and spend, so you know exactly who
            to keep close. Your audience, your data.
          </p>
          <LeaderboardMock />
        </section>

        <BookCTA sub="15 minutes. We&apos;ll build your plan live.">See it on your own catalog</BookCTA>

        {/* Sync licensing (bonus) */}
        <section className="mb-14">
          <SectionHeading icon={Globe}>Bonus: get your music placed</SectionHeading>
          <p className="text-crwn-text-secondary text-sm mb-6">
            CRWN surfaces sync licensing briefs, TV, film, games, ads, matched to your genre. One
            placement can pay more than a year of streaming.
          </p>
          <SyncMock />
        </section>

        {/* Objections */}
        <section className="mb-14">
          <SectionHeading icon={HelpCircle}>But will this work for me?</SectionHeading>
          <div className="space-y-3">
            {OBJECTIONS.map((o) => (
              <div key={o.q} className="bg-crwn-surface border border-crwn-elevated rounded-2xl p-5">
                <div className="font-semibold mb-1">&ldquo;{o.q}&rdquo;</div>
                <p className="text-sm text-crwn-text-secondary leading-relaxed">{o.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Steps */}
        <section className="mb-14">
          <SectionHeading icon={Repeat}>How it works</SectionHeading>
          <div className="grid sm:grid-cols-3 gap-3">
            {STEPS.map((s) => (
              <div key={s.n} className="bg-crwn-surface border border-crwn-elevated rounded-2xl p-5">
                <div className="w-8 h-8 rounded-full bg-crwn-gold text-crwn-bg font-bold flex items-center justify-center mb-3">{s.n}</div>
                <div className="font-semibold mb-1">{s.title}</div>
                <p className="text-sm text-crwn-text-secondary">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-14">
          <SectionHeading icon={HelpCircle}>Questions</SectionHeading>
          <div className="divide-y divide-crwn-elevated">
            {FAQS.map((f) => (
              <div key={f.q} className="py-4">
                <div className="font-semibold mb-1">{f.q}</div>
                <p className="text-sm text-crwn-text-secondary leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Final recap CTA */}
        <div className="bg-gradient-to-b from-crwn-gold/10 to-crwn-surface border border-crwn-gold/30 rounded-2xl p-8 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-crwn-gold/20 flex items-center justify-center">
            <Crown className="w-7 h-7 text-crwn-gold" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">
            You&apos;re leaving {monthlyLabel} on the table.{hasNumber ? ` That's ${annualLabel} a year.` : ''} Let&apos;s go get it.
          </h2>
          <p className="text-crwn-text-secondary">
            Book a free 15-minute Zoom and we&apos;ll set up every one of these revenue streams with you, live.
          </p>
          <BookCTA sub="Free to start. No card required. Keep up to 92%.">
            Book a call, claim your {monthlyLabel}
          </BookCTA>
        </div>
      </div>
    </div>
  );
}

// ---- Presentational helpers ----

// Reusable "Book a call" CTA, peppered throughout the long-form page.
function BookCTA({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="text-center my-12">
      <a
        href={BOOK_CALL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center gap-2 bg-crwn-gold text-crwn-bg font-semibold py-4 px-8 rounded-full hover:bg-crwn-gold/90 transition-colors"
      >
        {children} <ArrowRight className="w-5 h-5" />
      </a>
      {sub && <p className="text-xs text-crwn-text-secondary mt-3">{sub}</p>}
    </div>
  );
}

function SectionHeading({ icon: Icon, children }: { icon: ComponentType<{ className?: string }>; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <div className="w-9 h-9 rounded-full bg-crwn-gold/15 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-crwn-gold" />
      </div>
      <h2 className="text-2xl sm:text-3xl font-bold">{children}</h2>
    </div>
  );
}

function CompareTable() {
  return (
    <div className="bg-crwn-surface border border-crwn-elevated rounded-2xl overflow-hidden">
      <div className="grid grid-cols-2 text-center">
        <div className="py-3 text-sm font-semibold text-crwn-text-secondary border-b border-crwn-elevated">Streaming</div>
        <div className="py-3 text-sm font-semibold text-crwn-gold bg-crwn-gold/5 border-b border-crwn-gold/30">CRWN</div>
      </div>
      {COMPARE.map((r) => (
        <div key={r.label} className="grid grid-cols-2">
          <div className="px-4 py-3 flex items-start gap-2 border-b border-crwn-elevated/60">
            <X className="w-4 h-4 text-crwn-text-secondary/50 shrink-0 mt-0.5" />
            <div>
              <div className="text-[10px] uppercase tracking-wide text-crwn-text-secondary/50">{r.label}</div>
              <div className="text-sm text-crwn-text-secondary">{r.streaming}</div>
            </div>
          </div>
          <div className="px-4 py-3 flex items-start gap-2 bg-crwn-gold/5 border-b border-crwn-gold/20">
            <Check className="w-4 h-4 text-crwn-gold shrink-0 mt-0.5" />
            <div>
              <div className="text-[10px] uppercase tracking-wide text-crwn-gold/70">{r.label}</div>
              <div className="text-sm text-crwn-text">{r.crwn}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Single-hue composition bar (magnitude by opacity step, direct-labeled).
function RevenueStack() {
  return (
    <div>
      <div className="flex w-full h-8 rounded-full overflow-hidden gap-[2px] bg-crwn-bg">
        {REVENUE_MIX.map((s, i) => (
          <div key={s.label} style={{ width: `${s.pct}%`, backgroundColor: `rgba(${GOLD},${MIX_OPACITY[i]})` }} />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 mt-4">
        {REVENUE_MIX.map((s, i) => (
          <div key={s.label} className="flex items-center gap-2 text-xs">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: `rgba(${GOLD},${MIX_OPACITY[i]})` }} />
            <span className="text-crwn-text-secondary truncate">{s.label}</span>
            <span className="text-crwn-text font-medium ml-auto">{s.pct}%</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-crwn-text-secondary/70 mt-4">Illustrative mix. Your split depends on what you turn on.</p>
    </div>
  );
}

function MoneyFlow() {
  const nodes = [
    { icon: CreditCard, label: 'Fan pays', sub: 'by card' },
    { icon: Repeat, label: 'CRWN', sub: 'handles it' },
    { icon: Landmark, label: 'Your bank', sub: 'up to 92%' },
  ];
  return (
    <div className="flex items-stretch justify-between gap-2">
      {nodes.map((n, i) => (
        <div key={n.label} className="flex items-center gap-2 flex-1">
          <div className="flex-1 bg-crwn-surface border border-crwn-elevated rounded-2xl p-4 text-center">
            <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-crwn-gold/15 flex items-center justify-center">
              <n.icon className="w-5 h-5 text-crwn-gold" />
            </div>
            <div className="text-sm font-semibold">{n.label}</div>
            <div className="text-[11px] text-crwn-text-secondary">{n.sub}</div>
          </div>
          {i < nodes.length - 1 && <ArrowRight className="w-4 h-4 text-crwn-gold shrink-0" />}
        </div>
      ))}
    </div>
  );
}

function Field({
  label, hint, value, onChange, placeholder, prefix,
}: {
  label: string; hint: string; value: string; onChange: (v: string) => void; placeholder: string; prefix?: string;
}) {
  return (
    <div>
      <label className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-[10px] uppercase tracking-wide text-crwn-text-secondary/60">{hint}</span>
      </label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-crwn-text-secondary">{prefix}</span>
        )}
        <input
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full ${prefix ? 'pl-7' : 'pl-4'} pr-4 py-3 bg-crwn-bg border border-crwn-elevated rounded-xl text-crwn-text placeholder-crwn-text-secondary/40 focus:outline-none focus:border-crwn-gold transition-colors`}
        />
      </div>
    </div>
  );
}

function Slider({
  label, value, min, max, step, prefix, suffix, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number;
  prefix?: string; suffix?: string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-crwn-text-secondary">{label}</span>
        <span className="text-sm font-semibold text-crwn-gold">{prefix}{value}{suffix}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full accent-crwn-gold"
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-crwn-bg/40 rounded-xl p-3">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs text-crwn-text-secondary">{label}</div>
    </div>
  );
}
