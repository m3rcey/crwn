import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getLeadMagnet } from '@/lib/leadMagnets/registry';
import { generateResult } from '@/lib/leadMagnets/resultGenerators';
import { recordLmEvent } from '@/lib/leadMagnets/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Resolve the signed-in user, confirm they own the artist_profiles row on this result.
async function ownerCheck(resultId: string): Promise<
  | { ok: true; userId: string; row: { id: string; artist_id: string | null; tool_slug: string; result_data: Record<string, unknown> } }
  | { ok: false; error: NextResponse }
> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: row } = await supabaseAdmin
    .from('lead_magnet_results')
    .select('id, artist_id, user_id, tool_slug, result_data')
    .eq('id', resultId)
    .maybeSingle();
  if (!row) return { ok: false, error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };

  const { data: owned } = await supabaseAdmin
    .from('artist_profiles')
    .select('id')
    .eq('id', row.artist_id as string)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!owned) return { ok: false, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };

  return { ok: true, userId: user.id, row };
}

// GET: public read by high-entropy token (?token=), OR authenticated owner read.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.nextUrl.searchParams.get('token');

  if (token) {
    const { data: row } = await supabaseAdmin
      .from('lead_magnet_results')
      .select('id, tool_slug, result_data, input_data, public_token_expires_at')
      .eq('public_token', token)
      .maybeSingle();
    // Do not leak whether the id matched; token is the only credential that matters.
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (row.public_token_expires_at && new Date(row.public_token_expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'This link has expired' }, { status: 410 });
    }
    // Public payload only: no lead PII.
    return NextResponse.json({ toolSlug: row.tool_slug, result: row.result_data, inputs: row.input_data });
  }

  const check = await ownerCheck(id);
  if (!check.ok) return check.error;
  const { data: full } = await supabaseAdmin.from('lead_magnet_results').select('*').eq('id', id).single();
  return NextResponse.json({ result: full });
}

// PATCH: owner edits (retitle, re-generate from edited inputs, mark converted, or archive).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const check = await ownerCheck(id);
  if (!check.ok) return check.error;

  let body: {
    title?: string;
    inputs?: Record<string, unknown>;
    archive?: boolean;
    converted?: { featureType: string; recordId?: string };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.title === 'string') update.title = body.title.slice(0, 200);

  if (body.inputs && typeof body.inputs === 'object') {
    const config = getLeadMagnet(check.row.tool_slug);
    if (config) {
      try {
        const result = generateResult(config.resultGeneratorKey, body.inputs as Record<string, string | number | boolean | string[] | null>);
        update.input_data = body.inputs;
        update.result_data = result as unknown as Record<string, unknown>;
        update.generator_version = result.generatorVersion;
      } catch {
        return NextResponse.json({ error: 'Could not regenerate result' }, { status: 400 });
      }
    }
  }

  if (body.archive === true) {
    update.status = 'archived';
    update.archived_at = new Date().toISOString();
  }

  if (body.converted?.featureType) {
    update.status = 'converted';
    update.converted_feature_type = String(body.converted.featureType).slice(0, 60);
    if (body.converted.recordId) update.converted_record_id = body.converted.recordId;
    update.converted_at = new Date().toISOString();
    await recordLmEvent(supabaseAdmin, 'lead_magnet_conversion_completed', { toolSlug: check.row.tool_slug, context: 'artist', authed: true, resultId: id, conversionTarget: String(body.converted.featureType) });
  }

  const { data, error } = await supabaseAdmin.from('lead_magnet_results').update(update).eq('id', id).select('id, updated_at, status').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.archive === true) {
    await recordLmEvent(supabaseAdmin, 'lead_magnet_result_archived', { toolSlug: check.row.tool_slug, context: 'artist', authed: true, resultId: id });
  }
  return NextResponse.json({ success: true, result: data });
}

// DELETE: owner removes a saved result.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const check = await ownerCheck(id);
  if (!check.ok) return check.error;

  const { error } = await supabaseAdmin.from('lead_magnet_results').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
