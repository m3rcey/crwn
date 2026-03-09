'use client';
import { Navigation } from '@/components/layout/Navigation';

export default function ArtistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <Navigation />
    </>
  );
}
