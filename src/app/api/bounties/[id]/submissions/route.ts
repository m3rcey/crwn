import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/notifications';
import { awardFanBadge } from '@/lib/fanBadges';
import { recordFanEvent } from '@/lib/fanEvents';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { bountyWonEmail } from '@/lib/emails/bountyWon';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
);

async function getUserAndArtist() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, artistId: null };
  const { data: artist } = await supabase.from('artist_profiles').select('id').eq('user_id', user.id).single();
  return { user, artistId: artist?.id ?? null };
}

async function loadBounty(id: string) {
  const { data } = await supabaseAdmin
    .from('clip_bounties')
    .select('*, artist_profiles(user_id)')
    .eq('id', id).single();
  return data as any;
}

// POST — a clipper submits a clip  { clipUrl }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: bountyId } = await params;
  const { user } = await getUserAndArtist();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bounty = await loadBounty(bountyId);
  if (!bounty || bounty.status !== 'active') return NextResponse.json({ error: 'Bounty not open' }, { status: 400 });
  if (bounty.deadline && new Date(bounty.deadline) < new Date()) {
    return NextResponse.json({ error: 'Deadline passed' }, { status: 400 });
  }

  // Eligibility: 'subscribers' requires an active subscription to the artist
  if (bounty.eligibility === 'subscribers') {
    const { data: sub } = await supabaseAdmin
      .from('subscriptions').select('id').eq('artist_id', bounty.artist_id).eq('fan_id', user.id).eq('status', 'active').maybeSingle();
    if (!sub) return NextResponse.json({ error: 'Only subscribers can enter this bounty' }, { status: 403 });
  }

  const { clipUrl } = await req.json();
  const status = bounty.approval_required ? 'pending' : 'approved';

  const { data, error } = await supabaseAdmin
    .from('clip_bounty_submissions')
    .upsert({
      bounty_id: bountyId, clipper_id: user.id, clip_url: (clipUrl || '').trim() || null, status,
    }, { onConflict: 'bounty_id,clipper_id,clip_url', ignoreDuplicates: false })
    .select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordFanEvent(supabaseAdmin, {
    artistId: bounty.artist_id, fanId: user.id, eventType: 'bounty_submit', source: 'bounty', refKind: 'bounty', refId: bountyId,
  });
  const artistUserId = bounty.artist_profiles?.user_id;
  if (artistUserId) {
    await createNotification(supabaseAdmin, artistUserId, 'bounty_submission', `New clip for ${bounty.title}`, 'Review it in your bounty.', `/bounties/${bountyId}`).catch(() => {});
  }
  return NextResponse.json({ submission: data });
}

// PATCH — artist reviews  { submissionId, action: 'approve'|'reject'|'winner', reviewNote?, metrics? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: bountyId } = await params;
  const { user, artistId } = await getUserAndArtist();
  if (!user || !artistId) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  const bounty = await loadBounty(bountyId);
  if (!bounty || bounty.artist_id !== artistId) return NextResponse.json({ error: 'Not your bounty' }, { status: 403 });

  const { submissionId, action, reviewNote, metrics } = await req.json();
  if (!submissionId || !action) return NextResponse.json({ error: 'Missing submissionId or action' }, { status: 400 });

  const { data: submission } = await supabaseAdmin
    .from('clip_bounty_submissions').select('*').eq('id', submissionId).eq('bounty_id', bountyId).single();
  if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

  const patch: Record<string, any> = { reviewed_by: user.id };
  if (reviewNote !== undefined) patch.review_note = reviewNote;
  if (metrics) {
    if (typeof metrics.subscribers === 'number') patch.subscribers_attributed = metrics.subscribers;
    if (typeof metrics.revenue === 'number') patch.revenue_attributed = metrics.revenue;
    if (typeof metrics.clicks === 'number') patch.clicks = metrics.clicks;
  }

  if (action === 'approve') patch.status = 'approved';
  else if (action === 'reject') patch.status = 'rejected';
  else if (action === 'winner') patch.status = 'winner';

  const { data: updated, error } = await supabaseAdmin
    .from('clip_bounty_submissions').update(patch).eq('id', submissionId).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Winner → non-cash award (badge + notification). No payout in v1.
  if (action === 'winner') {
    let badgeKey: string | null = null;
    if (bounty.reward_type === 'badge') {
      const key: string = bounty.reward_badge_key || 'bounty_winner';
      badgeKey = key;
      await awardFanBadge(supabaseAdmin, {
        artistId: bounty.artist_id, fanId: submission.clipper_id, badgeKey: key,
        source: 'bounty', sourceId: bountyId, notify: false,
      });
    }
    await supabaseAdmin.from('clip_bounty_awards').insert({
      bounty_id: bountyId, submission_id: submissionId, clipper_id: submission.clipper_id,
      reward_type: bounty.reward_type, reward_detail: bounty.reward_detail, badge_key: badgeKey, status: 'awarded',
    });
    await createNotification(
      supabaseAdmin, submission.clipper_id, 'bounty_won',
      `🏆 You won: ${bounty.title}`,
      bounty.reward_detail || 'Your clip took the bounty.',
      '/earn',
    ).catch(() => {});

    // Best-effort: email the winning clipper. Never let a send failure break the route.
    try {
      const { data: winnerData } = await supabaseAdmin.auth.admin.getUserById(submission.clipper_id);
      const winnerEmail = winnerData?.user?.email;
      if (winnerEmail) {
        const { subject, html } = bountyWonEmail({
          clipperName: null,
          bountyTitle: bounty.title,
          artistName: null,
          rewardLabel: bounty.reward_detail || null,
        });
        await resend.emails.send({ from: FROM_EMAIL, to: winnerEmail, subject, html });
      }
    } catch (e) {
      console.error('bountyWon email failed:', e);
    }
  }

  return NextResponse.json({ submission: updated });
}
