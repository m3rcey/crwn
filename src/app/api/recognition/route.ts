// Recognition for a set of fans, resolved SERVER-SIDE.
//
// This route exists because the browser cannot answer the question. `subscriptions` RLS
// returns only the caller's own row, so the previous client-side query populated a badge
// map containing exactly one entry: the viewer's. Every fan saw a badge beside their own
// comment and none beside anybody else's, and an anonymous reader saw none at all. The
// fix is not a policy change — opening that table would publish who pays an artist what.
// It is to answer here, with the service role, returning only labels.
//
// WHAT IS RETURNED IS A LABEL, NEVER A FACT ABOUT MONEY. No price, no spend, no start
// date, no tier id, no subscription status. A caller learns that someone is on a rung
// called "Gold", which is what the artist already displays publicly on their page, and
// nothing about what that person has paid.
//
// AND A FAN ID FROM THE REQUEST IS NOT AUTHORITY TO ASK ABOUT THAT FAN. The route is
// public on purpose (a signed-out reader of a public page must see the same badges as
// everyone else), so without a bound it would answer "is this person a member of this
// artist, and on which rung" for any user id somebody cared to paste. Every id is
// therefore intersected with the people who have actually POSTED on this artist's page.
// Disclosure then equals exactly what the page already renders, and an id that never
// posted comes back with nothing at all.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { deriveRecognition, allLabels } from '@/lib/recognition/status';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// One comment thread's worth. Bounded so a crafted query cannot ask about the whole roster
// in a single call, which is also what keeps this cheap at a thousand members.
const MAX_FANS = 100;

export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get('artistId') || '';
  const raw = req.nextUrl.searchParams.get('fanIds') || '';
  if (!artistId || !raw) return NextResponse.json({ recognition: {} });

  const asked = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))].slice(0, MAX_FANS);
  if (!asked.length) return NextResponse.json({ recognition: {} });

  // The bound. Only people with public authorship on THIS artist's page can be asked about.
  const { data: authors } = await supabaseAdmin
    .from('community_posts')
    .select('author_id')
    .eq('artist_id', artistId)
    .in('author_id', asked);

  const visible = new Set((authors || []).map((a: { author_id: string }) => a.author_id));
  const fanIds = asked.filter((id) => visible.has(id));
  if (!fanIds.length) return NextResponse.json({ recognition: {} });

  const [{ data: subs }, { data: tiers }] = await Promise.all([
    supabaseAdmin
      .from('subscriptions')
      .select('fan_id, tier_id, status, is_founder')
      .eq('artist_id', artistId)
      .in('fan_id', fanIds),
    supabaseAdmin
      .from('subscription_tiers')
      .select('id, name, price')
      .eq('artist_id', artistId)
      .eq('is_active', true)
      .order('price', { ascending: false }),
  ]);

  // Top rung by PRICE, because artists rename tiers and a name can never decide rank.
  const topTierId = (tiers || [])[0]?.id ?? null;
  const tierById = new Map((tiers || []).map((t: { id: string; name: string }) => [t.id, t.name]));

  const recognition: Record<string, { labels: string[]; dayOne: boolean; isTopTier: boolean }> = {};

  for (const s of subs || []) {
    const r = deriveRecognition({
      // is_founder may not exist pre-founder-window on some rows; absent reads as false.
      isFounder: (s as { is_founder?: boolean }).is_founder === true,
      subscriptionStatus: s.status,
      tierName: s.tier_id ? tierById.get(s.tier_id) ?? null : null,
      isTopTier: !!topTierId && s.tier_id === topTierId,
    });
    if (r.isEmpty) continue;
    recognition[s.fan_id] = { labels: allLabels(r), dayOne: r.dayOne, isTopTier: r.isTopTier };
  }

  return NextResponse.json({ recognition });
}
