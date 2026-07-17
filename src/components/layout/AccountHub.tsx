'use client';

// AccountHub — the hamburger-reached account hub. Everything "manage my account /
// my business" lives here so the bottom tab bar is free for DOING the work (create,
// grow, engage). Modeled on the Lyft driver menu: an identity header on top, then
// collapsed accordion groups (one open at a time), badges for what needs attention.
//
// Rendered as a full-screen overlay. Content is role-aware: artists get the growth
// + payouts world, fans get a lighter version. No em dashes in any copy.

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePlayer } from '@/hooks/usePlayer';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import {
  X,
  ChevronDown,
  TrendingUp,
  Users,
  MessageCircle,
  Gift,
  UserCircle,
  Wallet,
  LayoutDashboard,
  LifeBuoy,
  GraduationCap,
  PlayCircle,
  Compass,
  Library,
  Coins,
  Bell,
  LogOut,
  ExternalLink,
} from 'lucide-react';

interface HubLink {
  label: string;
  href?: string;
  onClick?: () => void;
  icon: React.ComponentType<{ className?: string }>;
  badge?: boolean;
}

interface HubSection {
  title: string;
  links: HubLink[];
}

export function AccountHub({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, profile, signOut, isArtist } = useAuth();
  const { resetPlayer } = usePlayer();
  const router = useRouter();
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [platformTier, setPlatformTier] = useState<string | null>(null);
  const [stripeConnected, setStripeConnected] = useState(true);

  const artist = isArtist();

  useEffect(() => {
    if (!open || !artist || !user) return;
    let active = true;
    (async () => {
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase
        .from('artist_profiles')
        .select('slug, platform_tier, stripe_connect_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!active || !data) return;
      setSlug(data.slug ?? null);
      setPlatformTier(data.platform_tier ?? 'starter');
      setStripeConnected(!!data.stripe_connect_id);
    })();
    return () => {
      active = false;
    };
  }, [open, artist, user]);

  if (!open) return null;

  const go = (href: string) => {
    onClose();
    if (href.startsWith('http')) window.location.href = href;
    else router.push(href);
  };

  const replayTour = () => {
    onClose();
    router.push('/home?tour=1');
  };

  const handleSignOut = async () => {
    resetPlayer();
    await signOut();
    window.location.href = '/login';
  };

  const firstName = (profile?.display_name || user?.email || 'You').split(' ')[0];
  const planLabel =
    platformTier === 'pro' ? 'Pro plan' : platformTier === 'label' ? 'Label plan' : 'Free plan';

  const artistSections: HubSection[] = [
    {
      title: 'Grow',
      links: [
        { label: 'Rise Mode', href: '/profile/artist?tab=rise', icon: TrendingUp },
        { label: 'Fan CRM', href: '/studio/fans', icon: Users },
        { label: 'Message your fans', href: '/messages', icon: MessageCircle },
        { label: 'Referrals', href: '/profile/artist?tab=referrals', icon: Gift },
      ],
    },
    {
      title: 'Account',
      links: [
        { label: 'Your info', href: '/profile', icon: UserCircle },
        { label: 'Payouts and tax', href: '/profile/artist?tab=payouts', icon: Wallet, badge: !stripeConnected },
        { label: 'Notification preferences', href: '/profile/notifications', icon: Bell },
        { label: 'Studio', href: '/studio', icon: LayoutDashboard },
      ],
    },
    {
      title: 'Support and resources',
      links: [
        { label: 'Help Center', href: '/support', icon: LifeBuoy },
        { label: 'Getting started guide', href: '/getting-started?role=artist', icon: GraduationCap },
        { label: 'Replay the app tour', onClick: replayTour, icon: PlayCircle },
      ],
    },
  ];

  const fanSections: HubSection[] = [
    {
      title: 'Explore and listen',
      links: [
        { label: 'Explore artists', href: '/explore', icon: Compass },
        { label: 'My library', href: '/library', icon: Library },
        { label: 'Earn', href: '/command', icon: Coins },
      ],
    },
    {
      title: 'Account',
      links: [
        { label: 'Your info', href: '/profile', icon: UserCircle },
        { label: 'Notification preferences', href: '/profile/notifications', icon: Bell },
      ],
    },
    {
      title: 'Support and resources',
      links: [
        { label: 'Help Center', href: '/support', icon: LifeBuoy },
        { label: 'Getting started guide', href: '/getting-started?role=fan', icon: GraduationCap },
        { label: 'Replay the app tour', onClick: replayTour, icon: PlayCircle },
      ],
    },
  ];

  const sections = artist ? artistSections : fanSections;

  return (
    <div className="fixed inset-0 z-[80] bg-[#0D0D0D] overflow-y-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="max-w-lg mx-auto px-5 pt-[calc(1rem+env(safe-area-inset-top))] pb-10">
        {/* Close */}
        <div className="flex justify-start mb-4">
          <button onClick={onClose} aria-label="Close menu" className="text-gray-400 hover:text-white p-1">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Identity header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full overflow-hidden bg-[#2A2A2A] flex items-center justify-center flex-shrink-0 ring-2 ring-[#D4AF37]">
            {profile?.avatar_url ? (
              <Image src={profile.avatar_url} alt="" width={64} height={64} className="w-full h-full object-cover" />
            ) : (
              <span className="text-xl font-bold text-white">{firstName.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-white truncate">{profile?.display_name || firstName}</h1>
            {artist && slug ? (
              <button
                onClick={() => go(`/${slug}`)}
                className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-[#D4AF37] hover:underline"
              >
                View as fan
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            ) : (
              <p className="text-sm text-gray-500 truncate">{user?.email}</p>
            )}
          </div>
        </div>

        {/* Plan pill (artists): a persistent, honest upgrade hook */}
        {artist && (
          <button
            onClick={() => go('/pricing')}
            className="w-full flex items-center justify-between rounded-xl bg-[#1A1A1A] border border-[#2A2A2A] px-4 py-3 mb-6"
          >
            <span className="text-sm text-gray-300">
              {planLabel}
              {platformTier === 'starter' && <span className="text-gray-500"> (12% fee)</span>}
            </span>
            {platformTier === 'starter' && (
              <span className="text-sm font-semibold text-[#D4AF37]">Upgrade to Pro</span>
            )}
          </button>
        )}

        {/* Accordion sections */}
        <div className="space-y-2">
          {sections.map((section) => {
            const isOpen = openSection === section.title;
            return (
              <div key={section.title} className="border-b border-[#1F1F1F]">
                <button
                  onClick={() => setOpenSection(isOpen ? null : section.title)}
                  className="w-full flex items-center justify-between py-4"
                >
                  <span className="text-lg font-bold text-white">{section.title}</span>
                  <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="pb-2">
                    {section.links.map((link) => {
                      const Icon = link.icon;
                      return (
                        <button
                          key={link.label}
                          onClick={() => (link.onClick ? link.onClick() : link.href && go(link.href))}
                          className="w-full flex items-center gap-3 py-3 text-left"
                        >
                          <Icon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                          <span className="text-base text-gray-200 flex-1">{link.label}</span>
                          {link.badge && <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="mt-6 w-full flex items-center gap-3 py-4 text-left border-t border-[#1F1F1F]"
        >
          <LogOut className="w-5 h-5 text-gray-400" />
          <span className="text-base text-gray-200">Log out</span>
        </button>
      </div>
    </div>
  );
}
