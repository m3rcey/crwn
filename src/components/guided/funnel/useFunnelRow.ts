'use client';

// The one loader the magnet and turn-it-on flows share: the artist's funnel rows and social
// connections, and WHICH row is the funnel (the pointer from Rise Mode, else the same choice
// funnel readiness makes). No wizard memory: the row is the draft.

import { useEffect, useState } from 'react';
import { pickFunnel } from '@/lib/funnelReadiness';
import type { ExistingAutomation } from '@/components/artist/automations/AutomationWizard';

export interface ConnectionInfo {
  provider: 'instagram' | 'facebook';
  providerUsername: string | null;
  status: string;
}

type Row = ExistingAutomation & { updated_at?: string | null; activated_at?: string | null };

export function useFunnelRow(artistId: string, funnelId: string | null) {
  const [state, setState] = useState<{ existing: Row | null; connections: ConnectionInfo[] } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const [listRes, statusRes] = await Promise.all([
        fetch(`/api/fan-automations?artistId=${artistId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/social-connect/status?artistId=${artistId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (!active) return;
      const rows: Row[] = listRes?.automations ?? [];
      const pointed = funnelId ? rows.find((r) => r.id === funnelId) ?? null : null;
      const picked = pointed ?? (pickFunnel(rows) as Row | null);
      setState({ existing: picked, connections: statusRes?.connections ?? [] });
    })();
    return () => {
      active = false;
    };
  }, [artistId, funnelId]);

  return state;
}
