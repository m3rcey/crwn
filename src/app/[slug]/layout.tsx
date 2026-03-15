'use client';

import { Navigation } from '@/components/layout/Navigation';

export default function ArtistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <Navigation />
      <div className="md:pl-64 pb-20 md:pb-0">
        {children}
      </div>
    </div>
  );
}
