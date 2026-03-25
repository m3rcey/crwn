import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { resend } from '@/lib/resend';
import { outreachEmail, resolveOutreachTokens } from '@/lib/emails/outreachEmail';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

const BASE_URL = 'https://thecrwn.app';
const CONCURRENCY = 10;

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  // Get outreach history
  const { data: outreaches } = await supabaseAdmin
    .from('crm_outreaches')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({ outreaches: outreaches || [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { subject, body, listId, statusFilter, tagFilter } = await req.json();

  if (!subject?.trim() || !body?.trim()) {
    return NextResponse.json({ error: 'Missing subject or body' }, { status: 400 });
  }

  // Build query for contacts
  let query = supabaseAdmin
    .from('crm_contacts')
    .select('id, name, email, tags');

  if (listId) query = query.eq('list_id', listId);
  if (statusFilter) query = query.eq('status', statusFilter);

  const { data: contacts } = await query;
  if (!contacts?.length) {
    return NextResponse.json({ error: 'No contacts match your filters' }, { status: 400 });
  }

  // Apply tag filter client-side (JSONB contains)
  let filtered = contacts;
  if (tagFilter) {
    filtered = contacts.filter(c => {
      const tags = (c.tags || []) as string[];
      return tags.includes(tagFilter);
    });
  }

  if (filtered.length === 0) {
    return NextResponse.json({ error: 'No contacts match your filters' }, { status: 400 });
  }

  // Filter out suppressed emails
  const emails = filtered.map(c => c.email.toLowerCase());
  const { data: suppressed } = await supabaseAdmin
    .from('email_suppressions')
    .select('email')
    .in('email', emails);
  const suppressedSet = new Set((suppressed || []).map(s => s.email));

  // Filter out contacts who unsubscribed from outreach
  const { data: unsubs } = await supabaseAdmin
    .from('crm_outreach_unsubscribes')
    .select('email')
    .in('email', emails);
  const unsubSet = new Set((unsubs || []).map(u => u.email));

  const eligible = filtered.filter(c =>
    !suppressedSet.has(c.email.toLowerCase()) &&
    !unsubSet.has(c.email.toLowerCase())
  );

  if (eligible.length === 0) {
    return NextResponse.json({ error: 'All contacts are suppressed or unsubscribed' }, { status: 400 });
  }

  // Create outreach record
  const { data: outreach, error: outreachErr } = await supabaseAdmin
    .from('crm_outreaches')
    .insert({
      admin_id: user.id,
      subject: subject.trim(),
      body: body.trim(),
      list_id: listId || null,
      status_filter: statusFilter || null,
      tag_filter: tagFilter || null,
      total_recipients: eligible.length,
      status: 'sending',
    })
    .select('id')
    .single();

  if (outreachErr || !outreach) {
    return NextResponse.json({ error: 'Failed to create outreach record' }, { status: 500 });
  }

  // Create send records
  const sendRecords = eligible.map(c => ({
    outreach_id: outreach.id,
    contact_id: c.id,
    email: c.email.toLowerCase(),
    status: 'pending',
  }));

  const { data: sends } = await supabaseAdmin
    .from('crm_outreach_sends')
    .insert(sendRecords)
    .select('id, contact_id, email');

  if (!sends?.length) {
    await supabaseAdmin.from('crm_outreaches').update({ status: 'failed' }).eq('id', outreach.id);
    return NextResponse.json({ error: 'Failed to create send records' }, { status: 500 });
  }

  // Build contact lookup
  const contactMap: Record<string, { name: string; email: string }> = {};
  eligible.forEach(c => { contactMap[c.id] = { name: c.name, email: c.email }; });

  // Send emails in batches
  let sentCount = 0;
  let failedCount = 0;

  for (let i = 0; i < sends.length; i += CONCURRENCY) {
    const batch = sends.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (send) => {
        const contact = contactMap[send.contact_id];
        if (!contact) throw new Error('Contact not found');

        const firstName = contact.name.split(' ')[0];

        const personalizedBody = resolveOutreachTokens(body.trim(), {
          name: contact.name,
          first_name: firstName,
          email: contact.email,
        });

        const personalizedSubject = resolveOutreachTokens(subject.trim(), {
          name: contact.name,
          first_name: firstName,
        });

        const unsubscribeUrl = `${BASE_URL}/api/admin/crm/outreach/unsubscribe/${send.id}`;
        const trackingPixelUrl = `${BASE_URL}/api/admin/crm/outreach/track/${send.id}?pixel=1`;

        const html = outreachEmail({
          body: personalizedBody,
          sendId: send.id,
          unsubscribeUrl,
          trackingPixelUrl,
        });

        const { data: sendResult, error } = await resend.emails.send({
          from: 'CRWN <hello@thecrwn.app>',
          to: send.email,
          subject: personalizedSubject,
          html,
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'X-Outreach-Send-Id': send.id,
          },
        });

        if (error) throw error;

        await supabaseAdmin
          .from('crm_outreach_sends')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            resend_message_id: sendResult?.id || null,
          })
          .eq('id', send.id);

        return send.id;
      })
    );

    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        sentCount++;
      } else {
        failedCount++;
        supabaseAdmin
          .from('crm_outreach_sends')
          .update({ status: 'failed' })
          .eq('id', batch[idx].id)
          .then(() => {});
      }
    });
  }

  // Update outreach record
  const finalStatus = sentCount > 0 ? 'sent' : 'failed';
  await supabaseAdmin
    .from('crm_outreaches')
    .update({
      status: finalStatus,
      sent_at: new Date().toISOString(),
      sent_count: sentCount,
      failed_count: failedCount,
    })
    .eq('id', outreach.id);

  // Auto-update leads to 'contacted' after successful send
  if (sentCount > 0) {
    const sentEmails = eligible.map(c => c.email.toLowerCase());
    await supabaseAdmin
      .from('crm_contacts')
      .update({ status: 'contacted', updated_at: new Date().toISOString() })
      .in('email', sentEmails)
      .eq('status', 'lead');
  }

  return NextResponse.json({
    success: true,
    outreachId: outreach.id,
    sent: sentCount,
    failed: failedCount,
    total: eligible.length,
    suppressed: filtered.length - eligible.length,
  });
}
