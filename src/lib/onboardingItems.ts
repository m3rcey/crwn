import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { validateUpload, audioContentType } from '@/lib/uploadValidation';
import type { ProductType } from '@/types';

type Supa = ReturnType<typeof createBrowserSupabaseClient>;
type Result = { error?: string };

function fireMilestone(milestone: string) {
  fetch('/api/admin/milestone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ milestone }),
  }).catch(() => {});
}

/**
 * Minimal, onboarding-only create helpers. Each mirrors the create path of the
 * full dashboard manager (TierManager / TrackUploadForm / ShopManager) but only
 * the fields the wizard collects one-at-a-time; everything else takes the same
 * defaults the managers use. Deeper options live in the dashboard tabs.
 */

async function readAudioDuration(file: File): Promise<number> {
  try {
    const el = new Audio();
    const url = URL.createObjectURL(new Blob([file], { type: file.type }));
    return await new Promise<number>((resolve) => {
      el.addEventListener('loadedmetadata', () => {
        URL.revokeObjectURL(url);
        resolve(Math.round(el.duration) || 180);
      });
      el.addEventListener('error', () => {
        URL.revokeObjectURL(url);
        resolve(180);
      });
      setTimeout(() => {
        URL.revokeObjectURL(url);
        resolve(180);
      }, 3000);
      el.src = url;
    });
  } catch {
    return 180;
  }
}

// First track is FREE (best for discovery — matches the old tour guidance). Access
// tiers/pricing are set later in the Music tab.
export async function createOnboardingTrack(
  supabase: Supa,
  artistId: string,
  { audioFile, title }: { audioFile: File; title: string }
): Promise<Result> {
  const check = validateUpload(audioFile, 'audio');
  if (!check.valid) return { error: check.error || 'Invalid audio file' };

  const duration = await readAudioDuration(audioFile);
  const ext = audioFile.name.split('.').pop();
  const path = `${artistId}/${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from('audio')
    .upload(path, audioFile, { contentType: audioContentType(audioFile.name, audioFile.type) });
  if (upErr) return { error: `Upload failed: ${upErr.message}` };

  const {
    data: { publicUrl },
  } = supabase.storage.from('audio').getPublicUrl(path);

  const { error } = await supabase.from('tracks').insert({
    artist_id: artistId,
    title: title.trim(),
    audio_url_128: publicUrl,
    audio_url_320: publicUrl,
    duration,
    is_free: true,
    allowed_tier_ids: [],
    price: null,
  });
  if (error) return { error: error.message };

  fireMilestone('first_track_uploaded');
  return {};
}

// Creates the tier ROW only — no Stripe prices. During onboarding the artist
// hasn't connected Stripe yet (and /api/stripe/create-price hard-requires a
// connected account), so we defer price creation. Paid tiers get their Stripe
// prices backfilled automatically the moment the artist connects Stripe — see
// backfillTierPrices() in /api/stripe/connect/status. Free tiers (price 0) never
// need a Stripe price. This is the "connect Stripe later, never a hard block"
// promise the wizard makes.
export async function createOnboardingTier(
  supabase: Supa,
  artistId: string,
  { name, priceCents, benefits = [] }: { name: string; priceCents: number; benefits?: string[] }
): Promise<Result> {
  // Benefits land in access_config.benefits — the public tier card merges these
  // in as "legacy benefits" ([slug]/page.tsx), so they render for fans.
  const cleanBenefits = benefits.map((b) => b.trim()).filter(Boolean);
  const { error } = await supabase.from('subscription_tiers').insert({
    artist_id: artistId,
    name: name.trim(),
    price: priceCents,
    description: '',
    access_config: { benefits: cleanBenefits },
    stripe_price_id: null,
    stripe_annual_price_id: null,
    stripe_product_id: null,
    offers_annual: true,
    annual_discount_percent: 25,
  });
  if (error) return { error: error.message };

  fireMilestone('tiers_created');
  return {};
}

export async function createOnboardingProduct(
  supabase: Supa,
  artistId: string,
  { type, title, priceCents }: { type: ProductType; title: string; priceCents: number }
): Promise<Result> {
  const { error } = await supabase.from('products').insert({
    artist_id: artistId,
    title: title.trim(),
    description: null,
    image_url: null,
    type,
    price: priceCents,
    access_level: 'public',
    is_free: priceCents === 0,
    allowed_tier_ids: [],
    delivery_type: type === 'experience' ? 'scheduled' : type === 'physical' ? 'shipped' : 'instant',
    file_url: null,
    is_active: true,
  });
  if (error) return { error: error.message };

  return {};
}
