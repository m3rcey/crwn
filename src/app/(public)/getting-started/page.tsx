'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Crown, User, Music, CreditCard, BarChart3, Store, Users, Share2, DollarSign, Heart, ListMusic, Search, MessageCircle, Headphones, ChevronRight } from 'lucide-react';

const artistSteps = [
  { icon: User, title: 'Set up your profile', description: 'Add your artist name, bio, profile photo, and banner image. This is the first thing fans see.' },
  { icon: User, title: 'Add location and genres', description: 'Set your city, state, and genres so we can match you with sync licensing opportunities near you.' },
  { icon: CreditCard, title: 'Connect Stripe', description: 'Link your Stripe account to start accepting payments. Takes about 2 minutes.' },
  { icon: Crown, title: 'Create subscription tiers', description: 'Set up 2 to 3 fan tiers with different price points and benefits. Annual subscriptions give fans 25% off.' },
  { icon: Music, title: 'Browse sync opportunities', description: 'Real sync licensing events and briefs updated regularly. Your Pro access gives you the full list.' },
  { icon: DollarSign, title: 'Understand your payouts', description: 'Earnings accumulate from subscriptions and sales. Free automatic payouts every Monday, or instant cashout for $2.' },
  { icon: Share2, title: 'Set up fan referrals', description: 'Set the commission rate fans earn when they refer new subscribers. Higher rates motivate more sharing.' },
  { icon: BarChart3, title: 'Check your analytics', description: 'Revenue, subscribers, plays, and top fans all in real time. This is your command center.' },
  { icon: Music, title: 'Upload your music', description: 'Add tracks and set each one as free or exclusive to specific tiers. Keep 2 to 3 tracks free for discovery.' },
  { icon: Store, title: 'Open your shop', description: 'Sell digital products, experiences, and 1-on-1 bookings. Set quantity limits and expiration dates for urgency.' },
  { icon: Users, title: 'Preview your page', description: 'See exactly what fans see when they visit. Make sure everything looks right before sharing.' },
  { icon: MessageCircle, title: 'Post to your community', description: 'Share updates, behind the scenes content, photos, and videos. Gate posts to specific tiers for exclusivity.' },
  { icon: Share2, title: 'Share your page', description: 'Your page is live at thecrwn.app/yourname. Share it everywhere and start building your fan base.' },
];

const fanSteps = [
  { icon: Search, title: 'Explore and discover', description: 'Browse the catalog and search for artists. Every artist on CRWN is independent and keeps the majority of their earnings.' },
  { icon: Crown, title: 'Subscribe to artists', description: 'Pick a tier and support your favorite artists directly. Annual subscriptions save you 25%.' },
  { icon: Heart, title: 'Build your library', description: 'Like songs to save them, create playlists, and organize your collection as you discover new music.' },
  { icon: Store, title: 'Shop for exclusives', description: 'Buy digital products like beat packs, or book experiences like 1-on-1 video calls with artists.' },
  { icon: Headphones, title: 'Listen anywhere', description: 'Music keeps playing as you browse the app. Add CRWN to your home screen for the best experience.' },
  { icon: MessageCircle, title: 'Join communities', description: 'Comment on posts, engage with artists and other fans. Subscribers get access to exclusive content.' },
  { icon: Share2, title: 'Share and earn', description: 'Share an artist page with friends. When someone subscribes through your link, you earn a commission.' },
  { icon: DollarSign, title: 'Cash out your earnings', description: 'Once your referral balance reaches $25, connect Stripe and cash out. No fees.' },
];

export default function GettingStartedPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const role = searchParams.get('role') || 'fan';
  const steps = role === 'artist' ? artistSteps : fanSteps;
  const isArtist = role === 'artist';

  return (
    <div className="min-h-screen bg-crwn-bg flex items-center justify-center p-4">
      <div className="w-full max-w-lg page-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-crwn-gold mb-2">
            {isArtist ? 'Your Artist Roadmap' : 'Your CRWN Guide'}
          </h1>
          <p className="text-crwn-text-secondary text-sm">
            {isArtist
              ? 'Follow these steps to get your page live and earning.'
              : 'Here is everything you need to know to get the most out of CRWN.'
            }
          </p>
        </div>

        <div className="space-y-3 mb-8">
          {steps.map((step, index) => (
            <div key={index} className="flex items-start gap-4 neu-raised rounded-xl p-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-crwn-gold/20 flex items-center justify-center">
                <span className="text-crwn-gold text-sm font-bold">{index + 1}</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-crwn-text font-semibold text-sm">{step.title}</h3>
                <p className="text-crwn-text-secondary text-xs mt-1 leading-relaxed">{step.description}</p>
              </div>
              <step.icon className="w-5 h-5 text-crwn-gold/40 flex-shrink-0 mt-0.5" />
            </div>
          ))}
        </div>

        <button
          onClick={() => router.push('/home')}
          className="w-full bg-crwn-gold text-crwn-bg font-semibold py-3 px-6 rounded-full hover:bg-crwn-gold/90 transition-colors flex items-center justify-center gap-2"
        >
          Let's Go
          <ChevronRight className="w-5 h-5" />
        </button>

        <p className="mt-4 text-xs text-crwn-text-secondary text-center">
          You can revisit this guide anytime from the help icon on your home screen.
        </p>
      </div>
    </div>
  );
}
