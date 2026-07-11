'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { isReservedSlug } from '@/lib/reservedSlugs';

// The CRWN link handle: lowercase letters, numbers and hyphens only, collapsed,
// no leading/trailing hyphen, capped at 30 chars. Used both to auto-fill the
// handle from the artist's name and to sanitize what they type.
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/g, '');
}

export default function WelcomePage() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();

  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  // Once the artist edits the handle by hand, stop auto-syncing it from the name.
  const [handleEdited, setHandleEdited] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'fan' | 'artist'>('artist');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [hasCheckedProfile, setHasCheckedProfile] = useState(false);

  // Send welcome email once
  useEffect(() => {
    if (!user || emailSent) return;
    fetch('/api/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'welcome',
        to: user.email,
        displayName: (user.user_metadata?.display_name || '').split(' ')[0] || user.email?.split('@')[0] || 'there',
      }),
    }).catch(console.error);
    setEmailSent(true);
  }, [user, emailSent]);

  // Pre-fill display name and check if already onboarded
  useEffect(() => {
    if (!profile) return;
    if (profile.onboarding_completed) {
      router.replace('/home');
      return;
    }
    setDisplayName(profile.display_name || '');
    setHandle(slugify(profile.display_name || ''));
    setHasCheckedProfile(true);
  }, [profile, router]);

  // Keep the handle in sync with the name until the artist customizes it.
  const onNameChange = (value: string) => {
    setDisplayName(value);
    if (!handleEdited) setHandle(slugify(value));
  };

  const onHandleChange = (value: string) => {
    setHandleEdited(true);
    setSlugError(null);
    setHandle(slugify(value));
  };

  const handleSubmit = async () => {
    // Phone is optional — a name is all we need to spin up the page/slug. Requiring
    // a phone here was pure friction (and silently disabled the button when empty,
    // which read as "nothing happens"). Collect it later if we want it.
    if (!user || !displayName.trim()) return;

    // For artists, the handle becomes their permanent public link, so validate it
    // up front instead of silently deriving a bad slug from a legal name.
    const slug = role === 'artist' ? slugify(handle || displayName) : '';
    if (role === 'artist') {
      if (!slug) {
        setSlugError('Pick a link with at least one letter or number.');
        return;
      }
      if (isReservedSlug(slug)) {
        setSlugError('That link is reserved. Please choose another.');
        return;
      }
    }

    setSlugError(null);
    setIsSubmitting(true);

    try {
      // Check if artist_profiles row already exists (don't downgrade an existing artist)
      const { data: existing } = await supabase
        .from('artist_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      // If they already have an artist profile, preserve their role
      const effectiveRole = existing ? 'artist' : role;

      // Update profile. Do NOT write `role` here — the profiles RLS policy freezes
      // it (schema-phase2-rls-column-restrictions.sql), so including it makes the
      // ENTIRE update fail for artists (fan->artist is a change), onboarding_completed
      // never lands, and the user bounces back to /welcome. Role is promoted
      // fan->artist server-side by trg_promote_to_artist when the artist_profiles
      // row is inserted below.
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim(),
          phone: phone.trim() || null,
          onboarding_completed: true,
        })
        .eq('id', user.id);

      if (profileError) {
        console.error('Onboarding profile update failed:', profileError);
        alert('Something went wrong saving your info. Please try again or contact support@thecrwn.app');
        setIsSubmitting(false);
        return;
      }

      if (effectiveRole === 'artist') {

        if (!existing) {
          // Determine acquisition source from recruiter code
          const recruiterCode = typeof window !== 'undefined'
            ? localStorage.getItem('crwn_recruiter') : null;
          let acquisitionSource = 'organic';
          if (recruiterCode) {
            // Check if recruiter is a partner
            const { data: recruiter } = await supabase
              .from('recruiters')
              .select('is_partner')
              .eq('referral_code', recruiterCode)
              .eq('is_active', true)
              .maybeSingle();
            acquisitionSource = recruiter?.is_partner ? 'partner' : 'recruiter';
          }

          // Create artist profile with the handle the artist chose above.
          const { data: newArtist, error: insertError } = await supabase
            .from('artist_profiles')
            .insert({
              user_id: user.id,
              slug: slug,
              acquisition_source: acquisitionSource,
              ...(recruiterCode ? { recruited_by: recruiterCode } : {}),
            })
            .select('id')
            .single();

          if (insertError) {
            // 23505 = unique_violation: the handle is already taken. Let them pick
            // another instead of dropping them into setup with no artist row.
            setSlugError(
              insertError.code === '23505'
                ? 'That link is already taken. Please choose another.'
                : 'Something went wrong creating your page. Please try again.'
            );
            setIsSubmitting(false);
            return;
          }

          // Seed default email sequences (fire-and-forget)
          if (newArtist) {
            fetch('/api/sequences/seed-defaults', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ artistId: newArtist.id }),
            }).catch(() => {});
          }

          // Mark referral click as converted (fire-and-forget)
          if (recruiterCode) {
            fetch('/api/admin/track', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ markConverted: { recruiterCode, userId: user.id } }),
            }).catch(() => {});
          }
        }

        // Record onboarding milestone (fire-and-forget)
        fetch('/api/admin/milestone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ milestone: 'onboarding_completed' }),
        }).catch(() => {});
      }
      // Artists go into the focused, gated setup wizard (Profile → Monetize → Music →
      // Shop → share link). They can't use the rest of the app until it's done. Fans
      // go straight home.
      router.push(effectiveRole === 'artist' ? '/setup' : '/home');
    } catch (err) {
      console.error('Onboarding error:', err);
      setIsSubmitting(false);
    }
  };

  if (!user || !hasCheckedProfile) {
    return (
      <div className="min-h-screen bg-crwn-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-crwn-gold" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-crwn-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md page-fade-in">
        <div className="neu-raised p-8 rounded-xl">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-crwn-gold/20 flex items-center justify-center">
            <span className="text-4xl">👑</span>
          </div>
          <h1 className="text-3xl font-bold text-crwn-gold mb-2 text-center">Welcome to CRWN</h1>
          <p className="text-crwn-text-secondary text-center mb-8 text-sm">
            Let us get you set up. This takes less than a minute.
          </p>

          {/* Display Name */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-crwn-text-secondary mb-2">
              {role === 'artist' ? 'Your artist name' : 'What should we call you?'}
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={role === 'artist' ? 'Your artist or stage name' : 'Your name'}
              className="w-full px-4 py-3 bg-crwn-surface border border-crwn-elevated rounded-xl text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold transition-colors"
            />
          </div>

          {/* CRWN link (artists only) — this becomes their permanent public URL,
              so let them see and edit it here instead of silently using their name. */}
          {role === 'artist' && (
            <div className="mb-5">
              <label className="block text-sm font-medium text-crwn-text-secondary mb-2">
                Your CRWN link
              </label>
              <div className="flex items-stretch rounded-xl border border-crwn-elevated bg-crwn-surface focus-within:border-crwn-gold transition-colors overflow-hidden">
                <span className="flex items-center pl-4 pr-1 text-sm text-crwn-text-secondary/70 select-none whitespace-nowrap">
                  thecrwn.app/
                </span>
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => onHandleChange(e.target.value)}
                  placeholder="yourname"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="flex-1 min-w-0 py-3 pr-4 bg-transparent text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none"
                />
              </div>
              {slugError && (
                <p className="mt-2 text-sm text-crwn-error">{slugError}</p>
              )}
              <p className="mt-2 text-xs text-crwn-text-secondary/70">
                This is the link you share. You can change it later in your profile.
              </p>
            </div>
          )}

          {/* Phone */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-crwn-text-secondary mb-2">
              Phone number <span className="text-crwn-text-secondary/60 font-normal">(optional)</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 555-5555"
              className="w-full px-4 py-3 bg-crwn-surface border border-crwn-elevated rounded-xl text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold transition-colors"
            />
          </div>

          {/* Role Selection */}
          <div className="mb-8">
            <label className="block text-sm font-medium text-crwn-text-secondary mb-3">
              I am a...
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('artist')}
                className={`py-4 px-4 rounded-xl text-center transition-all ${
                  role === 'artist'
                    ? 'bg-crwn-gold text-crwn-bg font-semibold'
                    : 'bg-crwn-surface border border-crwn-elevated text-crwn-text-secondary hover:border-crwn-gold/50'
                }`}
              >
                <div className="text-2xl mb-1">🎤</div>
                <div className="text-sm font-medium">Artist</div>
                <div className="text-xs mt-1 opacity-75">I make music</div>
              </button>
              <button
                type="button"
                onClick={() => setRole('fan')}
                className={`py-4 px-4 rounded-xl text-center transition-all ${
                  role === 'fan'
                    ? 'bg-crwn-gold text-crwn-bg font-semibold'
                    : 'bg-crwn-surface border border-crwn-elevated text-crwn-text-secondary hover:border-crwn-gold/50'
                }`}
              >
                <div className="text-2xl mb-1">🎧</div>
                <div className="text-sm font-medium">Supporter</div>
                <div className="text-xs mt-1 opacity-75">I love music</div>
              </button>
            </div>
          </div>

          {/* Artist reassurance: the minimum-viable setup promise (Rise Mode does the rest) */}
          {role === 'artist' && (
            <div className="mb-5 rounded-xl border border-crwn-gold/20 bg-crwn-gold/5 p-4">
              <p className="text-sm text-crwn-text">
                Build your artist-owned fanbase, catalog, membership, and revenue system.
              </p>
              <ul className="mt-2 space-y-1 text-xs text-crwn-text-secondary">
                <li>Initial setup takes only a few minutes.</li>
                <li>You do not need your full catalog yet.</li>
                <li>Every choice can be edited later.</li>
                <li>Rise Mode guides the rest of your infrastructure after you are in.</li>
              </ul>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !displayName.trim()}
            className="w-full bg-crwn-gold text-crwn-bg font-semibold py-3 px-6 rounded-full hover:bg-crwn-gold/90 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Setting up...' : role === 'artist' ? 'Build My CRWN' : 'Get Started'}
          </button>

          <p className="mt-4 text-xs text-crwn-text-secondary text-center">
            Need help? Contact <a href="mailto:support@thecrwn.app" className="text-crwn-gold hover:underline">support@thecrwn.app</a>
          </p>
        </div>
      </div>
    </div>
  );
}
