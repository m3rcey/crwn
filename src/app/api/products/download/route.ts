// THE only route to a digital product's file.
//
// Authorization is a completed PURCHASE by this fan for this product, or ownership of the
// artist. Entitlement is derived server-side from the purchases table; nothing about the
// request decides it. The key never leaves the server, so possession of a key — or of a
// previously issued URL, which expires in five minutes — is not access.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSignedDownloadUrl } from '@/lib/r2/client';
import { checkRateLimit } from '@/lib/rateLimit';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const productId = req.nextUrl.searchParams.get('productId') || '';
  if (!productId) return NextResponse.json({ error: 'Missing productId' }, { status: 400 });

  const allowed = await checkRateLimit(user.id, 'product-download', 3600, 120);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { data: product } = await supabaseAdmin
    .from('products')
    .select('id, artist_id, title, file_key, is_active')
    .eq('id', productId)
    .maybeSingle();

  if (!product || !product.file_key) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: owner } = await supabaseAdmin
    .from('artist_profiles')
    .select('id')
    .eq('id', product.artist_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!owner) {
    // A COMPLETED purchase, by this fan, for this product. A pending or refunded row is
    // not a purchase.
    const { data: purchase } = await supabaseAdmin
      .from('purchases')
      .select('id')
      .eq('product_id', productId)
      .eq('fan_id', user.id)
      .eq('status', 'completed')
      .maybeSingle();

    if (!purchase) {
      return NextResponse.json({ error: 'This is for buyers of this item.' }, { status: 403 });
    }
  }

  const safeName = (product.title || 'download').replace(/[^a-zA-Z0-9 ._-]/g, '_');
  const url = await getSignedDownloadUrl(product.file_key, 300, safeName);
  return NextResponse.json({ url });
}
