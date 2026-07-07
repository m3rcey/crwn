import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/notifications';
import { awardFanBadge } from '@/lib/fanBadges';
import { recordFanEvent } from '@/lib/fanEvents';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
);

async function getUserAndArtist() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, artistId: null };
  const { data: artist } = await supabase
    .from('artist_profiles').select('id').eq('user_id', user.id).single();
  return { user, artistId: artist?.id ?? null };
}

async function loadSquad(squadId: string) {
  const { data } = await supabaseAdmin
    .from('artist_squads')
    .select('id, artist_id, name, badge_key, visibility, status, artist_profiles(user_id)')
    .eq('id', squadId).single();
  return data as any;
}

async function grantBadgeIfAny(squad: any, fanId: string) {
  if (squad?.badge_key) {
    await awardFanBadge(supabaseAdmin, {
      artistId: squad.artist_id, fanId, badgeKey: squad.badge_key,
      source: 'squad', sourceId: squad.id, notify: false,
    });
  }
}

// POST /api/squads/[id]/members
//   artist: { fanId, role?, status? }   fan self-serve: { apply: true }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: squadId } = await params;
  const { user, artistId } = await getUserAndArtist();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const squad = await loadSquad(squadId);
  if (!squad || squad.status === 'archived') return NextResponse.json({ error: 'Squad not available' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const isOwner = artistId && squad.artist_id === artistId;

  // --- Fan applies / joins ---
  if (body.apply) {
    if (!['application', 'public'].includes(squad.visibility)) {
      return NextResponse.json({ error: 'This squad is not open to applications' }, { status: 403 });
    }
    const status = squad.visibility === 'public' ? 'active' : 'applied';
    const { data, error } = await supabaseAdmin
      .from('artist_squad_members')
      .upsert({
        squad_id: squadId, fan_id: user.id, role: 'member', status,
        joined_at: status === 'active' ? new Date().toISOString() : null,
      }, { onConflict: 'squad_id,fan_id', ignoreDuplicates: false })
      .select('*').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (status === 'active') await grantBadgeIfAny(squad, user.id);
    // Notify the artist of a new applicant/member
    const artistUserId = squad.artist_profiles?.user_id;
    if (artistUserId) {
      await createNotification(
        supabaseAdmin, artistUserId, 'squad_application',
        status === 'active' ? `New ${squad.name} member` : `New application to ${squad.name}`,
        status === 'active' ? 'A fan joined your squad.' : 'Review the application in your squad.',
        `/squads/${squadId}`,
      ).catch(() => {});
    }
    return NextResponse.json({ member: data });
  }

  // --- Artist adds / invites a fan ---
  if (!isOwner) return NextResponse.json({ error: 'Not your squad' }, { status: 403 });
  const fanId = body.fanId;
  if (!fanId) return NextResponse.json({ error: 'Missing fanId' }, { status: 400 });
  const status = body.status === 'invited' ? 'invited' : 'active';
  const role = ['member', 'captain', 'mod', 'manager'].includes(body.role) ? body.role : 'member';

  const { data, error } = await supabaseAdmin
    .from('artist_squad_members')
    .upsert({
      squad_id: squadId, fan_id: fanId, role, status,
      invited_by: user.id,
      approved_by: status === 'active' ? user.id : null,
      joined_at: status === 'active' ? new Date().toISOString() : null,
    }, { onConflict: 'squad_id,fan_id', ignoreDuplicates: false })
    .select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (status === 'active') {
    await grantBadgeIfAny(squad, fanId);
    await recordFanEvent(supabaseAdmin, {
      artistId: squad.artist_id, fanId, eventType: 'custom', source: 'squad', refKind: 'squad', refId: squadId,
    });
  }
  await createNotification(
    supabaseAdmin, fanId,
    status === 'invited' ? 'squad_invite' : 'squad_joined',
    status === 'invited' ? `You're invited to ${squad.name}` : `You're in ${squad.name}`,
    status === 'invited' ? 'Tap to accept your squad invite.' : 'Welcome to the squad.',
    '/my-squads',
  ).catch(() => {});

  return NextResponse.json({ member: data });
}

// PATCH /api/squads/[id]/members  { memberId, role?, status? }
// Artist promotes/demotes/approves/rejects/removes; fan can accept/decline their own invite.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: squadId } = await params;
  const { user, artistId } = await getUserAndArtist();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const squad = await loadSquad(squadId);
  if (!squad) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const isOwner = artistId && squad.artist_id === artistId;

  const { memberId, role, status, accept } = await req.json();
  if (!memberId) return NextResponse.json({ error: 'Missing memberId' }, { status: 400 });

  const { data: member } = await supabaseAdmin
    .from('artist_squad_members').select('*').eq('id', memberId).eq('squad_id', squadId).single();
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

  // Fan accepting/declining their own invite
  if (!isOwner) {
    if (member.fan_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const newStatus = accept ? 'active' : 'removed';
    const { data } = await supabaseAdmin
      .from('artist_squad_members')
      .update({ status: newStatus, joined_at: accept ? new Date().toISOString() : null })
      .eq('id', memberId).select('*').single();
    if (accept) await grantBadgeIfAny(squad, member.fan_id);
    return NextResponse.json({ member: data });
  }

  // Artist updates role/status (approve/reject/promote/demote/remove)
  const patch: Record<string, any> = {};
  if (role && ['member', 'captain', 'mod', 'manager'].includes(role)) patch.role = role;
  if (status && ['invited', 'applied', 'active', 'removed', 'rejected'].includes(status)) {
    patch.status = status;
    if (status === 'active') { patch.approved_by = user.id; patch.joined_at = member.joined_at || new Date().toISOString(); }
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('artist_squad_members').update(patch).eq('id', memberId).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (patch.status === 'active') {
    await grantBadgeIfAny(squad, member.fan_id);
    await createNotification(
      supabaseAdmin, member.fan_id, 'squad_joined', `You're in ${squad.name}`, 'Your application was approved.', '/my-squads',
    ).catch(() => {});
  }
  return NextResponse.json({ member: data });
}
