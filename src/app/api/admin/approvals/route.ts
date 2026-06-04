import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service-role client (bypasses RLS) — admin-only route.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

async function isAdmin(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  return data?.role === 'admin';
}

// GET ?userId=<admin> — list recent users (with approval status) and invite codes.
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!(await isAdmin(userId))) {
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

  return NextResponse.json({ users: users || [], codes: codes || [] });
}

// POST { adminUserId, action, ... } — approve/revoke a user, or mint/toggle invite codes.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { adminUserId, action } = body;

  if (!(await isAdmin(adminUserId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
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
