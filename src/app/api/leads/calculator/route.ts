import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// PUBLIC endpoint (no auth) — captures leads from the /worth lead-magnet calculator
// into the existing crm_contacts table. Uses the service-role client because
// unauthenticated visitors can't satisfy RLS. Build-safe env fallbacks per CLAUDE.md.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export async function POST(req: NextRequest) {
  let body: {
    email?: string;
    name?: string;
    monthlyListeners?: number;
    netAnnualCents?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const email = (body.email || '').trim().toLowerCase();
  // Minimal, dependency-free email sanity check.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }

  const name = (body.name || '').trim() || email.split('@')[0];
  const listeners = Number.isFinite(body.monthlyListeners) ? Math.max(0, Math.round(body.monthlyListeners as number)) : 0;
  const annual = Number.isFinite(body.netAnnualCents) ? Math.max(0, Math.round(body.netAnnualCents as number)) : 0;

  const note = `[calculator] monthly_listeners=${listeners}, est_annual_net=$${Math.round(annual / 100).toLocaleString('en-US')}`;

  // Upsert on the LOWER(email) unique index so a repeat visitor updates rather than 409s.
  // Only stamp 'lead' status / calculator source on first insert; never downgrade an
  // existing contact who may already be further along the pipeline.
  const { data: existing } = await supabaseAdmin
    .from('crm_contacts')
    .select('id, notes')
    .ilike('email', email)
    .maybeSingle();

  if (existing) {
    const prior = existing.notes ? `${existing.notes}\n` : '';
    const { error } = await supabaseAdmin
      .from('crm_contacts')
      .update({
        notes: `[${new Date().toISOString().split('T')[0]}] ${note}\n${prior}`.slice(0, 4000),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  const { error } = await supabaseAdmin.from('crm_contacts').insert({
    name,
    email,
    source: 'calculator',
    status: 'lead',
    tags: ['calculator'],
    notes: `[${new Date().toISOString().split('T')[0]}] ${note}`,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
