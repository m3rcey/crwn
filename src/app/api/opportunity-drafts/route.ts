import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rateLimit';
import { getTool, type LeadProfileValues } from '@/lib/acquisition/toolAdapters';
import { generatePublicToken } from '@/lib/leadMagnets/server';
import {
  OYF_TOOL_KEY,
  sanitizeOwnYourFansDraft,
  sanitizeOwnYourFansInputs,
} from '@/lib/opportunityDrafts/ownYourFansDraft';
import { getDeliverableSpec, sanitizeDeliverableValues } from '@/lib/opportunityDrafts/deliverableSpecs';

// PUBLIC, no auth (middleware excludes /api). The "public validated draft creation" capability: an
// anonymous artist saves the deliverable they are building BEFORE signup, for ANY tool that has a
// deliverable spec.
//
// It stores ONLY non-sensitive planning copy, allowlisted and bounded by that tool's spec. It never
// takes an email/phone, never creates a Stripe/Connect/product/price/subscription, never publishes,
// never touches fan data, and never activates a reward or a payout. The row lands in
// lead_magnet_results as an UNCLAIMED draft (user_id + artist_id NULL, status 'draft'), so the
// EXISTING claim path (autoClaimForUser via the signup user_metadata token) binds it later.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const TOKEN_TTL_DAYS = 30;

export async function POST(req: NextRequest) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const allowed = await checkRateLimit(`ip:${ip}`, 'oppdraft-create', 3600, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });

  let body: { toolSlug?: string; inputs?: unknown; draft?: unknown; values?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Own Your Fans keeps its purpose-built fan-page draft shape (already live).
  const isOyf = !body.toolSlug || body.toolSlug === OYF_TOOL_KEY;
  if (isOyf && body.draft !== undefined) {
    const inputs = sanitizeOwnYourFansInputs(body.inputs);
    const draft = sanitizeOwnYourFansDraft(body.draft);

    let result;
    try {
      const tool = getTool(OYF_TOOL_KEY);
      if (!tool) throw new Error('tool missing');
      result = tool.execute(inputs as unknown as LeadProfileValues);
    } catch {
      return NextResponse.json({ error: 'Could not generate result' }, { status: 400 });
    }

    const publicToken = generatePublicToken();
    const { error } = await supabaseAdmin.from('lead_magnet_results').insert({
      tool_slug: OYF_TOOL_KEY,
      status: 'draft',
      source: 'public',
      title: result.headline.slice(0, 200),
      input_data: { social_followers: inputs.social_followers, builderDraft: draft },
      result_data: result as unknown as Record<string, unknown>,
      generator_version: result.generatorVersion,
      public_token: publicToken,
      public_token_expires_at: new Date(Date.now() + TOKEN_TTL_DAYS * 86400_000).toISOString(),
    });
    if (error) return NextResponse.json({ error: 'Could not save draft' }, { status: 500 });
    return NextResponse.json({ ok: true, token: publicToken });
  }

  // Every other tool: the generic, spec-validated deliverable draft.
  const spec = getDeliverableSpec(String(body.toolSlug || ''));
  if (!spec) return NextResponse.json({ error: 'Unknown tool' }, { status: 404 });

  const values = sanitizeDeliverableValues(spec, body.values);
  const publicToken = generatePublicToken();

  const { error } = await supabaseAdmin.from('lead_magnet_results').insert({
    tool_slug: spec.toolSlug,
    status: 'draft',
    source: 'public',
    title: spec.title.slice(0, 200),
    // Non-sensitive planning copy only, bounded by the spec's own field allowlist.
    input_data: { deliverableType: spec.deliverableType, deliverableValues: values },
    result_data: {},
    generator_version: spec.deliverableType,
    public_token: publicToken,
    public_token_expires_at: new Date(Date.now() + TOKEN_TTL_DAYS * 86400_000).toISOString(),
  });

  if (error) return NextResponse.json({ error: 'Could not save draft' }, { status: 500 });
  return NextResponse.json({ ok: true, token: publicToken });
}
