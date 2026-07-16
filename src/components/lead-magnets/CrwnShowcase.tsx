// The CRWN platform showcase.
//
// A tool-agnostic pitch that renders BELOW every non-Worth tool result (Vault, Proof of Demand,
// Fan Missions, Clip-to-Earn). Worth has its own bespoke, calculator-coupled showcase; this is
// the static marketing plus the interactive phone mockups lifted from it, so every tool result
// page sells the platform with the same visual depth and drives signup. No calculator numbers:
// the mocks render with their built-in demo data.

import Link from 'next/link';
import {
  Crown,
  Disc3,
  Radio,
  Video,
  ShoppingBag,
  Star,
  Check,
  X,
  ArrowRight,
  Wallet,
  CreditCard,
  Repeat,
  Landmark,
  Scissors,
  TrendingUp,
  Users,
  MessageCircle,
  Mail,
  Zap,
  Globe,
} from 'lucide-react';
import {
  TiersMock,
  ShopMock,
  LiveMock,
  CommunityMock,
  ClipperMock,
  SequencesMock,
  AiActionsMock,
  EarningsMock,
  LeaderboardMock,
  SyncMock,
} from '@/app/(public)/worth/mocks';

const GOLD = '#D4AF37';

const MONETIZE = [
  { icon: Crown, tag: 'Recurring', title: 'Monthly memberships', line: 'Fans subscribe every month for exclusive drops and perks. Up to three tiers.' },
  { icon: Disc3, tag: 'One-off', title: 'Tracks, stems & remixes', line: 'Sell songs, beat stems, and multitracks as one-off downloads.' },
  { icon: Radio, tag: 'Ticketed', title: 'Live sessions', line: 'Charge a ticket to go live, or make it a tier perk. Every stream auto-saves.' },
  { icon: Video, tag: 'Premium', title: 'Access to you', line: 'Priority DMs, voice notes, 1-on-1 video calls, custom songs.' },
  { icon: ShoppingBag, tag: 'Shop', title: 'Shop & merch', line: 'Digital products, sample packs, merch. Members get discounts.' },
  { icon: Star, tag: 'Whale', title: 'Custom & experiences', line: 'Custom verses, shoutouts, one-of-one experiences. Name your price.' },
];

const COMPARE = [
  { label: 'Pay per fan', streaming: 'Fractions of a cent', crwn: '$10 to $200 / month' },
  { label: 'Who you reach', streaming: 'The algorithm decides', crwn: 'Every fan, directly' },
  { label: 'Your cut', streaming: 'They keep most of it', crwn: 'You keep up to 92%' },
  { label: 'Fan data', streaming: 'You get none', crwn: 'Names, emails, phones' },
  { label: 'Payout', streaming: 'Months later, if at all', crwn: 'Straight to your bank' },
];

const FAN_MATH = [
  { fans: '100 fans', math: '× $15 / mo', total: '$1,500 / mo' },
  { fans: '500 fans', math: '× $15 / mo', total: '$7,500 / mo' },
  { fans: '1,000 fans', math: '× $15 / mo', total: '$15,000 / mo' },
];

const STEPS = [
  { n: 1, title: 'Claim your free account', line: 'No card required. Your artist page is ready in minutes.' },
  { n: 2, title: 'Set up your tiers and products', line: 'We help you build the whole thing: memberships, pricing, payouts.' },
  { n: 3, title: 'Point your fans to your link', line: 'Drop it in your bio and earn from the fans you already have.' },
];

const FAQS = [
  { q: 'What does it cost?', a: 'Free to start. You keep 88 to 92% of what you earn depending on your plan; CRWN only takes a small fee on actual sales.' },
  { q: 'How do fans pay me?', a: 'By card through Stripe. Every subscription, sale, and tip is paid straight to your bank account.' },
  { q: 'Do I keep my masters and rights?', a: 'Yes, 100%. It is your catalog, your audience, and your data. CRWN is a tool, not a label.' },
  { q: 'Can I still release on Spotify and Apple?', a: 'Absolutely. CRWN is additive. Use the release waterfall so paying fans get new music first and the DSPs get it last.' },
  { q: 'How fast can I set up?', a: 'Same day. Most artists are live within an hour.' },
];

function Heading({ icon: Icon, children }: { icon: typeof Crown; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="w-9 h-9 rounded-full bg-[#D4AF37]/15 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" style={{ color: GOLD }} />
      </span>
      <h2 className="text-2xl font-bold leading-tight">{children}</h2>
    </div>
  );
}

function MockSection({
  icon,
  title,
  copy,
  children,
}: {
  icon: typeof Crown;
  title: string;
  copy: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <Heading icon={icon}>{title}</Heading>
      <p className="text-white/60 mb-6 leading-relaxed">{copy}</p>
      {children}
    </section>
  );
}

export function CrwnShowcase({ claimed, claimHref }: { claimed: boolean; claimHref: string }) {
  const href = claimed ? '/profile/artist' : claimHref;
  const ctaLabel = claimed ? 'Open your dashboard' : 'Claim it on CRWN';

  return (
    <div className="mt-16 space-y-14">
      <div className="border-t border-white/10" />

      {/* What is CRWN */}
      <section>
        <Heading icon={Crown}>Wait, what is CRWN?</Heading>
        <p className="text-white/75 text-lg leading-relaxed">
          A platform to sell directly to your fans: memberships, songs, stems, live sessions, even
          access to you. No label. No middleman. No algorithm. You keep up to 92%, paid to your
          bank. Your fans pick a tier and pay you every month.
        </p>
      </section>

      {/* Everything you can charge for */}
      <section>
        <Heading icon={Wallet}>Everything you can charge for</Heading>
        <p className="text-white/60 mb-6">
          Every one of these is a revenue stream you switch on. Stack them, and the number adds up fast.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {MONETIZE.map((m) => (
            <div key={m.title} className="rounded-2xl bg-white/[0.02] border border-white/[0.08] p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="w-9 h-9 rounded-full bg-[#D4AF37]/15 flex items-center justify-center">
                  <m.icon className="w-4 h-4" style={{ color: GOLD }} />
                </span>
                <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full bg-[#D4AF37]/10" style={{ color: GOLD }}>
                  {m.tag}
                </span>
              </div>
              <h3 className="font-semibold mb-1">{m.title}</h3>
              <p className="text-white/60 text-sm leading-relaxed">{m.line}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Memberships */}
      <MockSection
        icon={Crown}
        title="A membership they pay for every month"
        copy="A free tier to capture everyone, then paid tiers built to catch the whale. Fans pick their level and pay you every month."
      >
        <TiersMock />
      </MockSection>

      {/* Streaming vs CRWN */}
      <section>
        <Heading icon={TrendingUp}>Streaming vs CRWN</Heading>
        <p className="text-white/60 mb-6">Same fans. Wildly different math. Streaming rents your audience back to you.</p>
        <div className="rounded-2xl border border-white/[0.08] overflow-hidden divide-y divide-white/[0.06]">
          <div className="grid grid-cols-3 text-xs uppercase tracking-wide">
            <div className="p-3" />
            <div className="p-3 text-center text-white/45">Streaming</div>
            <div className="p-3 text-center font-semibold bg-[#D4AF37]/5" style={{ color: GOLD }}>CRWN</div>
          </div>
          {COMPARE.map((row) => (
            <div key={row.label} className="grid grid-cols-3 text-sm items-center">
              <div className="p-3 text-white/70">{row.label}</div>
              <div className="p-3 text-center text-white/45 flex items-center justify-center gap-1.5">
                <X className="w-3.5 h-3.5 text-white/30 shrink-0" />
                <span>{row.streaming}</span>
              </div>
              <div className="p-3 text-center text-white/90 bg-[#D4AF37]/5 flex items-center justify-center gap-1.5">
                <Check className="w-3.5 h-3.5 shrink-0" style={{ color: GOLD }} />
                <span>{row.crwn}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Fan math */}
      <section>
        <Heading icon={Users}>You do not need millions of streams</Heading>
        <p className="text-white/60 mb-6">
          A small group of real supporters changes everything. Do the math on paying fans, not plays.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {FAN_MATH.map((f) => (
            <div key={f.fans} className="rounded-2xl bg-white/[0.02] border border-white/[0.08] p-5 text-center">
              <p className="text-white/70 text-sm">{f.fans}</p>
              <p className="text-white/40 text-xs mb-2">{f.math}</p>
              <p className="text-2xl font-bold" style={{ color: GOLD }}>{f.total}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Shop */}
      <MockSection
        icon={ShoppingBag}
        title="Your storefront, live in minutes"
        copy="Sell tracks, stems, sample packs, and merch as one-off products. Members get a discount."
      >
        <ShopMock />
      </MockSection>

      {/* Live */}
      <MockSection
        icon={Radio}
        title="Go live, and get paid for it"
        copy="Stream live right on your page. Sell tickets or gate it behind a tier. Every stream auto-saves as a recording you can sell, gate, or hand to your clippers."
      >
        <LiveMock />
      </MockSection>

      {/* Clip & Earn */}
      <MockSection
        icon={Scissors}
        title="Your fans are your marketing team"
        copy="Turn on Clip & Earn: fans clip your streams for TikTok and Reels, and earn a recurring cut on every subscriber they bring. You only pay them while it keeps working."
      >
        <ClipperMock />
      </MockSection>

      {/* Community */}
      <MockSection
        icon={MessageCircle}
        title="A gated community they pay to be in"
        copy="Post exclusive updates, unreleased snippets, and behind-the-scenes only your paying fans can see."
      >
        <CommunityMock />
      </MockSection>

      {/* Audience tools */}
      <MockSection
        icon={Mail}
        title="Own your audience, do not rent it"
        copy="Email, SMS, and automated sequences. CRWN hands you your fans' contact info and the tools to reach them any time, no algorithm."
      >
        <SequencesMock />
      </MockSection>

      {/* AI manager */}
      <MockSection
        icon={Zap}
        title="A manager built in"
        copy="A manager watches your numbers and hands you decisions to approve: raise a price, email fans, win back churn. You make music; it grows the business."
      >
        <AiActionsMock />
      </MockSection>

      {/* Keep 92% + money flow */}
      <section>
        <Heading icon={Wallet}>Keep up to 92%, paid to your bank</Heading>
        <p className="text-white/60 mb-6">
          Streaming pays fractions of a cent and keeps most of it. On CRWN the money flows straight
          to you, powered by Stripe. No label cut, no 30% middleman.
        </p>
        <div className="flex items-center justify-between gap-2 mb-5">
          {[
            { icon: CreditCard, top: 'Fan pays', bottom: 'by card' },
            { icon: Repeat, top: 'CRWN', bottom: 'handles it' },
            { icon: Landmark, top: 'Your bank', bottom: 'up to 92%' },
          ].map((node, i, arr) => (
            <div key={node.top} className="flex items-center gap-2 flex-1">
              <div className="rounded-xl bg-white/[0.02] border border-white/[0.08] p-3 text-center flex-1">
                <node.icon className="w-5 h-5 mx-auto mb-1.5" style={{ color: GOLD }} />
                <p className="text-sm font-semibold leading-tight">{node.top}</p>
                <p className="text-white/50 text-xs">{node.bottom}</p>
              </div>
              {i < arr.length - 1 && <ArrowRight className="w-4 h-4 text-white/30 shrink-0" />}
            </div>
          ))}
        </div>
        <div className="rounded-2xl bg-white/[0.02] border border-white/[0.08] p-5 mb-6">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-white/70">You keep</span>
            <span className="text-xl font-bold" style={{ color: GOLD }}>up to 92%</span>
          </div>
          <div className="h-3 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: '92%', backgroundColor: GOLD }} />
          </div>
          <p className="text-white/45 text-xs mt-3">
            Free plan keeps 88%. Pro keeps 92%. Every plan pays out straight to your bank.
          </p>
        </div>
        <EarningsMock />
      </section>

      {/* Leaderboard */}
      <MockSection
        icon={Users}
        title="See who actually supports you"
        copy="A live leaderboard ranks your biggest supporters by name and spend, so you know exactly who to keep close. Your audience, your data."
      >
        <LeaderboardMock />
      </MockSection>

      {/* Sync */}
      <MockSection
        icon={Globe}
        title="Bonus: get your music placed"
        copy="CRWN surfaces sync licensing briefs, TV, film, games, ads, matched to your genre. One placement can pay more than a year of streaming."
      >
        <SyncMock />
      </MockSection>

      {/* How it works */}
      <section>
        <Heading icon={Repeat}>How it works</Heading>
        <div className="space-y-4">
          {STEPS.map((s) => (
            <div key={s.n} className="flex gap-4 items-start">
              <span className="w-8 h-8 rounded-full bg-[#D4AF37]/15 flex items-center justify-center shrink-0 font-bold text-sm" style={{ color: GOLD }}>
                {s.n}
              </span>
              <div>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="text-white/60 text-sm leading-relaxed">{s.line}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section>
        <Heading icon={MessageCircle}>Questions</Heading>
        <div className="rounded-2xl bg-white/[0.02] border border-white/[0.08] divide-y divide-white/[0.06]">
          {FAQS.map((f) => (
            <div key={f.q} className="p-5">
              <h3 className="font-semibold mb-1">{f.q}</h3>
              <p className="text-white/60 text-sm leading-relaxed">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <div className="rounded-3xl border border-[#D4AF37]/25 bg-gradient-to-b from-[#D4AF37]/10 to-transparent p-8 text-center">
        <span className="w-14 h-14 rounded-full bg-[#D4AF37]/20 flex items-center justify-center mx-auto mb-4">
          <Crown className="w-7 h-7" style={{ color: GOLD }} />
        </span>
        <h3 className="text-2xl font-bold mb-2">Turn on every one of these revenue streams</h3>
        <p className="text-white/60 mb-6 leading-relaxed">
          Set up your page free and start earning from the fans you already have.
        </p>
        <Link
          href={href}
          className="inline-flex items-center gap-2 bg-[#D4AF37] text-black font-semibold px-7 py-3.5 rounded-full hover:opacity-90 transition"
        >
          {ctaLabel}
          <ArrowRight className="w-4 h-4" />
        </Link>
        <p className="text-white/40 text-xs mt-4">Free to start. No card required. Keep up to 92%.</p>
      </div>
    </div>
  );
}
