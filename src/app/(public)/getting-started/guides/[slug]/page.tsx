'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useInView } from '@/hooks/useInView';
import {
  ChevronLeft, ChevronRight, ArrowLeft, ArrowRight, Check, Lightbulb,
  BookOpen, Clock, Crown, Star, Sparkles, ChevronDown,
} from 'lucide-react';
import Link from 'next/link';
import { getGuideBySlug } from '../guideContent';
import type { GuideData, GuideStep } from '../guideContent';

// ─── Animated Progress Bar ───
function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = ((current + 1) / total) * 100;
  return (
    <div className="w-full h-1.5 bg-crwn-surface rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-crwn-gold/60 to-crwn-gold rounded-full transition-all duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── Animated Step Card ───
function StepCard({ step, index, isActive, onToggle }: {
  step: GuideStep; index: number; isActive: boolean; onToggle: () => void;
}) {
  const { ref, isInView } = useInView();

  return (
    <div
      ref={ref}
      className={`${isInView ? 'guide-slide-left' : 'opacity-0'}`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div
        className={`neu-raised rounded-2xl overflow-hidden transition-all duration-300 border ${
          isActive ? 'border-crwn-gold/30' : 'border-transparent'
        }`}
      >
        {/* Header — always visible */}
        <button
          onClick={onToggle}
          className="w-full flex items-center gap-4 p-5 text-left hover:bg-white/[0.02] transition-colors"
        >
          <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
            isActive ? 'bg-crwn-gold text-crwn-bg' : 'bg-crwn-gold/15 text-crwn-gold'
          }`}>
            <span className="text-sm font-bold">{index + 1}</span>
          </div>
          <h3 className="flex-1 text-crwn-text font-semibold">{step.title}</h3>
          <ChevronDown className={`w-5 h-5 text-crwn-text-dim transition-transform duration-300 ${isActive ? 'rotate-180' : ''}`} />
        </button>

        {/* Expandable Content */}
        <div className={`overflow-hidden transition-all duration-300 ${isActive ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="px-5 pb-5 pt-0">
            <div className="pl-14">
              <p className="text-crwn-text-secondary text-sm leading-relaxed mb-4">
                {step.content}
              </p>
              {step.tip && (
                <div className="flex items-start gap-3 bg-crwn-gold/5 rounded-xl p-4 border border-crwn-gold/10">
                  <Lightbulb className="w-4 h-4 text-crwn-gold flex-shrink-0 mt-0.5" />
                  <p className="text-crwn-gold/90 text-sm leading-relaxed">{step.tip}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Animated Visual for Guide Header ───
function GuideVisual({ guide }: { guide: GuideData }) {
  const Icon = guide.icon;

  return (
    <div className="relative w-full h-48 md:h-56 flex items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-crwn-gold/5 via-crwn-bg to-crwn-gold/10">
      {/* Floating background shapes */}
      <div className="absolute inset-0">
        <div className="absolute top-4 left-8 w-20 h-20 rounded-full bg-crwn-gold/5 guide-float" style={{ animationDelay: '0s' }} />
        <div className="absolute bottom-8 right-12 w-16 h-16 rounded-full bg-crwn-gold/8 guide-float" style={{ animationDelay: '-1.5s' }} />
        <div className="absolute top-12 right-1/4 w-12 h-12 rounded-full bg-crwn-gold/3 guide-float" style={{ animationDelay: '-3s' }} />
        <div className="absolute bottom-4 left-1/3 w-8 h-8 rounded-full bg-crwn-gold/6 guide-float" style={{ animationDelay: '-2s' }} />
      </div>

      {/* Orbiting elements */}
      <div className="relative">
        <div className="w-24 h-24 rounded-2xl bg-crwn-gold/10 flex items-center justify-center guide-float border border-crwn-gold/20">
          <Icon className="w-12 h-12 text-crwn-gold" />
        </div>

        {/* Orbiting dots */}
        <div className="absolute -inset-8">
          <div className="guide-orbit">
            <div className="w-3 h-3 rounded-full bg-crwn-gold/40" />
          </div>
        </div>
        <div className="absolute -inset-12">
          <div className="guide-orbit-reverse" style={{ animationDelay: '-3s' }}>
            <div className="w-2 h-2 rounded-full bg-crwn-gold/25" />
          </div>
        </div>
      </div>

      {/* Shimmer line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-crwn-gold/30 to-transparent" />
    </div>
  );
}

// ─── Completion Animation ───
function CompletionBadge({ stepsCompleted, totalSteps }: { stepsCompleted: number; totalSteps: number }) {
  const allDone = stepsCompleted === totalSteps;

  return (
    <div className="flex items-center gap-3">
      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
        allDone
          ? 'bg-crwn-gold/20 text-crwn-gold'
          : 'bg-crwn-surface text-crwn-text-secondary'
      }`}>
        {allDone ? (
          <>
            <Check className="w-3.5 h-3.5" />
            All steps reviewed
          </>
        ) : (
          <>
            <BookOpen className="w-3.5 h-3.5" />
            {stepsCompleted} / {totalSteps} steps
          </>
        )}
      </div>
    </div>
  );
}

// ─── Pro Tips Section ───
function ProTipsSection({ tips }: { tips: string[] }) {
  const { ref, isInView } = useInView();

  return (
    <div ref={ref} className="mt-12">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-full bg-crwn-gold/15 flex items-center justify-center">
          <Star className="w-4 h-4 text-crwn-gold" />
        </div>
        <h2 className="text-xl font-bold text-crwn-text">Pro Tips</h2>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {tips.map((tip, i) => (
          <div
            key={i}
            className={`neu-raised rounded-xl p-5 border border-transparent guide-card-glow ${
              isInView ? 'guide-scale-in' : 'opacity-0'
            }`}
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="flex items-start gap-3">
              <Sparkles className="w-4 h-4 text-crwn-gold flex-shrink-0 mt-1" />
              <p className="text-crwn-text-secondary text-sm leading-relaxed">{tip}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Navigation Between Guides ───
function GuideNavigation({ guide }: { guide: GuideData }) {
  return (
    <div className="mt-12 flex flex-col sm:flex-row gap-4">
      {guide.prevGuide ? (
        <Link
          href={`/getting-started/guides/${guide.prevGuide.slug}`}
          className="flex-1 neu-raised rounded-xl p-4 flex items-center gap-3 group hover:border-crwn-gold/20 border border-transparent transition-all"
        >
          <ChevronLeft className="w-5 h-5 text-crwn-text-dim group-hover:text-crwn-gold group-hover:-translate-x-1 transition-all" />
          <div>
            <div className="text-xs text-crwn-text-dim">Previous</div>
            <div className="text-sm text-crwn-text font-medium group-hover:text-crwn-gold transition-colors">{guide.prevGuide.title}</div>
          </div>
        </Link>
      ) : (
        <div className="flex-1" />
      )}
      {guide.nextGuide ? (
        <Link
          href={`/getting-started/guides/${guide.nextGuide.slug}`}
          className="flex-1 neu-raised rounded-xl p-4 flex items-center justify-end gap-3 group hover:border-crwn-gold/20 border border-transparent transition-all text-right"
        >
          <div>
            <div className="text-xs text-crwn-text-dim">Next</div>
            <div className="text-sm text-crwn-text font-medium group-hover:text-crwn-gold transition-colors">{guide.nextGuide.title}</div>
          </div>
          <ChevronRight className="w-5 h-5 text-crwn-text-dim group-hover:text-crwn-gold group-hover:translate-x-1 transition-all" />
        </Link>
      ) : (
        <Link
          href="/getting-started?role=artist"
          className="flex-1 neu-raised rounded-xl p-4 flex items-center justify-end gap-3 group hover:border-crwn-gold/20 border border-transparent transition-all text-right"
        >
          <div>
            <div className="text-xs text-crwn-text-dim">Done!</div>
            <div className="text-sm text-crwn-text font-medium group-hover:text-crwn-gold transition-colors">Back to All Guides</div>
          </div>
          <ArrowRight className="w-5 h-5 text-crwn-text-dim group-hover:text-crwn-gold group-hover:translate-x-1 transition-all" />
        </Link>
      )}
    </div>
  );
}

// ─── Main Guide Page ───
export default function GuidePage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const guide = getGuideBySlug(slug);

  const [openSteps, setOpenSteps] = useState<Set<number>>(new Set([0]));

  const toggleStep = (index: number) => {
    setOpenSteps(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // Scroll to top when slug changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setOpenSteps(new Set([0]));
  }, [slug]);

  if (!guide) {
    return (
      <div className="min-h-screen bg-crwn-bg flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-crwn-text mb-4">Guide Not Found</h1>
          <Link href="/getting-started?role=artist" className="text-crwn-gold hover:underline">
            Back to all guides
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-crwn-bg">
      {/* Top Bar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-crwn-bg/80 backdrop-blur-md border-b border-crwn-elevated">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <button
              onClick={() => router.push('/getting-started?role=artist')}
              className="flex items-center gap-2 text-crwn-text-secondary hover:text-crwn-gold transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              All Guides
            </button>
            <CompletionBadge stepsCompleted={openSteps.size} totalSteps={guide.steps.length} />
          </div>
          <ProgressBar current={Math.max(...Array.from(openSteps), 0)} total={guide.steps.length} />
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 pt-20 pb-16 page-fade-in">
        {/* Visual Header */}
        <GuideVisual guide={guide} />

        {/* Guide Info */}
        <div className="mt-8 mb-10">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs font-medium text-crwn-gold/80 bg-crwn-gold/10 rounded-full px-3 py-1">{guide.category}</span>
            <span className="flex items-center gap-1 text-xs text-crwn-text-dim">
              <Clock className="w-3.5 h-3.5" />
              {guide.estimatedTime} read
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-crwn-text mb-3">{guide.title}</h1>
          <p className="text-lg text-crwn-text-secondary leading-relaxed">{guide.subtitle}</p>
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {guide.steps.map((step, i) => (
            <StepCard
              key={i}
              step={step}
              index={i}
              isActive={openSteps.has(i)}
              onToggle={() => toggleStep(i)}
            />
          ))}
        </div>

        {/* Expand All */}
        <div className="mt-6 text-center">
          <button
            onClick={() => {
              if (openSteps.size === guide.steps.length) {
                setOpenSteps(new Set());
              } else {
                setOpenSteps(new Set(guide.steps.map((_, i) => i)));
              }
            }}
            className="text-crwn-text-dim text-sm hover:text-crwn-gold transition-colors"
          >
            {openSteps.size === guide.steps.length ? 'Collapse all steps' : 'Expand all steps'}
          </button>
        </div>

        {/* Pro Tips */}
        <ProTipsSection tips={guide.proTips} />

        {/* Navigation */}
        <GuideNavigation guide={guide} />

        {/* Back to Dashboard CTA */}
        <div className="mt-12 text-center">
          <button
            onClick={() => router.push('/home')}
            className="inline-flex items-center gap-2 bg-crwn-gold text-crwn-bg font-semibold py-3 px-8 rounded-full hover:bg-crwn-gold/90 transition-colors press-scale"
          >
            Go to Dashboard
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </main>
    </div>
  );
}
