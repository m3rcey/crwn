'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Crown } from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export default function WelcomePage() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'fan' | 'artist'>('fan');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [hasCheckedProfile, setHasCheckedProfile] = useState(false);
  const [showFoundingModal, setShowFoundingModal] = useState(false);
  const [foundingNumber, setFoundingNumber] = useState(0);
  const [trialEndDate, setTrialEndDate] = useState('');

  // Send welcome email once
  useEffect(() => {
    if (!user || emailSent) return;
    fetch('/api/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'welcome',
        to: user.email,
        displayName: (user.user_metadata?.full_name || user.user_metadata?.display_name || '').split(' ')[0] || user.email?.split('@')[0] || 'there',
      }),
    }).catch(console.error);
    setEmailSent(true);
  }, [user, emailSent]);

  // Pre-fill display name and check if already onboarded
  useEffect(() => {
    if (!profile) return;
    if (profile.phone) {
      // Already onboarded, go home
      router.replace('/home');
      return;
    }
    setDisplayName(profile.display_name || profile.full_name || '');
    setHasCheckedProfile(true);
  }, [profile, router]);

  const handleSubmit = async () => {
    if (!user || !displayName.trim() || !phone.trim()) return;
    setIsSubmitting(true);

    try {
      // Update profile
      await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim(),
          phone: phone.trim(),
          role: role,
        })
        .eq('id', user.id);

      if (role === 'artist') {
        // Check if artist_profiles row exists
        const { data: existing } = await supabase
          .from('artist_profiles')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!existing) {
          // Create artist profile with slug from display name
          const slug = displayName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 30);
          await supabase
            .from('artist_profiles')
            .insert({
              user_id: user.id,
              slug: slug,
            });
        }

        // Check founding artist availability and show modal
        const countRes = await fetch('/api/founding-artist');
        const countData = await countRes.json();
        if (countData.spotsLeft > 0) {
          const date = new Date();
          date.setMonth(date.getMonth() + 1);
          setFoundingNumber((countData.foundingArtists || 0) + 1);
          setTrialEndDate(date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
          setShowFoundingModal(true);
          setIsSubmitting(false);
          return;
        }
      }
      // Redirect to home (tour will fire based on role)
      router.push('/home');
    } catch (err) {
      console.error('Onboarding error:', err);
      setIsSubmitting(false);
    }
  };

  const handleFoundingContinue = async () => {
    setIsSubmitting(true);
    try {
      const faRes = await fetch('/api/founding-artist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user!.id }),
      });
      const faData = await faRes.json();
      if (faData.url) {
        window.location.href = faData.url;
        return;
      }
    } catch (err) {
      console.error('Founding checkout error:', err);
    }
    router.push('/home');
  };

  const handleFoundingSkip = () => {
    setShowFoundingModal(false);
    router.push('/home');
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

      {/* Founding Artist Modal */}
      {showFoundingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative neu-modal p-8 max-w-md w-full text-center" style={{ animation: 'fadeInUp 0.3s ease-out' }}>
            <div className="w-16 h-16 rounded-full bg-crwn-gold/10 flex items-center justify-center mx-auto mb-4">
              <Crown className="w-8 h-8 text-crwn-gold" />
            </div>
            <h2 className="text-2xl font-bold text-crwn-text mb-2">
              {"You\u2019re Founding Artist #"}{foundingNumber}!
            </h2>
            <div className="space-y-3 text-left bg-[#1a1a1a] rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <span className="text-crwn-gold text-lg">\u2713</span>
                <p className="text-crwn-text-secondary text-sm">1 month of Pro completely free</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-crwn-gold text-lg">\u2713</span>
                <p className="text-crwn-text-secondary text-sm">5% platform fee for your entire first year (instead of 8%)</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-crwn-gold text-lg">\u2713</span>
                <p className="text-crwn-text-secondary text-sm">Permanent Founding Artist badge on your profile</p>
              </div>
            </div>
            <p className="text-crwn-text-dim text-xs mb-6">
              You won't be charged until {trialEndDate}. Just need a card on file.
            </p>
            <button
              onClick={handleFoundingContinue}
              disabled={isSubmitting}
              className="w-full neu-button-accent py-3 text-crwn-bg font-semibold rounded-full press-scale mb-3"
            >
              {isSubmitting ? 'Loading...' : 'Continue to Payment'}
            </button>
            <button
              onClick={handleFoundingSkip}
              className="text-crwn-text-dim text-sm hover:text-crwn-text-secondary transition-colors"
            >
              Skip for now
            </button>
          </div>
        </div>
      )}

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
              What should we call you?
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name or artist name"
              className="w-full px-4 py-3 bg-crwn-surface border border-crwn-elevated rounded-xl text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold transition-colors"
            />
          </div>

          {/* Phone */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-crwn-text-secondary mb-2">
              Phone number
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

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !displayName.trim() || !phone.trim()}
            className="w-full bg-crwn-gold text-crwn-bg font-semibold py-3 px-6 rounded-full hover:bg-crwn-gold/90 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Setting up...' : 'Get Started'}
          </button>

          <p className="mt-4 text-xs text-crwn-text-secondary text-center">
            Need help? Contact <a href="mailto:support@thecrwn.app" className="text-crwn-gold hover:underline">support@thecrwn.app</a>
          </p>
        </div>
      </div>
    </div>
  );
}
