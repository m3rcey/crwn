import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verifyAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  return data?.role === 'admin';
}

// GET - fetch all admin settings
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId || !(await verifyAdmin(userId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { data } = await supabaseAdmin
    .from('admin_settings')
    .select('key, value, updated_at');

  return NextResponse.json(data || []);
}

// PUT - update a setting
export async function PUT(req: NextRequest) {
  const { userId, key, value } = await req.json();

  if (!userId || !(await verifyAdmin(userId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  if (!key || value === undefined) {
    return NextResponse.json({ error: 'Missing key or value' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('admin_settings')
    .upsert(
      { key, value, updated_at: new Date().toISOString(), updated_by: userId },
      { onConflict: 'key' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
