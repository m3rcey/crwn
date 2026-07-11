'use client';

import { useState } from 'react';
import { Mail, Share2, Save } from 'lucide-react';
import { useToast } from '@/components/shared/Toast';
import { LM_EVENTS, trackLeadMagnet } from '@/lib/leadMagnets/analytics';
import type { GeneratedResult, LeadMagnetConfig } from '@/lib/leadMagnets/types';

// Email + Share (+ optional Save). Never puts private inputs or PII into a share URL.
export function ResultActions({
  config,
  result,
  context,
  publicToken,
  resultId,
  onSave,
  saving,
  saved,
}: {
  config: LeadMagnetConfig;
  result: GeneratedResult;
  context: 'public' | 'artist';
  publicToken?: string;
  resultId?: string;
  onSave?: () => void;
  saving?: boolean;
  saved?: boolean;
}) {
  const { showToast } = useToast();
  const [emailing, setEmailing] = useState(false);

  const emailResult = async () => {
    setEmailing(true);
    try {
      const res = await fetch('/api/lead-magnets/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(publicToken ? { token: publicToken } : { resultId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not email');
      showToast('Sent. Check your inbox.', 'success');
      trackLeadMagnet(LM_EVENTS.resultEmailed, { toolSlug: config.slug, context, resultId });
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not email', 'error');
    } finally {
      setEmailing(false);
    }
  };

  const share = async () => {
    // Share-safe summary only. No inputs, no email, no financial detail.
    const shareUrl = publicToken ? `${window.location.origin}${config.publicRoute}` : `${window.location.origin}${config.publicRoute}`;
    const text = result.shareSummary;
    trackLeadMagnet(LM_EVENTS.resultShared, { toolSlug: config.slug, context, resultId });
    try {
      if (navigator.share) {
        await navigator.share({ title: config.name, text, url: shareUrl });
        return;
      }
    } catch {
      /* user cancelled or unsupported */
    }
    try {
      await navigator.clipboard.writeText(`${text} ${shareUrl}`);
      showToast('Copied to clipboard', 'success');
    } catch {
      showToast('Could not share', 'error');
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {onSave && (
        <button
          onClick={onSave}
          disabled={saving || saved}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-crwn-elevated text-crwn-text text-sm font-medium disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saved ? 'Saved' : saving ? 'Saving…' : 'Save result'}
        </button>
      )}
      <button onClick={emailResult} disabled={emailing} className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-crwn-elevated text-crwn-text text-sm font-medium disabled:opacity-50">
        <Mail className="w-4 h-4" />
        {emailing ? 'Sending…' : 'Email result'}
      </button>
      <button onClick={share} className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-crwn-elevated text-crwn-text text-sm font-medium">
        <Share2 className="w-4 h-4" />
        Share
      </button>
    </div>
  );
}
