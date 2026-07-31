'use client';

// The owner-only preview switcher. Renders nothing for anyone else, so it never
// appears on a fan's screen. Sticky, because the whole point is to change the
// persona and watch the page below it change.

import { Eye, X } from 'lucide-react';
import { OptionSelect } from '@/components/ui/OptionSelect';
import { useArtistPreview, OWNER_PERSONA } from '@/hooks/useArtistPreview';

export function PreviewBar() {
  const { isOwner, personas, personaKey, setPersona, previewing } = useArtistPreview();

  if (!isOwner || personas.length === 0) return null;

  const active = personas.find((p) => p.key === personaKey);

  return (
    <div className="sticky top-0 z-40 bg-crwn-surface-solid border-b border-crwn-elevated">
      <div className="px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <Eye className="w-4 h-4 text-crwn-gold" />
            <span className="text-sm font-semibold text-crwn-text">Viewing as</span>
          </div>

          <div className="flex-1 min-w-0 sm:max-w-xs">
            <OptionSelect
              options={personas.map((p) => ({ value: p.key, label: p.label, hint: p.hint }))}
              value={personaKey}
              onChange={setPersona}
              placeholder="Choose who to view as"
            />
          </div>

          {previewing && (
            <button
              type="button"
              onClick={() => setPersona(OWNER_PERSONA)}
              className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-crwn-text-secondary hover:text-crwn-text transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
              Exit preview
            </button>
          )}
        </div>

        <p className="text-xs text-crwn-text-secondary mt-2">
          {previewing
            ? `Locks below are exactly what ${active?.label.toLowerCase() ?? 'this fan'} runs into. Anything still locked here is content they cannot buy their way into from this page.`
            : 'You see everything unlocked because you own it. Pick a fan above to find out what they actually see.'}
        </p>
      </div>
    </div>
  );
}
