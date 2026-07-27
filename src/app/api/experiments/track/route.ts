import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  getRunningExperimentForExperience,
  resolveVariant,
  recordExperimentEvent,
} from '@/lib/experiments/server';
import { isKnownExperience } from '@/lib/experiments/registry';
import { isTaxonomyEvent } from '@/lib/experiments/taxonomy';

// PUBLIC, feature-flagged experiment sink. When no experiment is running for the experience (the
// default), this no-ops and returns { active: false } so there is ZERO behavior change. The variant
// is ALWAYS derived server-side from the durable anon id (the client can never choose its own arm).
// Never accepts email/phone/tokens or any PII; only non-sensitive attribution dimensions.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const AID_RE = /^[A-Za-z0-9_-]{6,64}$/;

export async function POST(req: NextRequest) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const allowed = await checkRateLimit(`ip:${ip}`, 'exp-track', 3600, 300);
  if (!allowed) return NextResponse.json({ active: false }, { status: 429 });

  let body: {
    aid?: string;
    experienceKey?: string;
    eventName?: string;
    dedupeKey?: string;
    dims?: Record<string, unknown>;
    valueCents?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ active: false }, { status: 400 });
  }

  const aid = String(body.aid || '');
  const experienceKey = String(body.experienceKey || '');
  const eventName = String(body.eventName || '');
  const reserved = eventName === 'assigned' || eventName === 'exposed';

  if (!AID_RE.test(aid) || !isKnownExperience(experienceKey) || (!reserved && !isTaxonomyEvent(eventName))) {
    return NextResponse.json({ active: false }, { status: 400 });
  }

  // Resolve the running experiment for this experience. None -> dark, no record, no behavior change.
  const exp = await getRunningExperimentForExperience(supabaseAdmin, experienceKey);
  if (!exp) return NextResponse.json({ active: false });

  const variant = resolveVariant(aid, exp);

  // Link to the authenticated user ONLY from the session cookie, never from the client body.
  let userId: string | null = null;
  try {
    const supa = await createServerSupabaseClient();
    const { data } = await supa.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }

  const dims = (body.dims && typeof body.dims === 'object' ? body.dims : {}) as Record<string, unknown>;
  const s = (v: unknown): string | null => (typeof v === 'string' && v ? v.slice(0, 200) : null);

  await recordExperimentEvent(supabaseAdmin, {
    aid,
    experimentKey: exp.config.key,
    experienceKey,
    variantKey: variant,
    configVersion: exp.configVersion,
    eventName,
    userId,
    toolKey: s(dims.toolKey),
    opportunityKey: s(dims.opportunityKey),
    sourceVideo: s(dims.sourceVideo),
    campaign: s(dims.campaign),
    keyword: s(dims.keyword),
    leadMagnet: s(dims.leadMagnet),
    valueCents: typeof body.valueCents === 'number' ? body.valueCents : null,
    // Dedup exposure/stage per aid+experiment+event unless the caller supplies a finer key.
    dedupeKey: s(body.dedupeKey) || `${aid}:${exp.config.key}:${eventName}`,
  });

  return NextResponse.json({ active: true, experimentKey: exp.config.key, variant, configVersion: exp.configVersion });
}
