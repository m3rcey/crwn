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
import { recordFunnelEvent } from '@/lib/analytics/funnelEvents';
import { inputsChanged, recalcProvenance, PROVENANCE_KEY } from '@/lib/acquisition/inputProvenance';

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
  const before = (result.inputData ?? {}) as Record<string, unknown>;
  const corrected: Record<string, unknown> = {
    ...before,
    monthly_listeners: listeners,
    social_followers: followers ?? 0,
    streaming_revenue_cents: streamingCents ?? 0,
  };

  // NOTHING CHANGED, NOTHING HAPPENED (2026-09-29). The result page used to post its initial
  // values 1.5s after first render, so opening a result wrote the form's empty fields in as 0,
  // stamped recalculated_at, and earned "engaged_with_result" for an artist who typed nothing.
  // The page no longer does that, but a cached old page still can, so the SERVER decides: the
  // same numbers are a no-op. No write, no event, no rescore.
  if (!inputsChanged(before, corrected)) {
    return NextResponse.json({ ok: true, unchanged: true });
  }
  // What she actually moved is hers; an absent field the form sent as 0 is a default.
  corrected[PROVENANCE_KEY] = recalcProvenance(before, corrected);

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

  // Funnel: Assumptions Changed. Deduped by result + the corrected values, so a retried request
  // with identical numbers is not counted as a second change, but a real re-edit is.
  await recordFunnelEvent(supabaseAdmin, {
    stage: 'assumptions_changed',
    calculator: result.toolSlug,
    resultId: result.id,
    dedupeKey: `${result.id}:${listeners}:${followers ?? 0}:${streamingCents ?? 0}`,
  });

  // Propagate the correction to her lead profile with DIRECT_ANSWER trust. She typed this
  // into a form, deliberately, while looking at the consequence. That outranks anything we
  // parsed out of a chat message and everything Claude inferred, and the trust ordering in
  // progressiveProfiling enforces exactly that.
  if (result.leadIdentityId) {
    // Only the fields she MOVED, and each one recorded as direct_answer in field_provenance, so
    // the profile can say where a number came from instead of defaulting to "she said so".
    const moved: Record<string, number> = {};
    if (listeners !== Number(before.monthly_listeners ?? 0)) moved.monthly_listeners = listeners;
    if (followers && followers !== Number(before.social_followers ?? 0)) moved.social_followers = followers;
    if (streamingCents && streamingCents !== Number(before.streaming_revenue_cents ?? 0)) {
      moved.streaming_revenue_cents = streamingCents;
    }
    if (Object.keys(moved).length) {
      const { data: lp } = await supabaseAdmin
        .from('lead_profiles')
        .select('field_provenance')
        .eq('lead_identity_id', result.leadIdentityId)
        .maybeSingle();
      const provenance = { ...((lp?.field_provenance as Record<string, unknown>) ?? {}) };
      const at = new Date().toISOString();
      for (const k of Object.keys(moved)) provenance[k] = { source: 'direct_answer', confidence: 1, verifiedAt: at };
      await supabaseAdmin
        .from('lead_profiles')
        .update({ ...moved, field_provenance: provenance })
        .eq('lead_identity_id', result.leadIdentityId);
    }

    // Recalculating is a real engagement signal (worth points in leadScoring): she did not
    // just glance at the number, she argued with it. Fires once per result.
    await supabaseAdmin.from('acquisition_events').insert({
      event_name: 'lead_result_recalculated',
      lead_identity_id: result.leadIdentityId,
      result_id: result.id,
      idempotency_key: `recalculated:${result.id}`,
      status: 'recorded',
    });

    // And it has to MOVE THE SCORE. Correcting an assumption is the strongest engagement
    // signal this funnel produces, and it also upgrades her numbers to direct_answer trust.
    // Both of those should change how CRWN treats her, immediately.
    const { recomputeScore } = await import('@/lib/acquisition/rescore');
    await recomputeScore(result.leadIdentityId, { sourceEvent: 'result_recalculated' });
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
