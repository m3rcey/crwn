// What a FAN sees: the artist's member-file bundles, with entitlement already resolved.
//
// Locked bundles are returned deliberately, as titles and rung labels with no file keys
// and no download index that would work. A benefit nobody can see is not a benefit, and a
// locked bundle a fan can name is the most honest upgrade prompt there is. What is never
// returned is anything that could become bytes: keys stay server-side, always.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { activeTierFor, tierNamesFor } from '@/lib/memberFiles/server';
import { checkFileAccess, lockedLabel, type MemberFileEntry } from '@/lib/memberFiles/core';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get('artistId') || '';
  if (!artistId) return NextResponse.json({ bundles: [] });

  const { data, error } = await supabaseAdmin
    .from('member_files')
    .select('id, title, description, files, allowed_tier_ids')
    .eq('artist_id', artistId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  // Pre-migration, or any read fault: an empty list. A missing table must never take an
  // artist's page down.
  if (error) return NextResponse.json({ bundles: [], pending: true });
  if (!data?.length) return NextResponse.json({ bundles: [] });

  let fanTierId: string | null = null;
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) fanTierId = await activeTierFor(supabaseAdmin, artistId, user.id);
  } catch {
    // anonymous view is fine; everything simply reads as locked
  }

  const bundles = [];
  for (const b of data) {
    const entitled = checkFileAccess({ allowed_tier_ids: b.allowed_tier_ids, is_active: true }, fanTierId).ok;
    const files = (b.files || []) as MemberFileEntry[];
    bundles.push({
      id: b.id,
      title: b.title,
      description: b.description,
      fileCount: files.length,
      // Names only when entitled, so a locked bundle cannot be read as a track listing.
      files: entitled ? files.map((f, i) => ({ index: i, name: f.name, size: f.size ?? null })) : [],
      entitled,
      lockedLabel: entitled ? null : lockedLabel(await tierNamesFor(supabaseAdmin, artistId, (b.allowed_tier_ids || []) as string[])),
    });
  }

  return NextResponse.json({ bundles });
}
