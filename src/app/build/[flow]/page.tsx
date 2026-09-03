'use client';

// /build/[flow]: the shell every Rise Mode guided flow wears.
//
// One route family, one hook, no engine. The page resolves the artist from the session (the
// same cached row every hub page uses), reads the pointer context from the URL, and mounts the
// flow registered for this key. A flow whose builder has not shipped forwards to the surface
// that owns its rows, so a Rise Mode link never 404s. Unknown keys are 404s.

import { Suspense, useEffect } from 'react';
import { notFound, useParams, useRouter } from 'next/navigation';
import { useArtistContext } from '@/hooks/useArtistContext';
import { useGuidedEntry } from '@/hooks/useGuidedEntry';
import { GUIDED_FLOWS, isGuidedFlowKey } from '@/lib/guidedSetup/flows';
import { GUIDED_FLOW_COMPONENTS } from '@/components/guided/registry';

function BuildFlow() {
  const params = useParams<{ flow: string }>();
  const router = useRouter();
  const { status, context } = useArtistContext();
  const entry = useGuidedEntry();

  const flowKey = params?.flow;
  const valid = isGuidedFlowKey(flowKey);
  const def = valid ? GUIDED_FLOWS[flowKey] : null;
  const Flow = valid ? GUIDED_FLOW_COMPONENTS[flowKey] : undefined;

  useEffect(() => {
    if (!def) return;
    if (status === 'signed-out') {
      router.replace('/login');
      return;
    }
    if (status === 'not-artist') {
      router.replace('/home');
      return;
    }
    // Not built yet: forward to the surface that owns this flow's rows, keeping the return path.
    if (status === 'artist' && !Flow) {
      const target = def.legacyHref ?? def.href;
      const sep = target.includes('?') ? '&' : '?';
      router.replace(`${target}${sep}returnTo=${encodeURIComponent(entry.returnTo)}`);
    }
  }, [def, Flow, status, router, entry.returnTo]);

  if (!valid || !def) notFound();

  if (status !== 'artist' || !context || !Flow) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-crwn-gold border-t-transparent rounded-full animate-spin" aria-label="Loading" />
      </div>
    );
  }

  return <Flow context={context} entry={entry} />;
}

export default function BuildFlowPage() {
  return (
    <Suspense fallback={null}>
      <BuildFlow />
    </Suspense>
  );
}
