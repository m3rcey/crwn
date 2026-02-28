'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Navigation } from '@/components/layout/Navigation';
import { Loader2 } from 'lucide-react';

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-crwn-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-crwn-bg">
      <Navigation />
      
      {/* Main Content - with padding for mobile nav and sidebar */}
      <div className="md:pl-64 pb-20 md:pb-0">
        <main className="p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
