import { NextRequest, NextResponse } from 'next/server';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { recruiterRecurringEmail } from '@/lib/emails/recruiterRecurring';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'dummy-stripe-key-for-build');
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

/**
 * What the artist actually EARNED in the period, in cents. This is the base an influencer
 * commission is a share of.
 *
 * It is the artist's revenue, not what the artist pays CRWN. Those are different numbers by
 * an order of magnitude, and this route used to pay a percentage of the latter from a
 * hardcoded price map that had drifted into fiction (a stale copy of the Pro price).
 *
 * `earnings.net_amount` is what the artist keeps, the same basis the team-splits engine
 * uses, so an artist, a collaborator and an influencer all read one definition of revenue.
 * Refunds are written as rows with a NEGATIVE net_amount, so summing the window nets them
 * out on its own: a month that is refunded away pays no commission on money that came back.
 */
async function artistNetRevenueCents(artistId: string, from: Date, to: Date): Promise<number> {
  const PAGE = 1000;
  let total = 0;
  let offset = 0;

  // Paginated deliberately. PostgREST caps a response at 1000 rows, so a busy artist's
  // month would silently stop being counted at row 1001 and quietly underpay, which is the
  // kind of truncation that never looks like a bug, just a smaller number.
  for (;;) {
    const { data, error } = await supabaseAdmin
      .from('earnings')
      .select('net_amount')
      .eq('artist_id', artistId)
      .gte('created_at', from.toISOString())
      .lt('created_at', to.toISOString())
      .range(offset, offset + PAGE - 1);

    if (error) throw new Error(`earnings read failed for artist ${artistId}: ${error.message}`);
    if (!data || data.length === 0) break;

    total += data.reduce((sum, row) => sum + (row.net_amount || 0), 0);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  // A month whose refunds outweigh its sales must pay nothing, not a negative transfer.
  // CRWN does not claw back an influencer's earlier commission.
  return Math.max(0, total);
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

  // This runs on the 1st (cron `0 17 1 * *`), so the month being PAID FOR is the one that
  // just closed. Paying on the current month would pay for 17 hours of it.
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodLabel = periodStart.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  // Idempotency: prevent double-run in the same month
  const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { error: lockError } = await supabaseAdmin
    .from('cron_run_log')
    .insert({ job_name: 'recruiter-recurring', period_key: periodKey });

  if (lockError) {
    console.log('Recruiter recurring already ran for', periodKey);
    return NextResponse.json({ message: `Already ran for ${periodKey}` });
  }

  // Find all qualified referrals with active recurring that haven't expired
  const { data: activeReferrals } = await supabaseAdmin
    .from('artist_referrals')
    .select('id, recruiter_id, artist_id, recurring_rate, recurring_expires_at')
    .eq('status', 'qualified')
    .gt('recurring_rate', 0)
    .gt('recurring_expires_at', now.toISOString());

  if (!activeReferrals || activeReferrals.length === 0) {
    return NextResponse.json({ message: 'No recurring payouts due', processed: 0 });
  }

  let processed = 0;
  let totalPaid = 0;

  // Summary emails are built from what was ACTUALLY transferred, accumulated here as
  // it happens. They used to be built by a second pass that re-derived every amount
  // from scratch and re-applied none of the skips above, so a recruiter whose artist
  // had lapsed, or who was skipped by the partner/Pro rule, still got an email saying
  // she had earned money that was never sent.
  const paidByRecruiter = new Map<string, { amount: number; count: number }>();

  for (const referral of activeReferrals) {
    // No plan gate. The commission is a share of the artist's REVENUE, and it is funded by
    // the platform fee CRWN charges on that revenue, which exists on every plan (Free is
    // 12%, Pro is 8%). The old rules here (artist must be on an active paid plan; partners
    // earn nothing on Pro artists) were written when the commission came out of the artist's
    // SaaS fee, so a cheap plan really did mean nothing to share. Under a revenue share they
    // would just mean an influencer who brought a busy Free-tier artist earns nothing while
    // CRWN collects 12% of everything that artist makes.
    const revenue = await artistNetRevenueCents(referral.artist_id, periodStart, periodEnd);
    if (revenue === 0) continue;

    const payoutAmount = Math.round(revenue * (referral.recurring_rate / 100));
    if (payoutAmount === 0) continue;

    // Get recruiter Stripe info
    const { data: recruiter } = await supabaseAdmin
      .from('recruiters')
      .select('id, stripe_connect_id, total_earned')
      .eq('id', referral.recruiter_id)
      .single();

    if (!recruiter) continue;

    // Create payout record. The description states the base it was a share OF, so a
    // recruiter disputing an amount can check the arithmetic without asking anyone.
    const basis = `${referral.recurring_rate}% of $${(revenue / 100).toFixed(2)} artist revenue (${periodLabel})`;
    const { data: payout } = await supabaseAdmin
      .from('recruiter_payouts')
      .insert({
        recruiter_id: recruiter.id,
        artist_referral_id: referral.id,
        type: 'recurring',
        amount: payoutAmount,
        description: basis,
        status: 'pending',
      })
      .select('id')
      .single();

    // Transfer via Stripe if connected
    if (recruiter.stripe_connect_id && payout) {
      try {
        const transfer = await stripe.transfers.create({
          amount: payoutAmount,
          currency: 'usd',
          destination: recruiter.stripe_connect_id,
          description: `CRWN recurring commission: ${basis}`,
        });

        await supabaseAdmin
          .from('recruiter_payouts')
          .update({
            status: 'paid',
            stripe_transfer_id: transfer.id,
          })
          .eq('id', payout.id);

        // Update total earned
        await supabaseAdmin
          .from('recruiters')
          .update({
            total_earned: (recruiter.total_earned || 0) + payoutAmount,
          })
          .eq('id', recruiter.id);

        totalPaid += payoutAmount;

        const running = paidByRecruiter.get(recruiter.id) || { amount: 0, count: 0 };
        paidByRecruiter.set(recruiter.id, {
          amount: running.amount + payoutAmount,
          count: running.count + 1,
        });
      } catch (err) {
        console.error('Recurring transfer failed:', err);
      }
    }

    processed++;
  }

  // Send monthly summary emails to recruiters who got paid
  try {
    for (const [recruiterId, paid] of paidByRecruiter) {
      const recruiterUserId = (await supabaseAdmin.from('recruiters').select('user_id').eq('id', recruiterId).single()).data?.user_id;
      if (!recruiterUserId) continue;
      const profile = (await supabaseAdmin.from('profiles').select('display_name').eq('id', recruiterUserId).single()).data;
      const email = (await supabaseAdmin.auth.admin.getUserById(recruiterUserId)).data?.user?.email;
      if (email) {
        const firstName = (profile?.display_name || '').split(' ')[0] || 'there';
        const emailContent = recruiterRecurringEmail({
          recruiterName: firstName,
          totalAmount: paid.amount,
          referralCount: paid.count,
        });
        await resend.emails.send({ from: FROM_EMAIL, to: email, subject: emailContent.subject, html: emailContent.html });
      }
    }
  } catch (emailErr) {
    console.error('Recurring email failed:', emailErr);
  }

  return NextResponse.json({
    message: 'Recurring payouts complete',
    processed,
    totalPaid: `$${(totalPaid / 100).toFixed(2)}`,
  });
}
