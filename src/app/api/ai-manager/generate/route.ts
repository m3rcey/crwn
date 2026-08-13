import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireArtistOwner } from '@/lib/apiAuth';
import { checkRateLimit } from '@/lib/rateLimit';
import { collectArtistData } from '@/lib/ai/collectArtistData';
import { generateStarterNudges, InsightInput } from '@/lib/ai/starterNudges';
import { generateInsights } from '@/lib/ai/generateInsights';
import { buildCoachingBrief } from '@/lib/ai/coachingBrief';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

// TWO callers, TWO identities, and neither one may hold a secret it cannot keep.
//
//   1. the daily cron  -> Bearer CRON_SECRET (server to server, the secret stays server-side)
//   2. an artist hitting "Refresh" in AiManagerCard -> their SESSION COOKIE
//
// This route used to accept ONLY the cron secret. So the refresh button had to send one, from
// a CLIENT component, via NEXT_PUBLIC_CRON_SECRET. Anything prefixed NEXT_PUBLIC_ is compiled
// into the browser bundle, which means the cron secret was being served in plain text to every
// visitor. And /api/cron/weekly-payout authenticates with `Bearer ${CRON_SECRET}`, so if those
// two env vars ever held the same value, anyone reading the page source could have triggered
// the payout cron.
//
// There is no way to hide a secret in a client component. The fix is that the client must not
// have one: an artist proves who they are with the session cookie they already have.
export async function POST(req: NextRequest) {
  // Body first: requireArtistOwner needs the artistId to check ownership against.
  let artistId: string | undefined;
  try {
    ({ artistId } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (!artistId) {
    return NextResponse.json({ error: 'Missing artistId' }, { status: 400 });
  }

  const authHeader = req.headers.get('authorization');
  const isCron = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;

  // Captured from the SESSION when there is one. Never read off the request body: the constraint
  // evidence read is keyed on (artistId, userId) and a caller-supplied user id would let one
  // account assemble evidence under another's identity.
  let ownerUserId: string | null = null;

  if (!isCron) {
    // Not the cron. Then it must be the artist who OWNS this artistId, proven by session.
    // requireArtistOwner does the 401/403 for us and never trusts a caller-supplied user id.
    const owner = await requireArtistOwner(artistId);
    if (!owner.ok) return owner.error;
    ownerUserId = owner.userId;

    // Each refresh spends real money on a model call, so a logged-in artist does not get to
    // hammer it. The cron is exempt: it runs once a day by definition.
    const allowed = await checkRateLimit(owner.userId, 'ai-manager-refresh', 3600, 10);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }
  }

  try {

    const data = await collectArtistData(supabaseAdmin, artistId);

    if (!data.hasActivity) {
      return NextResponse.json({ message: 'No activity', insightsCreated: 0 });
    }

    // Check existing unread insights for dedup
    const { data: existing } = await supabaseAdmin
      .from('ai_insights')
      .select('type')
      .eq('artist_id', artistId)
      .eq('is_dismissed', false)
      .eq('is_read', false)
      .gt('expires_at', new Date().toISOString());

    const existingTypes = new Set((existing || []).map(d => d.type));

    const effectiveTier = data.platformTier;

    let insights: InsightInput[];
    if (effectiveTier === 'starter') {
      insights = generateStarterNudges(data);
    } else {
      // Z4 + Z9. This route is the artist's own "Refresh" button, and it used to run the insight
      // model with NO canonical context at all, so a manual refresh could produce exactly the
      // growth advice the engine had ruled out. The cron path is identical by construction now.
      let userId = ownerUserId;
      if (!userId) {
        const { data: row } = await supabaseAdmin
          .from('artist_profiles')
          .select('user_id')
          .eq('id', artistId)
          .maybeSingle();
        userId = row?.user_id ?? null;
      }
      const canonicalBrief = userId
        ? await buildCoachingBrief(supabaseAdmin, artistId, userId)
        : null;

      insights = await generateInsights(data, canonicalBrief);
      // Sync-match insights were removed with the synthetic sync generator (2026-08-13): every
      // row they matched against was model-fabricated, so each "submit before it's gone" nudge
      // pointed an artist at a listing that did not exist. If a REAL sync feed ever lands, its
      // insight generator should be written against that feed, not resurrected from this one.
    }

    // Insert with dedup
    const now = new Date();
    let inserted = 0;
    const insertedInsights: InsightInput[] = [];

    for (const insight of insights) {
      if (insight.type !== 'churn' && existingTypes.has(insight.type)) {
        continue;
      }

      let expiresAt: string;
      if (insight.type === 'booking_reminder' && insight.data?.expiresAt) {
        expiresAt = insight.data.expiresAt as string;
      } else {
        expiresAt = new Date(now.getTime() + FOURTEEN_DAYS_MS).toISOString();
      }

      await supabaseAdmin.from('ai_insights').insert({
        artist_id: artistId,
        type: insight.type,
        priority: insight.priority,
        title: insight.title,
        body: insight.body,
        data: insight.data || {},
        action_type: insight.action_type || null,
        action_url: insight.action_url || null,
        expires_at: expiresAt,
      });

      inserted++;
      insertedInsights.push(insight);
    }

    return NextResponse.json({
      insightsCreated: inserted,
      insights: insertedInsights,
    });
  } catch (error) {
    console.error('AI Manager generate error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
