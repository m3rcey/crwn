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
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);


  if (!isLoading && !user) {
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
