import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Idempotency: prevent double-run in the same week
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
    const periodKey = `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;

    const { error: lockError } = await supabaseAdmin
      .from('cron_run_log')
      .insert({ job_name: 'weekly-payout', period_key: periodKey });

    if (lockError) {
      console.log('Weekly payout already ran for', periodKey);
      return NextResponse.json({ message: `Already ran for ${periodKey}` });
    }

    // Get all artists with Stripe Connect accounts
    const { data: artists } = await supabaseAdmin
      .from('artist_profiles')
      .select('id, stripe_connect_id, user_id')
      .eq('is_active', true)
      .not('stripe_connect_id', 'is', null);

    if (!artists || artists.length === 0) {
      return NextResponse.json({ message: 'No connected artists found' });
    }

    const results: { artistId: string; status: string; amount?: number; error?: string }[] = [];

    for (const artist of artists) {
      try {
        const balance = await stripe.balance.retrieve({
          stripeAccount: artist.stripe_connect_id,
        });

        const available = balance.available.reduce((sum, b) => sum + b.amount, 0);

        if (available <= 0) {
          results.push({ artistId: artist.id, status: 'skipped', amount: 0 });
          continue;
        }

        const payout = await stripe.payouts.create(
          {
            amount: available,
            currency: 'usd',
          },
          {
            stripeAccount: artist.stripe_connect_id,
          }
        );

        results.push({ artistId: artist.id, status: 'paid', amount: available });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        results.push({ artistId: artist.id, status: 'failed', error: message });
      }
    }

    const paid = results.filter(r => r.status === 'paid').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const failed = results.filter(r => r.status === 'failed').length;

    console.log(`Weekly payout complete: ${paid} paid, ${skipped} skipped, ${failed} failed`);

    return NextResponse.json({
      success: true,
      summary: { paid, skipped, failed },
      results,
    });
  } catch (err: unknown) {
    console.error('Weekly payout cron error:', err);
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 });
  }
}
