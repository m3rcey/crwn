import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

// Default sequences every artist gets automatically.
// Each sequence is pre-written with token placeholders that the cron job resolves.
const DEFAULT_SEQUENCES: {
  name: string;
  trigger_type: string;
  steps: { delay_days: number; subject: string; body: string }[];
}[] = [
  {
    name: 'Welcome Series',
    trigger_type: 'new_subscription',
    steps: [
      {
        delay_days: 0,
        subject: 'Welcome to the family, {{first_name}} 🎵',
        body: `Hey {{first_name}},\n\nThank you for subscribing to {{artist_name}}. You just made my day.\n\nHere's what you get as a subscriber:\n• Early access to new releases\n• Exclusive tracks and content\n• Direct connection with me\n\nGo check out what's waiting for you — I think you'll love it.\n\nTalk soon,\n{{artist_name}}`,
      },
      {
        delay_days: 3,
        subject: 'Have you heard this yet?',
        body: `Hey {{first_name}},\n\nJust wanted to make sure you didn't miss the exclusive tracks in your library. Some of my best work is only available to subscribers like you.\n\nHead over and hit play — I'd love to know what you think.\n\n— {{artist_name}}`,
      },
    ],
  },
  {
    name: 'Abandoned Cart Recovery',
    trigger_type: 'abandoned_cart',
    steps: [
      {
        delay_days: 0,
        subject: 'You left something behind 👀',
        body: `Hey {{first_name}},\n\nLooks like you were about to support {{artist_name}} but didn't finish checking out.\n\nNo pressure — but if something went wrong or you had questions, just reply to this email. I'm here.\n\nIf you're ready to jump back in, here's your link:\nhttps://thecrwn.app/{{artist_slug}}\n\n— {{artist_name}}`,
      },
      {
        delay_days: 1,
        subject: 'Still thinking about it?',
        body: `Hey {{first_name}},\n\nJust a quick nudge — your checkout with {{artist_name}} is still waiting.\n\nSubscribers get access to exclusive music, early drops, and a direct line to me. I'd love to have you on the team.\n\nhttps://thecrwn.app/{{artist_slug}}\n\n— {{artist_name}}`,
      },
      {
        delay_days: 3,
        subject: 'Last call — don\'t miss out',
        body: `Hey {{first_name}},\n\nThis is my last nudge, I promise. 😄\n\nIf {{artist_name}}'s music spoke to you, subscribing is the best way to stay connected and hear everything first.\n\nNo hard feelings either way — but the door's open:\nhttps://thecrwn.app/{{artist_slug}}\n\n— {{artist_name}}`,
      },
    ],
  },
  {
    name: 'Win-Back Campaign',
    trigger_type: 'win_back',
    steps: [
      {
        delay_days: 1,
        subject: 'We miss you, {{first_name}} 💛',
        body: `Hey {{first_name}},\n\nI noticed you canceled your subscription. No hard feelings at all — but I wanted you to know the door is always open.\n\nIf there's anything I could do better, I genuinely want to hear it. Just reply to this email.\n\nEither way, thanks for the support while you were here. It meant a lot.\n\n— {{artist_name}}`,
      },
      {
        delay_days: 5,
        subject: 'New music you might have missed',
        body: `Hey {{first_name}},\n\nI've been working on new stuff since you left, and I think you'd really dig it.\n\nSubscribers are hearing it first — and I'd love for you to be one of them again.\n\nCheck it out: https://thecrwn.app/{{artist_slug}}\n\n— {{artist_name}}`,
      },
      {
        delay_days: 14,
        subject: 'One more thing...',
        body: `Hey {{first_name}},\n\nLast time I'll reach out about this — I just wanted you to know there's always a spot for you.\n\nIf you ever want to come back, it's one click:\nhttps://thecrwn.app/{{artist_slug}}\n\nMuch love,\n{{artist_name}}`,
      },
    ],
  },
  {
    name: 'Post-Purchase Upsell',
    trigger_type: 'post_purchase_upsell',
    steps: [
      {
        delay_days: 1,
        subject: 'Thanks for your purchase, {{first_name}} 🙏',
        body: `Hey {{first_name}},\n\nThanks for the support — it really means the world.\n\nDid you know you can get access to ALL my exclusive music and future drops by subscribing? It's the best way to stay plugged in.\n\nCheck out the tiers: https://thecrwn.app/{{artist_slug}}\n\n— {{artist_name}}`,
      },
      {
        delay_days: 4,
        subject: 'Want more? Here\'s how',
        body: `Hey {{first_name}},\n\nSince you grabbed something from my shop, I think you'd love what subscribers get — early access to releases, exclusive tracks, and more.\n\nIf you're feeling it:\nhttps://thecrwn.app/{{artist_slug}}\n\n— {{artist_name}}`,
      },
    ],
  },
  {
    name: 'Inactive Subscriber Re-engagement',
    trigger_type: 'inactive_subscriber',
    steps: [
      {
        delay_days: 0,
        subject: 'Hey {{first_name}}, been a minute 👋',
        body: `Hey {{first_name}},\n\nI noticed it's been a while since you checked in. Just wanted to let you know there's new music and content waiting for you.\n\nCome take a listen — I dropped some things I think you'll really enjoy.\n\nhttps://thecrwn.app/{{artist_slug}}\n\n— {{artist_name}}`,
      },
      {
        delay_days: 5,
        subject: 'Your exclusive content is waiting',
        body: `Hey {{first_name}},\n\nAs a subscriber, you have access to tracks and content most people never hear. Don't let it go to waste!\n\nHit play: https://thecrwn.app/{{artist_slug}}\n\n— {{artist_name}}`,
      },
    ],
  },
  {
    name: 'Tier Upgrade Nudge',
    trigger_type: 'tier_upgrade',
    steps: [
      {
        delay_days: 0,
        subject: 'Welcome to {{tier_name}} 🔥',
        body: `Hey {{first_name}},\n\nYou just upgraded and I'm hyped about it. {{tier_name}} unlocks even more exclusive content, early drops, and perks.\n\nMake sure you check out everything that's now available to you.\n\nThank you for believing in what I'm building.\n\n— {{artist_name}}`,
      },
    ],
  },
];

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { artistId } = body;
  if (!artistId) return NextResponse.json({ error: 'Missing artistId' }, { status: 400 });

  // Verify ownership
  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id, slug')
    .eq('id', artistId)
    .eq('user_id', user.id)
    .single();
  if (!artist) return NextResponse.json({ error: 'Not your profile' }, { status: 403 });

  // Check which trigger types already have sequences (don't duplicate)
  const { data: existing } = await supabaseAdmin
    .from('sequences')
    .select('trigger_type')
    .eq('artist_id', artistId);

  const existingTypes = new Set((existing || []).map(s => s.trigger_type));

  let seeded = 0;

  for (const template of DEFAULT_SEQUENCES) {
    if (existingTypes.has(template.trigger_type)) continue;

    // Replace {{artist_slug}} in step bodies with the actual slug
    const slug = artist.slug || '';
    const steps = template.steps.map(s => ({
      ...s,
      body: s.body.replace(/\{\{artist_slug\}\}/g, slug),
    }));

    const { data: sequence, error: seqError } = await supabaseAdmin
      .from('sequences')
      .insert({
        artist_id: artistId,
        name: template.name,
        trigger_type: template.trigger_type,
        is_active: true,
      })
      .select('id')
      .single();

    if (seqError || !sequence) {
      console.error(`Failed to seed sequence ${template.name}:`, seqError);
      continue;
    }

    const stepRecords = steps.map((s, i) => ({
      sequence_id: sequence.id,
      step_number: i + 1,
      delay_days: s.delay_days,
      subject: s.subject,
      body: s.body,
    }));

    await supabaseAdmin.from('sequence_steps').insert(stepRecords);
    seeded++;
  }

  return NextResponse.json({ success: true, seeded });
}
