// The guided flow components, keyed by flow. Each is loaded on demand so the shell never
// bundles every builder. A flow absent from this map forwards to its legacy surface (see
// src/app/build/[flow]/page.tsx); adding a builder means adding one line here.

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import type { GuidedFlowKey } from '@/lib/guidedSetup/flows';
import type { GuidedFlowProps } from './types';

const lazyFlow = (loader: () => Promise<{ default: ComponentType<GuidedFlowProps> }>) =>
  dynamic(loader, { ssr: false });

export const GUIDED_FLOW_COMPONENTS: Partial<Record<GuidedFlowKey, ComponentType<GuidedFlowProps>>> = {
  offer: lazyFlow(() => import('./offer/OfferFlow')),
  magnet: lazyFlow(() => import('./funnel/MagnetFlow')),
  funnel: lazyFlow(() => import('./funnel/FunnelFlow')),
};
