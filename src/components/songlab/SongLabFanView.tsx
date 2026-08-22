'use client';

// The fan-facing Song Lab. Mobile-first: one column, big tap targets, the open vote is
// the visually dominant thing on screen. Aggregate counts only; a fan sees their OWN
// vote and nobody else's. Voting eligibility comes back from the server per decision;
// the buttons here are presentation, never the authority.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Check, Lock, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { RECOGNITION_DISCLAIMER } from '@/lib/songLab/core';

interface LabDecision {
  id: string;
  projectId: string;
  stageLabel: string;
  question: string;
  options: Array<{ id: string; label: string }>;
  status: 'scheduled' | 'open' | 'closed';
  opensAt: string | null;
  closesAt: string | null;
  winningOptionId: string | null;
  totalVotes: number;
  counts: Record<string, number> | null;
  myVote: string | null;
  eligible: boolean;
}

interface LabProject {
  id: string;
  title: string;
  artwork_url: string | null;
  status: 'active' | 'completed';
  next_note: string | null;
}

interface LabPayload {
  projects: LabProject[];
  decisions: LabDecision[];
  participantCount: number;
  freeTierId: string | null;
  viewer: { signedIn: boolean; isMember: boolean; participatedCount: number };
}

export function SongLabFanView({ artistSlug, artistName }: { artistSlug: string; artistName: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();
  const [payload, setPayload] = useState<LabPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [votingOn, setVotingOn] = useState<string | null>(null);
  const [justVoted, setJustVoted] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const highlightId = searchParams.get('d');
  const scrolled = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/song-lab/public?artist=${encodeURIComponent(artistSlug)}`);
      if (!res.ok) {
        setError('This lab is not available right now.');
        return;
      }
      setPayload(await res.json());
    } catch {
      setError('Could not load the lab. Pull to refresh.');
    } finally {
      setLoading(false);
    }
  }, [artistSlug]);

  useEffect(() => { load(); }, [load]);

  // Deep link (?d=<decisionId>) scrolls the named decision into view once.
  useEffect(() => {
    if (!payload || !highlightId || scrolled.current) return;
    scrolled.current = true;
    setTimeout(() => {
      document.getElementById(`decision-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  }, [payload, highlightId]);

  const vote = async (decision: LabDecision, optionId: string) => {
    if (votingOn) return;
    if (!user) {
      router.push(`/signup?next=${encodeURIComponent(`/${artistSlug}/lab?d=${decision.id}`)}`);
      return;
    }
    setVotingOn(decision.id);
    setError(null);
    try {
      const res = await fetch('/api/song-lab/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisionId: decision.id, optionId }),
      });
      const data = await res.json();
      if (res.ok) {
        setJustVoted(decision.id);
        await load();
      } else {
        setError(data.error || 'Could not record your vote.');
      }
    } catch {
      setError('Could not record your vote.');
    } finally {
      setVotingOn(null);
    }
  };

  const joinFree = async () => {
    if (!payload?.freeTierId || joining) return;
    if (!user) {
      router.push(`/signup?next=${encodeURIComponent(`/${artistSlug}/lab`)}`);
      return;
    }
    setJoining(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/free-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tierId: payload.freeTierId }),
      });
      if (res.ok || res.status === 409) await load();
      else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Could not join. Please try again.');
      }
    } catch {
      setError('Could not join. Please try again.');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-crwn-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }
  if (!payload) {
    return (
      <div className="min-h-screen bg-crwn-bg flex items-center justify-center px-6 text-center">
        <p className="text-crwn-text-secondary">{error || 'This lab is not available right now.'}</p>
      </div>
    );
  }

  const decisionsByProject = new Map<string, LabDecision[]>();
  for (const d of payload.decisions) {
    if (!decisionsByProject.has(d.projectId)) decisionsByProject.set(d.projectId, []);
    decisionsByProject.get(d.projectId)!.push(d);
  }

  const projects = payload.projects;
  const viewer = payload.viewer;

  return (
    <div className="min-h-screen bg-crwn-bg px-4 py-8">
      <div className="max-w-md mx-auto page-fade-in">
        <header className="text-center mb-8">
          <p className="text-xs font-semibold tracking-widest uppercase text-crwn-gold mb-2">{artistName}</p>
          <h1 className="text-3xl font-bold text-crwn-text uppercase">Song Lab</h1>
          <p className="text-sm text-crwn-text-secondary mt-2">
            {artistName} builds songs with the people who show up. Watch every call, then help make them.
          </p>
          {payload.participantCount > 0 ? (
            <p className="text-xs text-crwn-gold mt-2">
              {payload.participantCount} {payload.participantCount === 1 ? 'Day One has' : 'Day Ones have'} voted so far
            </p>
          ) : null}
          {viewer.participatedCount > 0 ? (
            <div className="mt-3 inline-block rounded-full border border-crwn-gold/40 bg-crwn-gold/10 px-4 py-1.5">
              <p className="text-xs text-crwn-gold font-semibold">
                🌅 Day One A&R · you have shaped {viewer.participatedCount} {viewer.participatedCount === 1 ? 'decision' : 'decisions'}
              </p>
            </div>
          ) : null}
        </header>

        {error ? <p className="text-sm text-red-400 text-center mb-4">{error}</p> : null}

        {projects.length === 0 ? (
          <p className="text-center text-crwn-text-secondary">Nothing in the lab yet. Check back soon.</p>
        ) : null}

        {projects.map((project) => {
          const decisions = decisionsByProject.get(project.id) || [];
          const closed = decisions.filter((d) => d.status === 'closed');
          const openOnes = decisions.filter((d) => d.status === 'open');
          const scheduled = decisions.filter((d) => d.status === 'scheduled');

          // Centered throughout, matching the ballot and confirmation screens the fan just
          // came from. Rows that pair a label with a value center as a pair rather than
          // pushing to opposite edges.
          return (
            <section key={project.id} className="mb-10 rounded-2xl bg-crwn-surface p-5 text-center">
              <div className="flex items-center justify-center gap-4 mb-4">
                {project.artwork_url ? (
                  <Image src={project.artwork_url} alt="" width={56} height={56} className="rounded-xl object-cover" />
                ) : null}
                <div>
                  <h2 className="text-xl font-bold text-crwn-text uppercase">{project.title}</h2>
                  {project.status === 'completed' ? (
                    <p className="text-xs text-crwn-gold">Finished. Built with the Day Ones.</p>
                  ) : null}
                </div>
              </div>

              {/* Completed stages */}
              {closed.map((d) => {
                const winner = d.options.find((o) => o.id === d.winningOptionId);
                return (
                  <div key={d.id} id={`decision-${d.id}`} className="py-3 border-t border-white/5">
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      <p className="text-sm text-crwn-text-secondary">{d.stageLabel}</p>
                      <p className="text-sm text-crwn-text flex items-center gap-1.5">
                        <Check className="w-4 h-4 text-crwn-gold" />
                        {winner ? `${winner.label} won` : 'Closed'}
                        {d.myVote && d.winningOptionId === d.myVote ? (
                          <span className="text-xs text-crwn-gold ml-1">(your pick)</span>
                        ) : null}
                      </p>
                    </div>
                    {d.counts ? (
                      <div className="mt-2 space-y-1">
                        {d.options.map((o) => {
                          const c = d.counts?.[o.id] ?? 0;
                          const pctWidth = d.totalVotes > 0 ? Math.round((c / d.totalVotes) * 100) : 0;
                          return (
                            <div key={o.id} className="flex items-center gap-2 text-xs text-crwn-text-secondary">
                              <span className="w-24 truncate">{o.label}</span>
                              <div className="flex-1 h-1.5 rounded bg-white/5 overflow-hidden">
                                <div className="h-full bg-crwn-gold/60" style={{ width: `${pctWidth}%` }} />
                              </div>
                              <span className="w-6 text-right">{c}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {/* The open vote: the dominant element */}
              {openOnes.map((d) => (
                <div key={d.id} id={`decision-${d.id}`} className={`mt-4 rounded-xl p-4 ${highlightId === d.id ? 'ring-2 ring-crwn-gold' : 'ring-1 ring-crwn-gold/30'}`}>
                  <p className="text-xs font-semibold tracking-widest uppercase text-crwn-gold mb-1">
                    {d.stageLabel} · vote open
                  </p>
                  <h3 className="text-lg font-bold text-crwn-text mb-3">{d.question}</h3>

                  {justVoted === d.id && d.myVote ? (
                    <div className="mb-3 rounded-lg bg-crwn-gold/10 border border-crwn-gold/40 px-3 py-2 text-center">
                      <p className="text-sm font-bold text-crwn-gold uppercase">You helped build {project.title}</p>
                      <p className="text-xs text-crwn-text-secondary mt-0.5">Your vote is in. You can change it while the vote is open.</p>
                    </div>
                  ) : null}

                  {d.eligible || !viewer.signedIn ? (
                    <div className="space-y-2">
                      {d.options.map((o) => {
                        const selected = d.myVote === o.id;
                        return (
                          <button
                            key={o.id}
                            onClick={() => vote(d, o.id)}
                            disabled={votingOn === d.id}
                            className={`w-full py-3.5 px-4 rounded-xl text-center font-semibold transition active:scale-[0.98] disabled:opacity-60 ${
                              selected
                                ? 'bg-crwn-gold text-crwn-bg'
                                : 'bg-crwn-surface-solid text-crwn-text ring-1 ring-white/10 hover:ring-crwn-gold/50'
                            }`}
                          >
                            <span className="uppercase mr-2 text-sm opacity-70">{o.id}</span>
                            {o.label}
                            {selected ? <Check className="w-4 h-4 inline ml-2" /> : null}
                          </button>
                        );
                      })}
                      {d.totalVotes > 0 ? (
                        <p className="text-xs text-crwn-text-secondary text-center pt-1">
                          {d.totalVotes} {d.totalVotes === 1 ? 'vote' : 'votes'} so far. Results revealed when it closes.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-xl bg-crwn-surface-solid p-4 text-center">
                      <Lock className="w-5 h-5 text-crwn-gold mx-auto mb-2" />
                      <p className="text-sm text-crwn-text mb-3">
                        This vote belongs to {artistName}&apos;s members. Miss it and the record gets made without you.
                      </p>
                      {payload.freeTierId ? (
                        <button
                          onClick={joinFree}
                          disabled={joining || authLoading}
                          className="w-full py-3 rounded-full bg-crwn-gold text-crwn-bg font-bold hover:bg-crwn-gold/90 transition disabled:opacity-60"
                        >
                          {joining ? 'Joining...' : 'Join free and vote'}
                        </button>
                      ) : (
                        <a href={`/${artistSlug}`} className="text-sm text-crwn-gold hover:underline">
                          See membership options
                        </a>
                      )}
                    </div>
                  )}
                  {d.closesAt ? (
                    <p className="text-xs text-crwn-text-secondary text-center mt-3">
                      Closes {new Date(d.closesAt).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                    </p>
                  ) : null}
                </div>
              ))}

              {/* What's next */}
              {scheduled.map((d) => (
                <div key={d.id} id={`decision-${d.id}`} className="py-3 border-t border-white/5 flex items-center justify-center gap-2 flex-wrap">
                  <p className="text-sm text-crwn-text-secondary">{d.stageLabel}</p>
                  <p className="text-xs text-crwn-text-secondary">
                    {d.opensAt ? `Opens ${new Date(d.opensAt).toLocaleDateString(undefined, { weekday: 'long' })}` : 'Coming up'}
                  </p>
                </div>
              ))}
              {project.next_note ? (
                <p className="text-xs text-crwn-gold mt-3 text-center">{project.next_note}</p>
              ) : null}
            </section>
          );
        })}

        <footer className="mt-8 mb-4">
          <p className="text-[11px] leading-relaxed text-crwn-text-secondary/70 text-center">{RECOGNITION_DISCLAIMER}</p>
        </footer>
      </div>
    </div>
  );
}
