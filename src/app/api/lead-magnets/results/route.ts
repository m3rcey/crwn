import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireArtistOwner } from '@/lib/apiAuth';
import { getLeadMagnet } from '@/lib/leadMagnets/registry';
import { generateResult } from '@/lib/leadMagnets/resultGenerators';
import { recordLmEvent } from '@/lib/leadMagnets/server';

// Authenticated: an artist saves a result to their dashboard (POST) or lists them (GET).
// Ownership is enforced via requireArtistOwner (the artistId is server-verified).
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function POST(req: NextRequest) {
  let body: { artistId?: string; toolSlug?: string; inputs?: Record<string, unknown>; title?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const auth = await requireArtistOwner(body.artistId);
  if (!auth.ok) return auth.error;

  const config = getLeadMagnet(String(body.toolSlug || ''));
  if (!config) return NextResponse.json({ error: 'Unknown tool' }, { status: 404 });

  const inputs = (body.inputs && typeof body.inputs === 'object' ? body.inputs : {}) as Record<
    string,
    string | number | boolean | string[] | null
  >;

  // Recompute server-side; never trust a client-sent result.
  let result;
  try {
    result = generateResult(config.resultGeneratorKey, inputs);
  } catch {
    return NextResponse.json({ error: 'Could not generate result' }, { status: 400 });
  }

  const { data: saved, error } = await supabaseAdmin
    .from('lead_magnet_results')
    .insert({
      tool_slug: config.slug,
      user_id: auth.userId,
      artist_id: body.artistId as string,
      status: 'completed',
      title: (body.title || result.headline).slice(0, 200),
      input_data: inputs,
      result_data: result as unknown as Record<string, unknown>,
      generator_version: result.generatorVersion,
      source: 'artist',
    })
    .select('id, updated_at')
    .single();

  if (error || !saved) return NextResponse.json({ error: error?.message || 'Could not save' }, { status: 500 });

  await recordLmEvent(supabaseAdmin, 'lead_magnet_result_saved', { toolSlug: config.slug, context: 'artist', authed: true, resultId: saved.id });

  return NextResponse.json({ success: true, resultId: saved.id, updatedAt: saved.updated_at, result });
}

export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get('artistId');
  const auth = await requireArtistOwner(artistId);
  if (!auth.ok) return auth.error;

  const { data, error } = await supabaseAdmin
    .from('lead_magnet_results')
    .select('id, tool_slug, title, status, converted_feature_type, converted_record_id, last_emailed_at, archived_at, created_at, updated_at')
    .eq('artist_id', artistId as string)
    .eq('source', 'artist')
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: data || [] });
}
