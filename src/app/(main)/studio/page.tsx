'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import {
  Loader2, Package, Megaphone, Flag, Inbox, Scissors, Sparkles,
  FlaskConical, ArrowRight,
} from 'lucide-react';

interface StudioCard {
  href: string;
  title: string;
  description: string;
  icon: typeof Package;
  /** The AI card gets the purple accent; everything else is gold. */
  accent: 'gold' | 'purple';
}

const STUDIO_CARDS: StudioCard[] = [
  {
    href: '/offers',
    title: 'Offer Builder',
    description: 'Package what fans can buy and how promoters earn',
    icon: Package,
    accent: 'gold',
  },
  {
    href: '/campaign-hub',
    title: 'Campaign Hub',
    description: 'Your promotion engine at a glance',
    icon: Megaphone,
    accent: 'gold',
  },
  {
    href: '/missions',
    title: 'Fan Missions',
    description: 'Turn supporters into a growth team',
    icon: Flag,
    accent: 'gold',
  },
  {
    href: '/missions/suggestions',
    title: 'Fan Suggestions',
    description: 'Review fan-proposed missions',
    icon: Inbox,
    accent: 'gold',
  },
  {
    href: '/clip-controls',
    title: 'Live Clip Controls',
    description: 'Turn VOD moments into clip missions',
    icon: Scissors,
    accent: 'gold',
  },
  {
    href: '/action-plan',
    title: 'Action Plan',
    description: 'Your next best moves, ranked',
    icon: Sparkles,
    accent: 'purple',
  },
  {
    href: '/proof-of-demand',
    title: 'Proof of Demand',
    description: 'Test an idea before you build it',
    icon: FlaskConical,
    accent: 'gold',
  },
];

/**
 * Studio — the artist workspace hub. Pure navigation: one card per connector
 * feature (offers, campaigns, missions, clips, action plan, demand tests) so
 * artists reach everything from the nav without typing URLs. No data writes.
 */
export default function StudioPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  // Derived from the artist_profiles ROW, not profile.role — the useAuth
  // context role lags right after signup (see CLAUDE.md). null = still checking.
  const [isArtist, setIsArtist] = useState<boolean | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    let active = true;
    const supabase = createBrowserSupabaseClient();
    supabase
      .from('artist_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setIsArtist(!!data);
      });
    return () => {
      active = false;
    };
  }, [user, authLoading, router]);

  if (authLoading || isArtist === null) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  if (!isArtist) {
    return (
      <div className="max-w-2xl mx-auto page-fade-in">
        <div className="neu-raised rounded-xl p-8 text-center">
          <Sparkles className="w-12 h-12 text-crwn-gold/30 mx-auto mb-3" />
          <p className="text-crwn-text font-medium">Studio is for artists</p>
          <p className="text-sm text-crwn-text-secondary mt-2 max-w-sm mx-auto">
            Publish your artist page and this becomes your workspace: offers,
            campaigns, missions, and more.
          </p>
          <button
            onClick={() => router.push('/home')}
            className="mt-5 px-5 py-2 rounded-full font-semibold text-sm bg-crwn-gold text-crwn-bg hover:bg-crwn-gold/90 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto page-fade-in">
      <h1 className="text-2xl font-bold text-crwn-text mb-1">Studio</h1>
      <p className="text-sm text-crwn-text-secondary mb-6">Your artist workspace.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 stagger-fade-in">
        {STUDIO_CARDS.map((card) => {
          const Icon = card.icon;
          const purple = card.accent === 'purple';
          return (
            <button
              key={card.href}
              onClick={() => router.push(card.href)}
              className={`neu-raised rounded-xl p-4 text-left hover:opacity-90 transition-opacity ${
                purple ? 'border border-purple-400/25' : ''
              }`}
            >
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center mb-3 ${
                  purple ? 'bg-purple-500/15' : 'bg-crwn-gold/15'
                }`}
              >
                <Icon className={`w-4 h-4 ${purple ? 'text-purple-400' : 'text-crwn-gold'}`} />
              </div>
              <p className="text-sm font-semibold text-crwn-text">{card.title}</p>
              <p className="text-xs text-crwn-text-secondary mt-1">{card.description}</p>
              <p
                className={`text-[11px] font-semibold mt-2 flex items-center gap-1 ${
                  purple ? 'text-purple-400' : 'text-crwn-gold'
                }`}
              >
                Open
                <ArrowRight className="w-3 h-3" />
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
