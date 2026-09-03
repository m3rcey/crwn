import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

/**
 * Push a tier's CURRENT name and description onto its existing Stripe product.
 *
 * WHY. `/api/stripe/create-price` copies both onto the Stripe product once, at creation, and
 * nothing ever updated them again. Stripe Checkout renders the product name and description
 * in its order summary, so an artist who renamed a tier or rewrote its one-line promise kept
 * selling under the old words on the page where the fan actually pays. GB The G1ft's Silver
 * still read "Basic level + Exclusive perks" at checkout months after his card had changed.
 *
 * WHAT IT WILL NOT DO. It touches product METADATA only: no price is created, read for
 * mutation, or deactivated, and no subscription is altered. Changing what someone is charged
 * needs a new price object, which this route deliberately cannot make. A tier with no Stripe
 * product (a free rung, or a paid tier whose prices are still waiting on Stripe Connect) is a
 * no-op, not an error, because `backfillTierPrices` will create that product later WITH the
 * current text.
 *
 * AUTHORITY. `tierId` is a POINTER, never authority: the tier is matched against artist
 * profiles owned by the SESSION user, and the name and description are read from the database
 * row rather than the request body, so a caller cannot write arbitrary copy onto a Stripe
 * product even for a tier they own.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const allowed = await checkRateLimit(user.id, 'sync-tier-product', 60, 10);
    if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const { tierId } = await req.json();
    if (typeof tierId !== 'string' || !tierId) {
      return NextResponse.json({ error: 'tierId required' }, { status: 400 });
    }

    // The artists this session owns. Only their tiers are reachable from here.
    const { data: owned } = await supabase
      .from('artist_profiles')
      .select('id')
      .eq('user_id', user.id);
    const ownedIds = (owned || []).map((a) => a.id);
    if (ownedIds.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: tier } = await supabase
      .from('subscription_tiers')
      .select('id, name, description, stripe_product_id, artist_id')
      .eq('id', tierId)
      .in('artist_id', ownedIds)
      .maybeSingle();
    if (!tier) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (!tier.stripe_product_id) {
      return NextResponse.json({ synced: false, reason: 'no_stripe_product' });
    }

    const name = (tier.name || '').trim();
    if (!name) return NextResponse.json({ synced: false, reason: 'no_name' });

    // Stripe clears a description with the empty string, but rejects it on create; update
    // accepts it, which is what lets an artist remove a description they no longer want.
    const description = (tier.description || '').trim();

    const product = await stripe.products.update(tier.stripe_product_id, { name, description });

    return NextResponse.json({
      synced: true,
      productId: product.id,
      name: product.name,
      description: product.description,
    });
  } catch (error) {
    console.error('sync-tier-product failed:', error);
    return NextResponse.json({ error: 'Failed to sync tier product' }, { status: 500 });
  }
}
