import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { recordAudit } from '@/lib/teamSplits/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// POST /api/team-splits/accept-invite { token }
// Binds an email-invited deal to the now-signed-in user, then returns the deal id.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: 'Missing invite token' }, { status: 400 });

  const { data: deal } = await supabaseAdmin
    .from('team_split_deals')
    .select('id, collaborator_user_id, collaborator_email, created_by, status')
    .eq('invite_token', token)
    .maybeSingle();
  if (!deal) return NextResponse.json({ error: 'Invite not found or expired' }, { status: 404 });

  if (deal.created_by === user.id) {
    return NextResponse.json({ error: 'You cannot accept your own deal.' }, { status: 400 });
  }
  // Already bound to someone else.
  if (deal.collaborator_user_id && deal.collaborator_user_id !== user.id) {
    return NextResponse.json({ error: 'This invite is already claimed.' }, { status: 409 });
  }

  // SEC-003: this binding is the payout authority (the accrual cron and
  // atomic_team_split_cashout both key on collaborator_user_id), so possession of
  // the link is not enough. The accepting account must BE the invited identity.
  //
  // The proof is the Supabase Auth email from auth.getUser(), never
  // `profiles.email`: the profile mirror is self-writable, which is the whole
  // reason this finding exists. A forwarded invite now fails here instead of
  // silently binding a stranger to someone else's revenue share.
  if (deal.collaborator_email) {
    const authEmail = (user.email || '').trim().toLowerCase();
    const invitedEmail = deal.collaborator_email.trim().toLowerCase();
    if (!authEmail || authEmail !== invitedEmail) {
      return NextResponse.json(
        { error: 'This invite was sent to a different email address. Sign in with the invited account to accept it.' },
        { status: 403 },
      );
    }
    if (!user.email_confirmed_at) {
      return NextResponse.json(
        { error: 'Confirm your email address before accepting a Team Split.' },
        { status: 403 },
      );
    }
  }

  if (!deal.collaborator_user_id) {
    await supabaseAdmin.from('team_split_deals').update({ collaborator_user_id: user.id }).eq('id', deal.id);
    await recordAudit(supabaseAdmin, deal.id, user.id, 'invite_bound');
  }
  return NextResponse.json({ dealId: deal.id });
}
