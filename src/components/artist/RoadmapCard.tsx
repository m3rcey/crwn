'use client';

// RoadmapCard — the personalized artist roadmap on Rise Mode (Launch Wizard
// Stage 6). Answers "what do I do next?" with the current stage and the ONE
// next milestone; the full five stages expand on demand. Everything shown is
// derived server-side (/api/artist/roadmap) from the same checks the Quest
// Engine runs, so this card and the quests can never tell different stories.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarCheck, Check, ChevronDown, Map } from 'lucide-react';
import type { ArtistRoadmap } from '@/lib/artistRoadmap';

interface LaunchExtras {
  upcomingPromises: { title: string; dueAt: string }[];
  stats: { members: number; paidMembers: number; mrrCents: number; goalMonthlyCents: number };
}

export function RoadmapCard() {
  const [roadmap, setRoadmap] = useState<ArtistRoadmap | null>(null);
  const [extras, setExtras] = useState<LaunchExtras | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/artist/roadmap')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!active || !j?.roadmap) return;
        setRoadmap(j.roadmap);
        if (j.stats) setExtras({ upcomingPromises: j.upcomingPromises ?? [], stats: j.stats });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Graceful no-op while loading or for non-artists: Rise Mode renders as before.
  if (!roadmap) return null;

  const stage = roadmap.stages[roadmap.currentStageIndex];
  const next = roadmap.nextStep;

  return (
    <div className="neu-raised rounded-2xl p-5 mb-6" data-tour="roadmap">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Map className="w-4 h-4 text-crwn-gold shrink-0" />
          <p className="text-[11px] uppercase tracking-wide text-crwn-text-secondary truncate">
            Your roadmap · Stage {roadmap.currentStageIndex + 1} of {roadmap.stages.length}
          </p>
        </div>
        <span className="text-xs text-crwn-text-secondary shrink-0">{roadmap.progressPercent}%</span>
      </div>

      <div className="h-1.5 rounded-full bg-crwn-elevated overflow-hidden mt-2 mb-4">
        <div
          className="h-full bg-crwn-gold rounded-full transition-all duration-500"
          style={{ width: `${roadmap.progressPercent}%` }}
        />
      </div>

      <h3 className="font-bold text-crwn-text">{stage?.title}</h3>
      <p className="text-xs text-crwn-text-secondary mt-0.5">{stage?.goal}</p>

      {next ? (
        <div className="mt-4 border border-crwn-gold/40 bg-crwn-gold/5 rounded-xl p-4">
          <p className="text-[11px] uppercase tracking-wide text-crwn-text-secondary mb-1">Next milestone</p>
          <p className="font-semibold text-crwn-text">
            {next.label}
            {next.target > 1 && (
              <span className="text-crwn-text-secondary font-normal">
                {' '}
                ({Math.min(next.current, next.target)}/{next.target})
              </span>
            )}
          </p>
          <p className="text-xs text-crwn-text-secondary mt-1">{next.detail}</p>
          <Link
            prefetch
            href={next.href}
            className="inline-flex items-center gap-2 mt-3 bg-crwn-gold text-crwn-bg text-sm font-semibold px-5 py-2 rounded-full hover:bg-crwn-gold/90 transition-colors"
          >
            Do it now
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="mt-4 border border-crwn-gold/40 bg-crwn-gold/5 rounded-xl p-4">
          <p className="font-semibold text-crwn-text">Every stage is complete.</p>
          <p className="text-xs text-crwn-text-secondary mt-1">
            The system is built and delivering. Keep your promises and keep inviting.
          </p>
        </div>
      )}

      {/* Launch command: the real numbers, never projections dressed as results. */}
      {extras && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { label: 'Members', value: extras.stats.members.toLocaleString() },
            { label: 'Paying', value: extras.stats.paidMembers.toLocaleString() },
            {
              label: 'Monthly',
              value: `$${Math.round(extras.stats.mrrCents / 100).toLocaleString()}`,
              sub: `of $${Math.round(extras.stats.goalMonthlyCents / 100).toLocaleString()} goal`,
            },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-crwn-elevated px-3 py-2 text-center">
              <p className="text-base font-bold text-crwn-text">{s.value}</p>
              <p className="text-[10px] uppercase tracking-wide text-crwn-text-secondary">{s.label}</p>
              {'sub' in s && s.sub && <p className="text-[10px] text-crwn-text-secondary">{s.sub}</p>}
            </div>
          ))}
        </div>
      )}

      {extras && extras.upcomingPromises.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] uppercase tracking-wide text-crwn-text-secondary mb-1.5">Upcoming promises</p>
          <ul className="space-y-1">
            {extras.upcomingPromises.map((p, i) => (
              <li key={`${p.title}:${i}`} className="flex items-center gap-2 text-xs">
                <CalendarCheck className="w-3.5 h-3.5 text-crwn-gold shrink-0" />
                <Link prefetch href="/studio/promise" className="text-crwn-text hover:text-crwn-gold transition-colors truncate">
                  {p.title}
                </Link>
                <span className="text-crwn-text-secondary shrink-0 ml-auto">
                  {new Date(p.dueAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="mt-3 inline-flex items-center gap-1 text-xs text-crwn-gold hover:underline"
      >
        {expanded ? 'Hide the full roadmap' : 'See the full roadmap'}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {roadmap.stages.map((s, i) => (
            <div
              key={s.key}
              className={`rounded-xl border p-3 ${
                i === roadmap.currentStageIndex ? 'border-crwn-gold/40' : 'border-crwn-elevated'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className={`text-sm font-semibold ${s.done ? 'text-crwn-text-secondary' : 'text-crwn-text'}`}>
                  {i + 1}. {s.title}
                </p>
                <span className="text-[11px] text-crwn-text-secondary shrink-0">
                  {s.doneCount}/{s.total}
                </span>
              </div>
              <ul className="mt-2 space-y-1.5">
                {s.steps.map((step) => (
                  <li key={step.key} className="flex items-start gap-2 text-xs">
                    <span
                      className={`mt-0.5 w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                        step.done ? 'bg-crwn-gold border-crwn-gold text-crwn-bg' : 'border-crwn-elevated'
                      }`}
                    >
                      {step.done && <Check className="w-2.5 h-2.5" />}
                    </span>
                    {step.done ? (
                      <span className="text-crwn-text-secondary line-through decoration-crwn-text-secondary/40">
                        {step.label}
                      </span>
                    ) : (
                      <Link prefetch href={step.href} className="text-crwn-text hover:text-crwn-gold transition-colors">
                        {step.label}
                        {step.target > 1 && (
                          <span className="text-crwn-text-secondary"> ({Math.min(step.current, step.target)}/{step.target})</span>
                        )}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
