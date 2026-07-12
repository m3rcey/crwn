// Persist a correction to a personalized result.
//
// THE CLIENT'S NUMBERS ARE INPUTS, NEVER OUTPUTS. The browser sends what she typed. This
// route re-runs the SAME calculator the rest of CRWN uses and stores what IT produced. A
// result row must never contain a figure a browser computed, because a browser is a thing an
// attacker owns.
//
// AUTH: the token IS the authorization. It is 32 bytes of entropy, stored hashed, and it only
// ever grants the ability to edit the one result it points at. There is nothing here to
// escalate: no account is touched, no PII is read back, and the worst a stolen token buys you
// is the ability to change a stranger's estimate of her own Spotify numbers.
//
// original_input_data is NEVER written. That snapshot is what she first told us, and it stays
// true forever. input_data is the living one.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getResultByToken } from '@/lib/leadResults/resultAccess';
import { getTool } from '@/lib/acquisition/toolAdapters';
import { checkRateLimit } from '@/lib/rateLimit';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// The same sanity ceilings the field registry uses. A value above these is a typo or an
// attack, and either way we reject rather than store.
const MAX_AUDIENCE = 100_000_000;
const MAX_CENTS = 1_000_000_00;

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  // Keyed on the token, not the IP: she is one person on one page, and a slider drag should
  // not be able to hammer the database.
  const allowed = await checkRateLimit(`res:${token.slice(0, 24)}`, 'lead-recalc', 60, 20);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const lookup = await getResultByToken(token);
  if (!lookup.ok) {
    // Same opaque answer for invalid / expired / revoked. No oracle.
    return NextResponse.json({ error: 'Not available' }, { status: 404 });
  }

  const result = lookup.result;

  let body: { listeners?: unknown; followers?: unknown; streamingCents?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const listeners = clampInt(body.listeners, MAX_AUDIENCE);
  const followers = clampInt(body.followers, MAX_AUDIENCE);
  const streamingCents = clampInt(body.streamingCents, MAX_CENTS);

  if (listeners === null) {
    return NextResponse.json({ error: 'Invalid listeners' }, { status: 400 });
  }

  const tool = getTool(result.toolSlug);
  if (!tool) return NextResponse.json({ error: 'Unknown tool' }, { status: 400 });

  // Her corrected profile.
  const corrected = {
    ...(result.inputData as Record<string, unknown>),
    monthly_listeners: listeners,
    social_followers: followers ?? 0,
    streaming_revenue_cents: streamingCents ?? 0,
  };

  // Re-run the EXISTING engine on the SERVER. This is the same leadCalculator.calculate()
  // that /worth and the homepage use, so a corrected result and a fresh one are the same
  // computation, and neither one trusts the browser.
  const regenerated = tool.execute(corrected);

  const { error } = await supabaseAdmin
    .from('lead_magnet_results')
    .update({
      // input_data moves. original_input_data does NOT: it is what she first told us and it
      // stays true forever, so we can always see what she corrected and by how much.
      input_data: corrected,
      result_data: regenerated,
      recalculated_at: new Date().toISOString(),
      title: regenerated.headline,
    })
    .eq('id', result.id);

  if (error) {
    console.error('[acquisition] recalculate failed:', error.code);
    return NextResponse.json({ error: 'Could not save' }, { status: 500 });
  }

  // Propagate the correction to her lead profile with DIRECT_ANSWER trust. She typed this
  // into a form, deliberately, while looking at the consequence. That outranks anything we
  // parsed out of a chat message and everything Claude inferred, and the trust ordering in
  // progressiveProfiling enforces exactly that.
  if (result.leadIdentityId) {
    await supabaseAdmin
      .from('lead_profiles')
      .update({
        monthly_listeners: listeners,
        ...(followers ? { social_followers: followers } : {}),
        ...(streamingCents ? { streaming_revenue_cents: streamingCents } : {}),
      })
      .eq('lead_identity_id', result.leadIdentityId);

    // Recalculating is a real engagement signal (worth points in leadScoring): she did not
    // just glance at the number, she argued with it. Fires once per result.
    await supabaseAdmin.from('acquisition_events').insert({
      event_name: 'lead_result_recalculated',
      lead_identity_id: result.leadIdentityId,
      result_id: result.id,
      idempotency_key: `recalculated:${result.id}`,
      status: 'recorded',
    });
  }

  return NextResponse.json({ ok: true });
}

/** Returns null on anything that is not a sane non-negative integer within bounds. */
function clampInt(v: unknown, max: number): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v, 10) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (n < 0 || n > max) return null;
  return n;
}
