'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { liveQuestTemplates } from '@/lib/quests/templates';
import { Radio, Loader2, Check } from 'lucide-react';

// Rise Mode Live Quest launcher. The artist starts a Live Quest, then goes live to
// bring fans in; the connected fan quests are assigned to viewers automatically.
export function LiveQuestLauncher() {
  const router = useRouter();
  const templates = liveQuestTemplates();
  const [starting, setStarting] = useState<string | null>(null);
  const [started, setStarted] = useState<string | null>(null);

  async function start(key: string) {
    setStarting(key);
    try {
      const res = await fetch('/api/quests/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateKey: key }),
      });
      if (res.ok) setStarted(key);
    } finally {
      setStarting(null);
    }
  }

  return (
    <div className="rounded-2xl border border-[#2A2A2A] bg-[#1A1A1A] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Radio className="w-4 h-4 text-crwn-gold" />
        <h3 className="text-sm font-semibold text-crwn-text">Live Quest Mode</h3>
      </div>
      <p className="text-xs text-crwn-text-secondary mb-3">
        Stream yourself completing a quest with fans participating live.
      </p>
      <div className="space-y-2">
        {templates.map((t) => (
          <div key={t.key} className="flex items-center justify-between gap-2">
            <span className="text-sm text-crwn-text truncate">{t.title}</span>
            {started === t.key ? (
              <button
                onClick={() => router.push('/profile/artist?tab=livestreams')}
                className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-emerald-400"
              >
                <Check className="w-3.5 h-3.5" /> Go live
              </button>
            ) : (
              <button
                onClick={() => start(t.key)}
                disabled={!!starting}
                className="shrink-0 text-xs font-semibold text-crwn-gold hover:underline disabled:opacity-50 inline-flex items-center gap-1"
              >
                {starting === t.key && <Loader2 className="w-3 h-3 animate-spin" />}
                Start
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
