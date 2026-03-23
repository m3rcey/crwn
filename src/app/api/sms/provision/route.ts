import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSmsLimit } from '@/lib/platformTier';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { artistId, keyword } = await req.json();
  if (!artistId || !keyword) {
    return NextResponse.json({ error: 'Missing artistId or keyword' }, { status: 400 });
  }

  // Verify ownership
  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id, platform_tier')
    .eq('id', artistId)
    .eq('user_id', user.id)
    .single();
  if (!artist) return NextResponse.json({ error: 'Not your profile' }, { status: 403 });

  // Check tier allows SMS
  if (getSmsLimit(artist.platform_tier) === 0) {
    return NextResponse.json({ error: 'SMS requires Pro or higher' }, { status: 403 });
  }

  // Check keyword is alphanumeric, 3-20 chars
  const cleanKeyword = keyword.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleanKeyword.length < 3 || cleanKeyword.length > 20) {
    return NextResponse.json({ error: 'Keyword must be 3-20 alphanumeric characters' }, { status: 400 });
  }

  // Check keyword uniqueness
  const { data: existingKeyword } = await supabaseAdmin
    .from('artist_phone_numbers')
    .select('id')
    .eq('keyword', cleanKeyword)
    .maybeSingle();

  if (existingKeyword) {
    return NextResponse.json({ error: 'Keyword already taken. Try another.' }, { status: 409 });
  }

  // Check if artist already has a number
  const { data: existing } = await supabaseAdmin
    .from('artist_phone_numbers')
    .select('id')
    .eq('artist_id', artistId)
    .maybeSingle();

  if (existing) {
    // Update keyword
    await supabaseAdmin
      .from('artist_phone_numbers')
      .update({ keyword: cleanKeyword })
      .eq('id', existing.id);

    return NextResponse.json({ success: true, keyword: cleanKeyword, updated: true });
  }

  // Provision new — for now, use placeholder. Real Twilio provisioning requires API call.
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER || '+10000000000';

  const { error } = await supabaseAdmin
    .from('artist_phone_numbers')
    .insert({
      artist_id: artistId,
      phone_number: phoneNumber,
      keyword: cleanKeyword,
      is_active: true,
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, keyword: cleanKeyword, phoneNumber });
}
