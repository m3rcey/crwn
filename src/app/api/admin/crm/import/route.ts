import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    // Handle quoted fields with commas
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    if (values.length >= 2) {
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
      rows.push(row);
    }
  }

  return rows;
}

function findField(row: Record<string, string>, candidates: string[]): string {
  for (const c of candidates) {
    if (row[c]?.trim()) return row[c].trim();
  }
  return '';
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { csv, listName, listId: existingListId } = await req.json();
  if (!csv?.trim()) return NextResponse.json({ error: 'No CSV data provided' }, { status: 400 });

  const rows = parseCSV(csv);
  if (rows.length === 0) return NextResponse.json({ error: 'No valid rows found in CSV' }, { status: 400 });

  // Create or use existing list
  let listId = existingListId;
  if (!listId && listName?.trim()) {
    const { data: list, error: listError } = await supabaseAdmin
      .from('crm_lists')
      .insert({ name: listName.trim(), description: `Imported ${rows.length} contacts` })
      .select('id')
      .single();

    if (listError) return NextResponse.json({ error: `Failed to create list: ${listError.message}` }, { status: 500 });
    listId = list.id;
  }

  // Check for existing emails to avoid duplicates
  const emails = rows.map(r => findField(r, ['email', 'email_address', 'e_mail'])).filter(Boolean);
  const { data: existing } = emails.length > 0
    ? await supabaseAdmin.from('crm_contacts').select('email').in('email', emails)
    : { data: [] };
  const existingEmails = new Set((existing || []).map(e => e.email.toLowerCase()));

  // Try to link imported contacts to existing platform artists by matching email → profile → artist_profile
  const emailToArtist: Record<string, string> = {};
  if (emails.length > 0) {
    // Get all profiles with emails (via auth admin API in batches)
    const { data: allArtists } = await supabaseAdmin
      .from('artist_profiles')
      .select('id, user_id');

    if (allArtists && allArtists.length > 0) {
      const userIds = allArtists.map(a => a.user_id);
      const userToArtist = new Map(allArtists.map(a => [a.user_id, a.id]));

      // Look up emails for these users in batches
      const batchSize = 20;
      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(id =>
            supabaseAdmin.auth.admin.getUserById(id)
              .then(r => ({ id, email: r.data.user?.email || '' }))
              .catch(() => ({ id, email: '' }))
          )
        );
        results.forEach(r => {
          if (r.email && emails.includes(r.email.toLowerCase())) {
            const artistId = userToArtist.get(r.id);
            if (artistId) emailToArtist[r.email.toLowerCase()] = artistId;
          }
        });
      }
    }
  }

  // Build contact records
  const contacts = rows
    .map(row => {
      const email = findField(row, ['email', 'email_address', 'e_mail']);
      if (!email) return null;
      if (existingEmails.has(email.toLowerCase())) return null;

      const name = findField(row, ['name', 'full_name', 'first_name', 'artist_name', 'display_name']);
      const phone = findField(row, ['phone', 'phone_number', 'mobile']);
      const instagram = findField(row, ['instagram', 'ig', 'instagram_handle', 'ig_handle']);
      const source = findField(row, ['source', 'acquisition_source', 'referral_source']) || 'import';
      const tags = findField(row, ['tags', 'tag', 'labels']);

      return {
        name: name || email.split('@')[0],
        email: email.toLowerCase(),
        phone: phone || null,
        instagram: instagram || null,
        source,
        status: 'lead' as const,
        tags: tags ? tags.split(';').map((t: string) => t.trim()).filter(Boolean) : [],
        notes: findField(row, ['notes', 'note', 'comments']) || null,
        list_id: listId || null,
        artist_profile_id: emailToArtist[email.toLowerCase()] || null,
        imported_at: new Date().toISOString(),
      };
    })
    .filter(Boolean);

  if (contacts.length === 0) {
    return NextResponse.json({ error: 'No new contacts to import (all duplicates or missing emails)' }, { status: 400 });
  }

  // Insert in batches of 50
  let imported = 0;
  let failed = 0;
  for (let i = 0; i < contacts.length; i += 50) {
    const batch = contacts.slice(i, i + 50);
    const { error } = await supabaseAdmin.from('crm_contacts').insert(batch);
    if (error) {
      failed += batch.length;
    } else {
      imported += batch.length;
    }
  }

  // Update list contact count
  if (listId) {
    const { count } = await supabaseAdmin
      .from('crm_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('list_id', listId);

    await supabaseAdmin
      .from('crm_lists')
      .update({ contact_count: count || 0 })
      .eq('id', listId);
  }

  return NextResponse.json({
    success: true,
    imported,
    skipped: rows.length - contacts.length,
    failed,
    listId,
    total: rows.length,
  });
}
