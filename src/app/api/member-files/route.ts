// Member file bundles — artist management. The artist is resolved from the SESSION, so a
// request can name a bundle but can never name whose bundle it is; ownership is part of
// every WHERE clause, which is what makes a foreign id update nothing rather than 403 on
// a row it should not have loaded.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireMemberFilesArtist } from '@/lib/memberFiles/server';
import {
  normalizeFiles,
  memberFilePrefix,
  MAX_TITLE,
  MAX_DESCRIPTION,
} from '@/lib/memberFiles/core';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/** Tier ids must be the caller's OWN active tiers. A pointer is never authority. */
async function ownTierIds(artistId: string, raw: unknown): Promise<string[]> {
  const wanted = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  if (!wanted.length) return [];
  const { data } = await supabaseAdmin
    .from('subscription_tiers')
    .select('id')
    .eq('artist_id', artistId)
    .eq('is_active', true);
  const own = new Set((data || []).map((t: { id: string }) => t.id));
  return wanted.filter((id) => own.has(id));
}

export async function GET() {
  const auth = await requireMemberFilesArtist(supabaseAdmin);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await supabaseAdmin
    .from('member_files')
    .select('id, title, description, files, allowed_tier_ids, is_active, created_at')
    .eq('artist_id', auth.artistId)
    .order('created_at', { ascending: false });

  // The artist's own rungs ride along so the manager needs no second query and cannot be
  // handed a tier list from anywhere but here.
  const { data: tiers } = await supabaseAdmin
    .from('subscription_tiers')
    .select('id, name, price')
    .eq('artist_id', auth.artistId)
    .eq('is_active', true)
    .order('price', { ascending: true });

  // The table may not exist yet (migration pending). Fail soft: an empty list, never a
  // broken Studio screen.
  if (error) return NextResponse.json({ bundles: [], tiers: tiers || [], pending: true });

  return NextResponse.json({
    tiers: tiers || [],
    bundles: (data || []).map((b) => ({
      id: b.id,
      title: b.title,
      description: b.description,
      // Names and sizes only. The artist has no need for raw keys in the browser, and a
      // key in a client payload is a key that can be logged, screenshotted or pasted.
      files: ((b.files || []) as Array<{ name: string; size?: number }>).map((f) => ({
        name: f.name, size: f.size ?? null,
      })),
      allowedTierIds: b.allowed_tier_ids || [],
      isActive: b.is_active,
      createdAt: b.created_at,
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireMemberFilesArtist(supabaseAdmin);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title || title.length > MAX_TITLE) {
    return NextResponse.json({ error: 'A bundle needs a title' }, { status: 400 });
  }

  // Keys are re-validated against THIS artist's prefix, so a caller cannot attach a file
  // that belongs to someone else by pasting its key.
  const files = normalizeFiles(body.files, memberFilePrefix(auth.artistId));
  if (!files) {
    return NextResponse.json({ error: 'Add at least one file, and no more than 12' }, { status: 400 });
  }

  const tierIds = await ownTierIds(auth.artistId, body.allowedTierIds);
  if (!tierIds.length) {
    return NextResponse.json(
      { error: 'Pick which members get this. An empty list would mean nobody.' },
      { status: 400 },
    );
  }

  const description = typeof body.description === 'string'
    ? body.description.trim().slice(0, MAX_DESCRIPTION) || null
    : null;

  const { data, error } = await supabaseAdmin
    .from('member_files')
    .insert({
      artist_id: auth.artistId,
      title,
      description,
      files,
      allowed_tier_ids: tierIds,
      is_active: body.isActive !== false,
    })
    .select('id')
    .single();

  if (error || !data) {
    if (error?.code === '42P01') {
      return NextResponse.json({ error: 'Member files are not set up yet.' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not save that bundle' }, { status: 500 });
  }
  return NextResponse.json({ id: data.id });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireMemberFilesArtist(supabaseAdmin);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.title === 'string') {
    const t = body.title.trim();
    if (!t || t.length > MAX_TITLE) return NextResponse.json({ error: 'Invalid title' }, { status: 400 });
    updates.title = t;
  }
  if ('description' in body) {
    updates.description = typeof body.description === 'string'
      ? body.description.trim().slice(0, MAX_DESCRIPTION) || null
      : null;
  }
  if ('allowedTierIds' in body) {
    const tierIds = await ownTierIds(auth.artistId, body.allowedTierIds);
    if (!tierIds.length) {
      return NextResponse.json(
        { error: 'Pick which members get this. An empty list would mean nobody.' },
        { status: 400 },
      );
    }
    updates.allowed_tier_ids = tierIds;
  }
  if ('isActive' in body) updates.is_active = body.isActive === true;
  if ('files' in body) {
    const files = normalizeFiles(body.files, memberFilePrefix(auth.artistId));
    if (!files) return NextResponse.json({ error: 'Invalid file list' }, { status: 400 });
    updates.files = files;
  }

  const { data, error } = await supabaseAdmin
    .from('member_files')
    .update(updates)
    .eq('id', id)
    .eq('artist_id', auth.artistId) // ownership in the WHERE: a foreign id updates nothing
    .select('id');

  if (error) return NextResponse.json({ error: 'Could not update that bundle' }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireMemberFilesArtist(supabaseAdmin);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = req.nextUrl.searchParams.get('id') || '';
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('member_files')
    .delete()
    .eq('id', id)
    .eq('artist_id', auth.artistId)
    .select('id');

  if (error) return NextResponse.json({ error: 'Could not delete that bundle' }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
