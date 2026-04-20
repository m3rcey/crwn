import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Stripe from 'stripe';
import { getArtistFeePercent } from '@/lib/platformTier';
import { checkRateLimit } from '@/lib/rateLimit';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowed = await checkRateLimit(user.id, 'track-checkout', 60, 5);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const fanId = user.id;
    const body = await request.json();
    const { trackId, utmSource, utmMedium, utmCampaign } = body;

    if (!trackId) {
      return NextResponse.json({ error: 'Missing trackId' }, { status: 400 });
    }

    // Get track + artist
    const { data: track, error: trackError } = await supabase
      .from('tracks')
      .select('id, title, price, is_free, album_art_url, artist_id, artist:artist_profiles(id, user_id, slug, stripe_connect_id, profile:profiles(display_name))')
      .eq('id', trackId)
      .single();

    if (trackError || !track) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 });
    }

    if (track.is_free !== false || !track.price || track.price <= 0) {
      return NextResponse.json({ error: 'This track is not for sale' }, { status: 400 });
    }

    // Don't let a fan buy a track they already own
    const { data: existing } = await supabase
      .from('purchases')
      .select('id')
      .eq('fan_id', fanId)
      .eq('track_id', trackId)
      .eq('status', 'completed')
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'You already own this track' }, { status: 409 });
    }

    const artist = track.artist as any;
    if (!artist?.stripe_connect_id) {
      return NextResponse.json({ error: 'Artist has not connected Stripe' }, { status: 400 });
    }

    const unitAmount = track.price;
    const platformFeePercent = await getArtistFeePercent(artist.id);
    const platformFee = Math.round(unitAmount * (platformFeePercent / 100));

    const artistDisplayName = artist.profile?.display_name || '';
    const statementSuffix = artistDisplayName
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .trim()
      .substring(0, 22)
      .toUpperCase();

    const session = await stripe.checkout.sessions.create({
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: track.title,
              description: `Track by ${artistDisplayName || 'artist'}`,
              images: track.album_art_url ? [track.album_art_url] : [],
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      payment_intent_data: {
        application_fee_amount: platformFee,
        transfer_data: {
          destination: artist.stripe_connect_id,
        },
        ...(statementSuffix ? { statement_descriptor_suffix: statementSuffix } : {}),
        metadata: {
          fan_id: fanId,
          track_id: trackId,
          artist_id: track.artist_id,
          type: 'track',
          utm_source: utmSource || '',
          utm_medium: utmMedium || '',
          utm_campaign: utmCampaign || '',
        },
      },
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/${artist.slug}/track/${trackId}?purchase=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/${artist.slug}/track/${trackId}?purchase=cancelled`,
      metadata: {
        fan_id: fanId,
        track_id: trackId,
        artist_id: track.artist_id,
        type: 'track',
        utm_source: utmSource || '',
        utm_medium: utmMedium || '',
        utm_campaign: utmCampaign || '',
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Track checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
