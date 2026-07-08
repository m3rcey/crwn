import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
);

// GET /api/promise-calendar/health — per-tier Benefit Health Score: of the
// promises attached to each tier, what share has the artist kept (completed) vs
// let go overdue/missed. Drives the retention-risk read on the Promise Calendar.
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: artist } = await supabase
    .from('artist_profiles').select('id').eq('user_id', user.id).single();
  if (!artist?.id) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  // Tier-attached obligations (active/paused; archived ones are retired promises).
  const { data: obligations, error: oErr } = await supabaseAdmin
    .from('fulfillment_obligations')
    .select('id, source_tier_id')
    .eq('artist_id', artist.id)
    .not('source_tier_id', 'is', null)
    .in('status', ['active', 'paused']);
  if (oErr) return NextResponse.json({ tiers: [] }, { status: 200 });

  const obs = obligations || [];
  if (obs.length === 0) return NextResponse.json({ tiers: [] });

  const obIds = obs.map((o) => o.id);
  const tierByOb = new Map<string, string>();
  for (const o of obs) tierByOb.set(o.id, o.source_tier_id);

  const [{ data: events }, { data: tiers }] = await Promise.all([
    supabaseAdmin
      .from('fulfillment_events')
      .select('obligation_id, status, due_at')
      .in('obligation_id', obIds)
      .limit(2000),
    supabaseAdmin
      .from('subscription_tiers')
      .select('id, name')
      .eq('artist_id', artist.id),
  ]);

  const nameByTier = new Map<string, string>();
  for (const t of tiers || []) nameByTier.set(t.id, t.name);

  // Per-tier tallies.
  const nowMs = Date.now();
  type Tally = { completed: number; missed: number; obligations: Set<string> };
  const byTier = new Map<string, Tally>();
  const tallyFor = (tierId: string) => {
    let t = byTier.get(tierId);
    if (!t) { t = { completed: 0, missed: 0, obligations: new Set() }; byTier.set(tierId, t); }
    return t;
  };
  for (const o of obs) tallyFor(o.source_tier_id).obligations.add(o.id);

  for (const e of events || []) {
    const tierId = tierByOb.get(e.obligation_id);
    if (!tierId) continue;
    const t = tallyFor(tierId);
    if (e.status === 'completed') t.completed += 1;
    else if (e.status === 'missed') t.missed += 1;
    else if (e.status === 'pending' && new Date(e.due_at).getTime() < nowMs) t.missed += 1; // overdue
  }

  const result = [...byTier.entries()].map(([tierId, t]) => {
    const resolved = t.completed + t.missed;
    return {
      tierId,
      tierName: nameByTier.get(tierId) || 'Tier',
      obligations: t.obligations.size,
      completed: t.completed,
      resolved,
      pct: resolved > 0 ? Math.round((t.completed / resolved) * 100) : null,
    };
  });

  return NextResponse.json({ tiers: result });
}
