// The guided flow components, keyed by flow. Each is loaded on demand so the shell never
// bundles every builder. A flow absent from this map forwards to its legacy surface (see
// src/app/build/[flow]/page.tsx); adding a builder means adding one line here.

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import type { GuidedFlowKey } from '@/lib/guidedSetup/flows';
import type { GuidedFlowProps } from './types';

export const GUIDED_FLOW_COMPONENTS: Partial<Record<GuidedFlowKey, ComponentType<GuidedFlowProps>>> = {};

// Kept here so the import is used once the first flow registers; dynamic() stays the
// one loading mechanism.
export const lazyFlow = (loader: () => Promise<{ default: ComponentType<GuidedFlowProps> }>) =>
  dynamic(loader, { ssr: false });
