import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export async function POST(req: NextRequest) {
  try {
    const { subscriptionId, action } = await req.json();

    if (!subscriptionId || !['pause', 'resume'].includes(action)) {
      return NextResponse.json({ error: 'Missing subscriptionId or invalid action' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find the subscription
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('id, stripe_subscription_id, fan_id')
      .eq('id', subscriptionId)
      .eq('fan_id', user.id)
      .single();

    if (!sub?.stripe_subscription_id) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    if (action === 'pause') {
      // Pause collection for 30 days — fan keeps access but billing stops
      const resumeDate = new Date();
      resumeDate.setDate(resumeDate.getDate() + 30);

      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        pause_collection: {
          behavior: 'keep_as_draft',
          resumes_at: Math.floor(resumeDate.getTime() / 1000),
        },
      });

      await supabaseAdmin
        .from('subscriptions')
        .update({
          status: 'paused',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sub.id);

      return NextResponse.json({ success: true, action: 'paused', resumesAt: resumeDate.toISOString() });

    } else {
      // Resume — remove pause
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        pause_collection: '',
      } as Parameters<typeof stripe.subscriptions.update>[1]);

      await supabaseAdmin
        .from('subscriptions')
        .update({
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sub.id);

      return NextResponse.json({ success: true, action: 'resumed' });
    }
  } catch (error: unknown) {
    console.error('Pause subscription error:', error);
    const message = error instanceof Error ? error.message : 'Failed to process';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
