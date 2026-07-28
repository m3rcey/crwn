import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rateLimit';
import { OYF_TOOL_KEY, isDraftToken, sanitizeOwnYourFansDraft } from '@/lib/opportunityDrafts/ownYourFansDraft';
import { getDeliverableSpec, sanitizeDeliverableValues } from '@/lib/opportunityDrafts/deliverableSpecs';

// PUBLIC continuation of an anonymous draft via its capability token (the high-entropy public_token).
// GET restores the draft after a browser refresh; PUT saves edits. BOTH act ONLY on an UNCLAIMED,
// unexpired draft row (user_id IS NULL). Once a draft is claimed at signup, the token stops working
// here (the row is read/edited through RLS ownership instead), so a leaked token can never reach a
// claimed row, and a claimed draft can never be edited anonymously.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

type Row = {
  id: string;
  tool_slug: string;
  input_data: Record<string, unknown> | null;
  result_data: Record<string, unknown> | null;
  public_token_expires_at: string | null;
};

async function loadUnclaimed(token: string): Promise<Row | null> {
  const { data } = await supabaseAdmin
    .from('lead_magnet_results')
    .select('id, tool_slug, input_data, result_data, public_token_expires_at')
    .eq('public_token', token)
    .is('user_id', null)
    .maybeSingle();
  if (!data) return null;
  const row = data as Row;
  // Only tools that actually have a pre-signup deliverable are served here.
  if (row.tool_slug !== OYF_TOOL_KEY && !getDeliverableSpec(row.tool_slug)) return null;
  if (row.public_token_expires_at && new Date(row.public_token_expires_at).getTime() < Date.now()) return null;
  return row;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const allowed = await checkRateLimit(`ip:${ip}`, 'oppdraft-get', 3600, 120);
  if (!allowed) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });

  const { token } = await params;
  if (!isDraftToken(token)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const row = await loadUnclaimed(token);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (row.tool_slug === OYF_TOOL_KEY) {
    return NextResponse.json({
      ok: true,
      toolSlug: row.tool_slug,
      inputs: { social_followers: (row.input_data?.social_followers as number) ?? 0 },
      draft: sanitizeOwnYourFansDraft(row.input_data?.builderDraft),
      result: row.result_data,
    });
  }

  const spec = getDeliverableSpec(row.tool_slug)!;
  return NextResponse.json({
    ok: true,
    toolSlug: row.tool_slug,
    deliverableType: spec.deliverableType,
    values: sanitizeDeliverableValues(spec, row.input_data?.deliverableValues),
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const allowed = await checkRateLimit(`ip:${ip}`, 'oppdraft-update', 3600, 180);
  if (!allowed) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });

  const { token } = await params;
  if (!isDraftToken(token)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: { draft?: unknown; values?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const row = await loadUnclaimed(token);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let nextInput: Record<string, unknown>;
  if (row.tool_slug === OYF_TOOL_KEY) {
    nextInput = {
      social_followers: (row.input_data?.social_followers as number) ?? 0,
      builderDraft: sanitizeOwnYourFansDraft(body.draft),
    };
  } else {
    const spec = getDeliverableSpec(row.tool_slug)!;
    nextInput = {
      deliverableType: spec.deliverableType,
      deliverableValues: sanitizeDeliverableValues(spec, body.values),
    };
  }

  // Re-assert user_id IS NULL in the UPDATE so a claim that lands between the read and the write
  // wins the race (the anonymous edit is dropped rather than overwriting a claimed row).
  const { error } = await supabaseAdmin
    .from('lead_magnet_results')
    .update({ input_data: nextInput, updated_at: new Date().toISOString() })
    .eq('id', row.id)
    .is('user_id', null);

  if (error) return NextResponse.json({ error: 'Could not save draft' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
