// Song Lab projects — artist management CRUD. Artist identity is session-derived
// (requireSongLabArtist); a request can only ever touch the caller's own lab.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSongLabArtist } from '@/lib/songLab/server';
import { MAX_TITLE_LENGTH } from '@/lib/songLab/core';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const STATUSES = ['active', 'completed', 'archived'] as const;

export async function GET() {
  const auth = await requireSongLabArtist(supabaseAdmin);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: projects, error } = await supabaseAdmin
    .from('song_lab_projects')
    .select('id, title, artwork_url, status, next_note, created_at, updated_at')
    .eq('artist_id', auth.artistId)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Failed to load projects' }, { status: 500 });

  const ids = (projects || []).map((p) => p.id);
  let decisions: unknown[] = [];
  if (ids.length) {
    const { data: d } = await supabaseAdmin
      .from('song_lab_decisions')
      .select('id, project_id, stage_label, question, options, status, is_free, allowed_tier_ids, opens_at, closes_at, winning_option_id, created_at, closed_at')
      .in('project_id', ids)
      .order('created_at', { ascending: true });
    decisions = d || [];
  }

  return NextResponse.json({ projects: projects || [], decisions });
}

export async function POST(req: NextRequest) {
  const auth = await requireSongLabArtist(supabaseAdmin);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title || title.length > MAX_TITLE_LENGTH) {
    return NextResponse.json({ error: 'A project needs a title' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('song_lab_projects')
    .insert({ artist_id: auth.artistId, title, next_note: typeof body.nextNote === 'string' ? body.nextNote.trim().slice(0, 200) || null : null })
    .select('id')
    .single();
  if (error || !data) return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });

  return NextResponse.json({ id: data.id });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSongLabArtist(supabaseAdmin);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const projectId = typeof body.projectId === 'string' ? body.projectId : '';
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === 'string') {
    const t = body.title.trim();
    if (!t || t.length > MAX_TITLE_LENGTH) return NextResponse.json({ error: 'Invalid title' }, { status: 400 });
    updates.title = t;
  }
  if (typeof body.status === 'string') {
    if (!STATUSES.includes(body.status as (typeof STATUSES)[number])) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    updates.status = body.status;
  }
  if ('nextNote' in body) {
    updates.next_note = typeof body.nextNote === 'string' ? body.nextNote.trim().slice(0, 200) || null : null;
  }

  // Ownership is part of the WHERE, so a foreign projectId updates nothing.
  const { data, error } = await supabaseAdmin
    .from('song_lab_projects')
    .update(updates)
    .eq('id', projectId)
    .eq('artist_id', auth.artistId)
    .select('id');
  if (error) return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  return NextResponse.json({ success: true });
}
