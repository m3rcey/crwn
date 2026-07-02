'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

/**
 * One-thing-per-screen: just the tagline. Autosaves (debounced) as they type and
 * on blur, writing artist_profiles.tagline directly, so the wizard's Continue
 * unlocks from live DB state — no separate Save button.
 */
export function OnboardingTaglineStep({
  initialValue,
  onSaved,
}: {
  initialValue: string;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const supabase = createBrowserSupabaseClient();
  const [value, setValue] = useState(initialValue);
  const savedRef = useRef(initialValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = async (next: string) => {
    const trimmed = next.trim();
    if (!user || trimmed === savedRef.current.trim()) return;
    savedRef.current = trimmed;
    const { error } = await supabase
      .from('artist_profiles')
      .update({ tagline: trimmed })
      .eq('user_id', user.id);
    if (error) {
      showToast('Could not save your tagline. Please try again.', 'error');
      return;
    }
    onSaved();
  };

  // Debounced autosave while typing.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(value), 600);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => save(value)}
        autoFocus
        maxLength={100}
        placeholder="e.g. Atlanta soul, one hook at a time"
        className="w-full bg-crwn-surface border border-crwn-elevated rounded-xl px-4 py-4 text-lg text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold"
      />
      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-crwn-text-secondary">
          One line fans read first. Keep it short and specific.
        </p>
        <span className="text-xs text-crwn-text-secondary/60">{value.length}/100</span>
      </div>
    </div>
  );
}
