'use client';

// Level 2 (Build Your Vault): catalog-shape planner. Asks the artist to identify
// their catalog shape with the shared OptionSelect dropdown, then shows an adapted
// recommended sequence. This is GUIDANCE only: it stores the chosen shape as a UI
// preference (localStorage), never authoritative state, and every step deep-links
// to the EXISTING music/album/playlist surfaces. No upload form is duplicated.

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { OptionSelect, type SelectOption } from '@/components/ui/OptionSelect';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

type SubTab = 'tracks' | 'albums' | 'playlists';
type Dest = SubTab | 'preview';

interface Step {
  text: string;
  goTo?: Dest;
}

const SHAPE_OPTIONS: SelectOption[] = [
  { value: 'one_two_singles', label: 'One or two singles', hint: 'Just getting started', icon: '🎵' },
  { value: 'several_singles', label: 'Several singles', hint: 'A handful of released songs', icon: '🎶' },
  { value: 'one_album', label: 'One album', hint: 'A single project to organize', icon: '💿' },
  { value: 'multiple_albums', label: 'Multiple albums', hint: 'A deeper back catalog', icon: '📀' },
  { value: 'released_unreleased', label: 'Released and unreleased catalog', hint: 'A full vault to open up', icon: '🔐' },
  { value: 'needs_help', label: 'I need help organizing', hint: 'Not sure where to start', icon: '🤝' },
];

// Adapted recommended sequences. The full 8-step default is used for the deepest
// catalogs; lighter shapes get a shorter, right-sized plan.
const DEFAULT_SEQUENCE: Step[] = [
  { text: 'Add your strongest released song', goTo: 'tracks' },
  { text: 'Add your newest album', goTo: 'albums' },
  { text: 'Add another important release', goTo: 'tracks' },
  { text: 'Add the rest of your catalog over time', goTo: 'tracks' },
  { text: 'Add an exclusive or unreleased track for supporters', goTo: 'tracks' },
  { text: 'Choose which tracks are free for discovery', goTo: 'tracks' },
  { text: 'Set access and release timing on each track', goTo: 'tracks' },
  { text: 'Preview your catalog as a fan', goTo: 'preview' },
];

const SEQUENCES: Record<string, Step[]> = {
  one_two_singles: [
    { text: 'Upload your song', goTo: 'tracks' },
    { text: 'Mark one track free so new fans can discover you', goTo: 'tracks' },
    { text: 'Set who gets the rest (free or supporters)', goTo: 'tracks' },
    { text: 'Preview your catalog as a fan', goTo: 'preview' },
  ],
  several_singles: [
    { text: 'Add your strongest song first', goTo: 'tracks' },
    { text: 'Add your newest song', goTo: 'tracks' },
    { text: 'Add the rest over time', goTo: 'tracks' },
    { text: 'Pick one free discovery track', goTo: 'tracks' },
    { text: 'Preview your catalog as a fan', goTo: 'preview' },
  ],
  one_album: [
    { text: 'Create the album', goTo: 'albums' },
    { text: 'Add the album tracks', goTo: 'tracks' },
    { text: 'Set access and release timing', goTo: 'tracks' },
    { text: 'Add a single as free discovery', goTo: 'tracks' },
    { text: 'Preview your catalog as a fan', goTo: 'preview' },
  ],
  multiple_albums: [
    { text: 'Add your newest album first', goTo: 'albums' },
    { text: 'Add your key back catalog', goTo: 'albums' },
    { text: 'Organize tracks into albums', goTo: 'albums' },
    { text: 'Add an exclusive or unreleased track', goTo: 'tracks' },
    { text: 'Choose your free discovery content', goTo: 'tracks' },
    { text: 'Preview your catalog as a fan', goTo: 'preview' },
  ],
  released_unreleased: DEFAULT_SEQUENCE,
  needs_help: DEFAULT_SEQUENCE,
};

const STORAGE_KEY = 'crwn_vault_shape';

export function VaultPlanner({ onGoTo }: { onGoTo?: (sub: SubTab) => void }) {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [open, setOpen] = useState(true);
  const [shape, setShape] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);

  // Restore the guidance preference (per browser). Not authoritative state.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setShape(saved);
        setOpen(false); // returning artists start collapsed, choice preserved
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    supabase
      .from('artist_profiles')
      .select('slug')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setSlug(data?.slug ?? null);
      });
    return () => {
      active = false;
    };
  }, [user, supabase]);

  const choose = (value: string) => {
    setShape(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* ignore */
    }
  };

  const steps = shape ? SEQUENCES[shape] ?? DEFAULT_SEQUENCE : [];

  const renderStepAction = (step: Step) => {
    if (step.goTo === 'preview') {
      return slug ? (
        <a
          href={`/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-crwn-gold hover:underline shrink-0"
        >
          Preview <ExternalLink className="w-3.5 h-3.5" />
        </a>
      ) : null;
    }
    if (step.goTo && onGoTo) {
      return (
        <button
          onClick={() => onGoTo(step.goTo as SubTab)}
          className="text-sm text-crwn-gold hover:underline shrink-0"
        >
          Go
        </button>
      );
    }
    return null;
  };

  return (
    <div className="bg-crwn-surface border border-crwn-gold/30 rounded-xl overflow-hidden mb-6">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between p-5 text-left">
        <div>
          <h3 className="text-lg font-semibold text-crwn-text">Plan your vault</h3>
          <p className="text-sm text-crwn-text-secondary mt-0.5">
            {shape
              ? `Your plan: ${SHAPE_OPTIONS.find((o) => o.value === shape)?.label}`
              : 'Tell us your catalog shape and we will tailor the steps.'}
          </p>
        </div>
        {open ? (
          <ChevronUp className="w-5 h-5 text-crwn-gold shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-crwn-gold shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-crwn-text-secondary mb-2">
              What does your catalog look like?
            </label>
            <OptionSelect
              options={SHAPE_OPTIONS}
              value={shape}
              onChange={choose}
              placeholder="Choose your catalog shape"
            />
          </div>

          {shape && (
            <div>
              <p className="text-sm font-medium text-crwn-text-secondary mb-2">Your recommended next steps</p>
              <ol className="space-y-2">
                {steps.map((step, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 bg-crwn-bg border border-crwn-elevated rounded-lg px-3 py-2.5"
                  >
                    <span className="flex items-start gap-2 min-w-0">
                      <span className="text-crwn-gold font-semibold text-sm shrink-0">{i + 1}.</span>
                      <span className="text-sm text-crwn-text">{step.text}</span>
                    </span>
                    {renderStepAction(step)}
                  </li>
                ))}
              </ol>
              <p className="text-xs text-crwn-text-secondary mt-3">
                Add what you can now. You can always add the rest of your catalog over time.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
