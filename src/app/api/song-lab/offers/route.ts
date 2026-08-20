// Song Lab offers — GB's configurable free lead magnets, managed without deploys.
// Artist identity session-derived; an offer's enroll tier must be the caller's OWN
// FREE tier (price 0), validated here AND re-validated at claim time.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSongLabArtist } from '@/lib/songLab/server';
import {
  normalizeOfferSlug,
  safeLabPath,
  MAX_TITLE_LENGTH,
  MAX_HEADLINE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
} from '@/lib/songLab/core';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const KINDS = ['vote', 'content', 'recognition', 'other'] as const;

interface OfferFieldsOk {
  ok: true;
  fields: Record<string, unknown>;
}

async function validateOfferFields(
  artistId: string,
  body: Record<string, unknown>,
  partial: boolean,
): Promise<OfferFieldsOk | { ok: false; error: string }> {
  const fields: Record<string, unknown> = {};

  if (!partial || 'name' in body) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > MAX_TITLE_LENGTH) return { ok: false, error: 'An offer needs a name' };
    fields.name = name;
  }
  if (!partial || 'headline' in body) {
    const headline = typeof body.headline === 'string' ? body.headline.trim() : '';
    if (!headline || headline.length > MAX_HEADLINE_LENGTH) return { ok: false, error: 'An offer needs a headline' };
    fields.headline = headline;
  }
  if ('description' in body) {
    const d = typeof body.description === 'string' ? body.description.trim() : '';
    if (d.length > MAX_DESCRIPTION_LENGTH) return { ok: false, error: 'Description is too long' };
    fields.description = d || null;
  }
  if ('ctaLabel' in body) {
    const c = typeof body.ctaLabel === 'string' ? body.ctaLabel.trim() : '';
    fields.cta_label = c && c.length <= 40 ? c : 'Join free';
  }
  if (!partial || 'benefitKind' in body) {
    const kind = typeof body.benefitKind === 'string' ? body.benefitKind : 'vote';
    if (!KINDS.includes(kind as (typeof KINDS)[number])) return { ok: false, error: 'Invalid benefit kind' };
    fields.benefit_kind = kind;
  }
  if ('projectId' in body) {
    if (body.projectId === null) fields.project_id = null;
    else if (typeof body.projectId === 'string') {
      const { data } = await supabaseAdmin
        .from('song_lab_projects').select('id').eq('id', body.projectId).eq('artist_id', artistId).maybeSingle();
      if (!data) return { ok: false, error: 'Project not found' };
      fields.project_id = body.projectId;
    }
  }
  if ('decisionId' in body) {
    if (body.decisionId === null) fields.decision_id = null;
    else if (typeof body.decisionId === 'string') {
      const { data } = await supabaseAdmin
        .from('song_lab_decisions').select('id').eq('id', body.decisionId).eq('artist_id', artistId).maybeSingle();
      if (!data) return { ok: false, error: 'Decision not found' };
      fields.decision_id = body.decisionId;
    }
  }
  if ('destinationPath' in body) {
    if (body.destinationPath === null || body.destinationPath === '') fields.destination_path = null;
    else {
      const p = safeLabPath(body.destinationPath);
      if (!p) return { ok: false, error: 'Destination must be an internal CRWN path starting with /' };
      fields.destination_path = p;
    }
  }
  if ('tierId' in body) {
    if (body.tierId === null) fields.tier_id = null;
    else if (typeof body.tierId === 'string') {
      const { data: tier } = await supabaseAdmin
        .from('subscription_tiers')
        .select('id, price')
        .eq('id', body.tierId)
        .eq('artist_id', artistId)
        .eq('is_active', true)
        .maybeSingle();
      if (!tier) return { ok: false, error: 'Tier not found' };
      if (tier.price > 0) return { ok: false, error: 'A lead magnet can only enroll a FREE tier' };
      fields.tier_id = tier.id;
    }
  }
  if ('isActive' in body) fields.is_active = body.isActive === true;
  if ('campaign' in body) {
    const c = typeof body.campaign === 'string' ? body.campaign.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 64) : '';
    fields.campaign = c || null;
  }
  for (const [key, col] of [['startsAt', 'starts_at'], ['endsAt', 'ends_at']] as const) {
    if (key in body) {
      if (body[key] === null || body[key] === '') fields[col] = null;
      else if (typeof body[key] === 'string') {
        const t = new Date(body[key] as string);
        if (Number.isNaN(t.getTime())) return { ok: false, error: 'Invalid date' };
        fields[col] = t.toISOString();
      }
    }
  }
  return { ok: true, fields };
}

export async function GET() {
  const auth = await requireSongLabArtist(supabaseAdmin);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await supabaseAdmin
    .from('song_lab_offers')
    .select('*')
    .eq('artist_id', auth.artistId)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Failed to load offers' }, { status: 500 });

  return NextResponse.json({ offers: data || [], artistSlug: auth.slug });
}

export async function POST(req: NextRequest) {
  const auth = await requireSongLabArtist(supabaseAdmin);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const slug = normalizeOfferSlug(body.slug ?? body.name);
  if (!slug) return NextResponse.json({ error: 'Link slug must be 3 to 64 letters, numbers or hyphens' }, { status: 400 });

  const validated = await validateOfferFields(auth.artistId, body, false);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('song_lab_offers')
    .insert({ artist_id: auth.artistId, slug, ...validated.fields })
    .select('id, slug')
    .single();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'That link slug is already in use' }, { status: 409 });
    return NextResponse.json({ error: 'Failed to create offer' }, { status: 500 });
  }

  return NextResponse.json({ id: data.id, slug: data.slug, path: `/${auth.slug}/join/${data.slug}` });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSongLabArtist(supabaseAdmin);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const offerId = typeof body.offerId === 'string' ? body.offerId : '';
  if (!offerId) return NextResponse.json({ error: 'Missing offerId' }, { status: 400 });

  const validated = await validateOfferFields(auth.artistId, body, true);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
  const fields = { ...validated.fields, updated_at: new Date().toISOString() };

  const { data, error } = await supabaseAdmin
    .from('song_lab_offers')
    .update(fields)
    .eq('id', offerId)
    .eq('artist_id', auth.artistId)
    .select('id');
  if (error) return NextResponse.json({ error: 'Failed to update offer' }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'Offer not found' }, { status: 404 });

  return NextResponse.json({ success: true });
}
