'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Navigation } from '@/components/layout/Navigation';
import { BackgroundImage } from '@/components/ui/BackgroundImage';


export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, isLoading } = useAuth();
  const router = useRouter();

  // A new signup that hasn't completed /welcome yet. Admins are exempt so the
  // founder is never trapped by the onboarding gate.
  const needsOnboarding =
    !!user && !!profile && profile.role !== 'admin' && !profile.onboarding_completed;

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    // Force new signups through onboarding before they can use the app. This is the
    // single enforcement point: email signup, Google OAuth, and direct navigation all
    // land on a (main) page, so gating here catches every bypass path into /welcome.
    if (needsOnboarding) {
      router.push('/welcome');
    }
  }, [user, needsOnboarding, isLoading, router]);


  if (!isLoading && !user) {
    return null;
  }

  // Avoid flashing the app shell while we redirect an unonboarded user to /welcome.
  if (needsOnboarding) {
    return null;
  }

  return (
    <div className="relative min-h-screen bg-transparent">
      <BackgroundImage src="/backgrounds/bg-home.jpg" />
      <Navigation />
      
      {/* Main Content - with padding for mobile nav and sidebar */}
      <div className="relative z-10 md:pl-64 pb-20 md:pb-0">
        <main className="p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
