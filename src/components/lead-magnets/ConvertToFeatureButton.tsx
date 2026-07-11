'use client';

import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { buildConversionUrl } from '@/lib/leadMagnets/conversionAdapters';
import { LM_EVENTS, trackLeadMagnet } from '@/lib/leadMagnets/analytics';
import type { GeneratedResult, LeadMagnetConfig } from '@/lib/leadMagnets/types';

// Primary conversion CTA.
//  - Public: routes into signup, preserving tool slug + result token for post-signup import.
//  - Artist + live feature: routes into the existing builder PREFILLED (the builder owns
//    the real submit, so no live record is created by this click).
//  - Artist + saved_plan: the result is already saveable; this points at where to build later.
export function ConvertToFeatureButton({
  config,
  result,
  context,
  publicToken,
  resultId,
}: {
  config: LeadMagnetConfig;
  result: GeneratedResult;
  context: 'public' | 'artist';
  publicToken?: string;
  resultId?: string;
}) {
  const router = useRouter();
  const { type, requiresProCapability } = config.conversionTarget;

  const go = () => {
    if (context === 'public') {
      trackLeadMagnet(LM_EVENTS.signupClicked, { toolSlug: config.slug, context, resultId });
      const q = new URLSearchParams({ tool: config.slug, ref: 'lead-magnet' });
      if (publicToken) q.set('result', publicToken);
      router.push(`/signup?${q.toString()}`);
      return;
    }

    trackLeadMagnet(LM_EVENTS.conversionStarted, { toolSlug: config.slug, context, resultId, conversionTarget: type });

    if (type === 'live_feature' || type === 'prefilled_existing_flow') {
      const url = buildConversionUrl(config, result.conversionPayload, { returnTo: config.artistRoute, resultId });
      if (url) {
        router.push(url);
        return;
      }
    }
    // saved_plan / feature_flagged with no live route: point at where to build it.
    if (config.conversionTarget.route) router.push(config.conversionTarget.route);
  };

  const label = context === 'public' ? config.cta.publicPrimary : config.conversionTarget.label;

  return (
    <div className="space-y-2">
      <button onClick={go} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-full bg-crwn-gold text-crwn-bg font-semibold">
        {label}
        <ArrowRight className="w-4 h-4" />
      </button>
      {context === 'artist' && requiresProCapability && (
        <p className="text-[11px] text-crwn-text-secondary text-center">
          The clip-to-earn commission rail is a Pro feature. You can still build the campaign and rewards on any plan.
        </p>
      )}
      {context === 'artist' && type === 'saved_plan' && (
        <p className="text-[11px] text-crwn-text-secondary text-center">No one-click feature for this yet. Save your plan and build it in CRWN when you are ready.</p>
      )}
    </div>
  );
}
