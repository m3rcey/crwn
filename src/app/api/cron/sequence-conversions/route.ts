import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

/**
 * Check pending sequence conversions.
 * For each completed sequence enrollment, check if the target action happened
 * within the attribution window (7 days after sequence completion).
 *
 * Trigger type → target action:
 * - new_subscription → fan subscribed to this artist
 * - new_purchase → fan purchased from this artist
 * - tier_upgrade → fan upgraded their tier
 * - win_back → fan resubscribed after churning
 * - starter_upgrade_nudge → artist upgraded from starter to paid
 * - post_purchase_upsell → fan made another purchase
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date().toISOString();

  // Get all unconverted records still within their window, or expired ones to close out
  const { data: pending } = await supabaseAdmin
    .from('sequence_conversions')
    .select('id, enrollment_id, sequence_id, fan_id, artist_id, trigger_type, attribution_window_end, created_at')
    .eq('converted', false)
    .is('checked_at', null)
    .limit(200);

  // Also get ones we've checked before but window hasn't expired
  const { data: rechecks } = await supabaseAdmin
    .from('sequence_conversions')
    .select('id, enrollment_id, sequence_id, fan_id, artist_id, trigger_type, attribution_window_end, created_at')
    .eq('converted', false)
    .not('checked_at', 'is', null)
    .gte('attribution_window_end', now)
    .limit(200);

  const allPending = [...(pending || []), ...(rechecks || [])];
  if (allPending.length === 0) {
    return NextResponse.json({ processed: 0, converted: 0 });
  }

  let convertedCount = 0;

  for (const record of allPending) {
    const windowExpired = new Date(record.attribution_window_end) < new Date();

    // Check for the target action based on trigger type
    let converted = false;
    let conversionAction = '';

    const enrollmentCreated = record.created_at;

    switch (record.trigger_type) {
      case 'new_subscription':
      case 'win_back': {
        // Did the fan (re)subscribe after the sequence started?
        const { data: sub } = await supabaseAdmin
          .from('subscriptions')
          .select('id, started_at')
          .eq('fan_id', record.fan_id)
          .eq('artist_id', record.artist_id)
          .eq('status', 'active')
          .gte('started_at', enrollmentCreated)
          .maybeSingle();

        if (sub) {
          converted = true;
          conversionAction = record.trigger_type === 'win_back' ? 'resubscribed' : 'subscribed';
        }
        break;
      }

      case 'new_purchase':
      case 'post_purchase_upsell': {
        // Did the fan purchase after the sequence started?
        const { data: purchase } = await supabaseAdmin
          .from('earnings')
          .select('id')
          .eq('fan_id', record.fan_id)
          .eq('artist_id', record.artist_id)
          .gte('created_at', enrollmentCreated)
          .limit(1)
          .maybeSingle();

        if (purchase) {
          converted = true;
          conversionAction = 'purchased';
        }
        break;
      }

      case 'tier_upgrade': {
        // Did the fan upgrade their tier? Check if current tier is different from enrollment start
        const { data: enrollment } = await supabaseAdmin
          .from('sequence_enrollments')
          .select('created_at')
          .eq('id', record.enrollment_id)
          .single();

        if (enrollment) {
          const { data: currentSub } = await supabaseAdmin
            .from('subscriptions')
            .select('tier_id, updated_at')
            .eq('fan_id', record.fan_id)
            .eq('artist_id', record.artist_id)
            .eq('status', 'active')
            .gte('updated_at', enrollment.created_at)
            .maybeSingle();

          if (currentSub) {
            converted = true;
            conversionAction = 'upgraded';
          }
        }
        break;
      }

      case 'starter_upgrade_nudge': {
        // Platform sequence: did the artist upgrade from starter?
        const { data: artist } = await supabaseAdmin
          .from('artist_profiles')
          .select('platform_tier')
          .eq('user_id', record.fan_id) // For platform sequences, fan_id = artist_user_id
          .single();

        if (artist && artist.platform_tier !== 'starter') {
          converted = true;
          conversionAction = 'upgraded';
        }
        break;
      }

      default:
        // Unknown trigger type — just mark as checked
        break;
    }

    if (converted) {
      await supabaseAdmin
        .from('sequence_conversions')
        .update({
          converted: true,
          conversion_action: conversionAction,
          conversion_at: now,
          checked_at: now,
        })
        .eq('id', record.id);
      convertedCount++;
    } else {
      // Update checked_at so we know we looked
      await supabaseAdmin
        .from('sequence_conversions')
        .update({ checked_at: now })
        .eq('id', record.id);
    }
  }

  return NextResponse.json({
    processed: allPending.length,
    converted: convertedCount,
  });
}
