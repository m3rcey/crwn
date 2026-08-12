import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/auth/requireAdmin';

// Service-role client (bypasses RLS) — admin-only route.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

// SECURITY (SEC-001): the acting admin is derived from the SESSION cookie via
// requireAdmin(), never from a client-supplied `userId`/`adminUserId`. The old
// code looked up the role of whatever id the request carried, so any request
// presenting a known admin UUID — trivially harvested from the public profile
// surface — was treated as admin, unauthenticated. Caller identity (`actor`) is
// now strictly separate from any TARGET id in the request body.

// GET — list recent users (with approval status) and invite codes.
export async function GET(_req: NextRequest) {
  const actor = await requireAdmin();
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { data: users } = await supabaseAdmin
    .from('profiles')
    .select('id, display_name, role, is_approved, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  const { data: codes } = await supabaseAdmin
    .from('invite_codes')
    .select('code, label, max_uses, uses, is_active, created_at')
    .order('created_at', { ascending: false });

  const { data: gate } = await supabaseAdmin
    .from('admin_settings')
    .select('value')
    .eq('key', 'artist_gate')
    .single();
  const gateEnabled = (gate?.value as { enabled?: boolean } | null)?.enabled === true;

  return NextResponse.json({ users: users || [], codes: codes || [], gateEnabled });
}

// POST { action, ... } — approve/revoke a user, or mint/toggle invite codes.
// The acting admin comes from the session; the body carries only TARGET ids.
export async function POST(req: NextRequest) {
  const actor = await requireAdmin();
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await req.json();
  const { action } = body;

  if (action === 'setGate') {
    const { enabled } = body;
    const { error } = await supabaseAdmin
      .from('admin_settings')
      .upsert(
        { key: 'artist_gate', value: { enabled: !!enabled }, updated_at: new Date().toISOString(), updated_by: actor.id },
        { onConflict: 'key' }
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'setApproval') {
    const { targetUserId, approved } = body;
    if (!targetUserId) {
      return NextResponse.json({ error: 'Missing targetUserId' }, { status: 400 });
    }
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ is_approved: !!approved })
      .eq('id', targetUserId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'mintCode') {
    const { code, label, maxUses } = body;
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Missing code' }, { status: 400 });
    }
    const { error } = await supabaseAdmin
      .from('invite_codes')
      .insert({
        code: code.trim(),
        label: label || null,
        max_uses: maxUses === '' || maxUses === undefined || maxUses === null ? null : Number(maxUses),
      });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'toggleCode') {
    const { code, isActive } = body;
    if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });
    const { error } = await supabaseAdmin
      .from('invite_codes')
      .update({ is_active: !!isActive })
      .eq('code', code);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
