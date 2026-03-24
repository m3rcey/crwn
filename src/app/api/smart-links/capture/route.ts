import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { linkId, artistId, name, email, phone } = body;

  if (!linkId || !artistId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Verify link exists and is active
  const { data: link } = await supabaseAdmin
    .from('smart_links')
    .select('id, collect_email')
    .eq('id', linkId)
    .eq('is_active', true)
    .single();

  if (!link) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  // Get IP and user agent for context
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
  const userAgent = req.headers.get('user-agent') || null;

  // Insert capture
  const { error } = await supabaseAdmin
    .from('smart_link_captures')
    .insert({
      smart_link_id: linkId,
      artist_id: artistId,
      name: name || null,
      email: email || null,
      phone: phone || null,
      ip_address: ip,
      user_agent: userAgent,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Increment capture count
  await supabaseAdmin
    .from('smart_links')
    .update({ capture_count: (link as any).capture_count ? (link as any).capture_count + 1 : 1 })
    .eq('id', linkId);

  // Also write to fan_contacts for audience integration (upsert by email)
  if (email) {
    await supabaseAdmin
      .from('fan_contacts')
      .upsert(
        {
          artist_id: artistId,
          email: email.toLowerCase().trim(),
          name: name || null,
          phone: phone || null,
          source: 'smart_link',
        },
        { onConflict: 'artist_id,email' }
      );
  }

  return NextResponse.json({ success: true });
}
