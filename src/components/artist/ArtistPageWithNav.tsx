'use client';
import { Navigation } from '@/components/layout/Navigation';
export default function ArtistPageWithNav({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-crwn-bg">
      <Navigation />
      <div className="md:pl-64 pb-20 md:pb-0">
        <main className="p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
