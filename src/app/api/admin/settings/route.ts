import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/auth/requireAdmin';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

// GET - fetch all admin settings
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { data } = await supabaseAdmin
    .from('admin_settings')
    .select('key, value, updated_at');

  return NextResponse.json(data || []);
}

// PUT - update a setting
export async function PUT(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { key, value } = await req.json();

  if (!key || value === undefined) {
    return NextResponse.json({ error: 'Missing key or value' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('admin_settings')
    .upsert(
      { key, value, updated_at: new Date().toISOString(), updated_by: admin.id },
      { onConflict: 'key' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
