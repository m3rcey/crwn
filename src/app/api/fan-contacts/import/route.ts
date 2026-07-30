import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { IMPORT_ATTESTATION_VERSION } from '@/lib/fanImportConsent';
import { recordFunnelEvent } from '@/lib/analytics/funnelEvents';

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
  const { artistId, rows, attestedPermission } = body as {
    artistId: string;
    rows: ImportRow[];
    attestedPermission?: boolean;
  };

  if (!artistId || !rows || !Array.isArray(rows)) {
    return NextResponse.json({ error: 'Missing artistId or rows' }, { status: 400 });
  }

  // The artist must explicitly attest that these contacts gave permission to be contacted.
  // Importing a file never creates consent by itself; the attestation is what CRWN records,
  // and the invite path refuses contacts imported without it.
  if (attestedPermission !== true) {
    return NextResponse.json(
      { error: 'Confirm these fans gave you permission to contact them before importing' },
      { status: 400 },
    );
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

  // Build insert records, skipping duplicates. The attestation columns come from
  // schema-phase2-fan-contacts-consent.sql; until Josh runs it, the retry below strips them
  // so imports keep working against the pre-migration schema.
  const attestedAt = new Date().toISOString();
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
      consent_attested_at: attestedAt,
      consent_attestation_version: IMPORT_ATTESTATION_VERSION,
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
    let { data, error } = await supabaseAdmin
      .from('fan_contacts')
      .insert(batch)
      .select('id');

    // PGRST204 = a column in the payload does not exist yet (the consent migration has not
    // run). Retry without the attestation columns rather than failing the whole import.
    if (error && error.code === 'PGRST204') {
      const stripped = batch.map(({ consent_attested_at: _a, consent_attestation_version: _v, ...rest }) => rest);
      ({ data, error } = await supabaseAdmin.from('fan_contacts').insert(stripped).select('id'));
    }

    if (error) {
      console.error('Import batch error:', error);
    } else {
      imported += data?.length || 0;
    }
  }

  // Funnel: Fans Imported. Deduped per artist, so only the FIRST import marks the stage;
  // later imports collapse into it. Fail-safe by construction.
  if (imported > 0) {
    await recordFunnelEvent(supabaseAdmin, {
      stage: 'fans_imported',
      artistId,
      userId: user.id,
      dedupeKey: artistId,
      metadata: { imported },
    });
  }

  return NextResponse.json({
    success: true,
    imported,
    skipped: validRows.length - imported,
    invalid: rows.length - validRows.length,
    total: rows.length,
  });
}
