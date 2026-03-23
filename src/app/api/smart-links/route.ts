import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const artistId = req.nextUrl.searchParams.get('artistId');
  if (!artistId) return NextResponse.json({ error: 'Missing artistId' }, { status: 400 });

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('id', artistId)
    .eq('user_id', user.id)
    .single();
  if (!artist) return NextResponse.json({ error: 'Not your profile' }, { status: 403 });

  const { data: links } = await supabaseAdmin
    .from('smart_links')
    .select('*')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false });

  return NextResponse.json({ links: links || [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, artistId, slug, title, description, destinationUrl, collectEmail, collectPhone, collectName } = body;

  if (!artistId || !slug) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('id', artistId)
    .eq('user_id', user.id)
    .single();
  if (!artist) return NextResponse.json({ error: 'Not your profile' }, { status: 403 });

  // Clean slug
  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '').substring(0, 50);
  if (cleanSlug.length < 2) {
    return NextResponse.json({ error: 'Slug must be at least 2 characters' }, { status: 400 });
  }

  if (id) {
    // Update
    const { data: link, error } = await supabaseAdmin
      .from('smart_links')
      .update({
        slug: cleanSlug,
        title: title || null,
        description: description || null,
        destination_url: destinationUrl || null,
        collect_email: collectEmail ?? true,
        collect_phone: collectPhone ?? false,
        collect_name: collectName ?? true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('artist_id', artistId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ link });
  } else {
    // Check slug uniqueness for this artist
    const { data: existing } = await supabaseAdmin
      .from('smart_links')
      .select('id')
      .eq('artist_id', artistId)
      .eq('slug', cleanSlug)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'Slug already in use. Try another.' }, { status: 409 });
    }

    const { data: link, error } = await supabaseAdmin
      .from('smart_links')
      .insert({
        artist_id: artistId,
        slug: cleanSlug,
        title: title || null,
        description: description || null,
        destination_url: destinationUrl || null,
        collect_email: collectEmail ?? true,
        collect_phone: collectPhone ?? false,
        collect_name: collectName ?? true,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ link });
  }
}
