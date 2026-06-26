'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { MessagesInbox } from '@/components/messages/MessagesInbox';
import { Loader2 } from 'lucide-react';

function MessagesContent() {
  const { user, isLoading } = useAuth();
  const searchParams = useSearchParams();
  const artistSlug = searchParams.get('artist') || undefined;

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-crwn-text-dim" /></div>;
  }
  if (!user) {
    return <div className="text-center py-20 text-crwn-text-secondary">Sign in to view your messages.</div>;
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-5xl mx-auto">
      <MessagesInbox currentUserId={user.id} initialArtistSlug={artistSlug} />
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-crwn-text-dim" /></div>}>
      <MessagesContent />
    </Suspense>
  );
}
