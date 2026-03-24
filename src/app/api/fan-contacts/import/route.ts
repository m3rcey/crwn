import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

const MAX_ROWS = 5000;

interface ImportRow {
  email?: string;
  name?: string;
  phone?: string;
  city?: string;
  state?: string;
  country?: string;
  tags?: string[];
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { artistId, rows } = body as { artistId: string; rows: ImportRow[] };

  if (!artistId || !rows || !Array.isArray(rows)) {
    return NextResponse.json({ error: 'Missing artistId or rows' }, { status: 400 });
  }

  // Verify ownership
  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('id', artistId)
    .eq('user_id', user.id)
    .single();
  if (!artist) return NextResponse.json({ error: 'Not your profile' }, { status: 403 });

  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Maximum ${MAX_ROWS} rows per import` }, { status: 400 });
  }

  // Filter out rows without email (email is the dedup key)
  const validRows = rows.filter(r => r.email && r.email.includes('@'));

  if (validRows.length === 0) {
    return NextResponse.json({ error: 'No valid rows with email addresses' }, { status: 400 });
  }

  // Get existing emails for this artist to deduplicate
  const emails = validRows.map(r => r.email!.toLowerCase().trim());
  const { data: existingContacts } = await supabaseAdmin
    .from('fan_contacts')
    .select('email')
    .eq('artist_id', artistId)
    .in('email', emails);

  const existingEmails = new Set((existingContacts || []).map(c => c.email?.toLowerCase()));

  // Also check against CRWN users (profiles via auth.users email)
  // We skip these — they're already in the audience via subscriptions/purchases

  // Build insert records, skipping duplicates
  const toInsert = validRows
    .filter(r => !existingEmails.has(r.email!.toLowerCase().trim()))
    .map(r => ({
      artist_id: artistId,
      email: r.email!.toLowerCase().trim(),
      name: r.name?.trim() || null,
      phone: r.phone?.trim() || null,
      city: r.city?.trim() || null,
      state: r.state?.trim() || null,
      country: r.country?.trim() || null,
      tags: r.tags || [],
      source: 'import',
    }));

  if (toInsert.length === 0) {
    return NextResponse.json({
      success: true,
      imported: 0,
      skipped: validRows.length,
      total: rows.length,
      message: 'All contacts already exist',
    });
  }

  // Batch insert (Supabase handles up to ~1000 per insert)
  let imported = 0;
  const batchSize = 500;
  for (let i = 0; i < toInsert.length; i += batchSize) {
    const batch = toInsert.slice(i, i + batchSize);
    const { data, error } = await supabaseAdmin
      .from('fan_contacts')
      .insert(batch)
      .select('id');

    if (error) {
      console.error('Import batch error:', error);
    } else {
      imported += data?.length || 0;
    }
  }

  return NextResponse.json({
    success: true,
    imported,
    skipped: validRows.length - imported,
    invalid: rows.length - validRows.length,
    total: rows.length,
  });
}
