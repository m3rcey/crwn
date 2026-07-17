'use client';

// Per-tool interactive visuals for the /tools/[slug] lead magnet pages, in the same
// animated phone-mock style as CrwnShowcase. The registry is deliberately JSX-free,
// so tools opt in here via TOOL_SHOWCASES keyed by slug; tools without an entry
// render nothing extra. Copy is loss-framed per the marketing copy rule.

import { Vote, BarChart3, type LucideIcon } from 'lucide-react';
import { DemandFanMock, DemandResultsMock } from '@/app/(public)/worth/mocks';

const GOLD = '#D4AF37';

function MockBlock({
  icon: Icon,
  title,
  copy,
  children,
}: {
  icon: LucideIcon;
  title: string;
  copy: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <span className="w-9 h-9 rounded-full bg-[#D4AF37]/15 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4" style={{ color: GOLD }} />
        </span>
        <h2 className="text-2xl font-bold leading-tight">{title}</h2>
      </div>
      <p className="text-white/60 mb-6 leading-relaxed">{copy}</p>
      {children}
    </section>
  );
}

function DemandTestShowcase() {
  return (
    <div className="space-y-14">
      <MockBlock
        icon={Vote}
        title="Fans prove it with one tap"
        copy="Announce the drop with no test and you find out demand was fake at the merch table. This is the page your fans get instead: one tap, no payment, every vote a fan putting their name on wanting it."
      >
        <DemandFanMock />
      </MockBlock>

      <MockBlock
        icon={BarChart3}
        title="You watch the proof come in live"
        copy="Guessing costs you the pressing fee, the venue deposit, the wasted month. Your results page counts every response toward the goal and shows who would promote it. Hit the number and one tap converts the test into a real offer."
      >
        <DemandResultsMock />
      </MockBlock>
    </div>
  );
}

const TOOL_SHOWCASES: Record<string, () => React.ReactElement> = {
  'proof-of-demand-test-builder': DemandTestShowcase,
};

export function ToolShowcase({ slug }: { slug: string }) {
  const Showcase = TOOL_SHOWCASES[slug];
  if (!Showcase) return null;
  return (
    <div className="mt-16 space-y-14">
      <div className="border-t border-white/10" />
      <Showcase />
    </div>
  );
}
