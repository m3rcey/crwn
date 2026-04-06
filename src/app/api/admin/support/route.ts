import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || 'dummy-key-for-build',
  baseURL: 'https://api.deepseek.com',
  timeout: 30000,
});

const SAGE_SYSTEM_PROMPT = `You are Sage, Customer Success Lead at CRWN (a music monetization platform by JNW Creative Enterprises). You draft support responses and diagnose issues.

CRWN CONTEXT:
- Artists sell subscriptions, tracks, and products directly to fans
- Platform tiers: Starter (free, 8% fee), Pro ($69/mo, 6%), Label ($175/mo, 5%), Empire ($350/mo, 3%)
- Fan subscriptions: artists set their own tier prices
- Payments via Stripe Connect — prices stored in CENTS
- Weekly payouts every Monday 11am UTC
- AI Manager runs daily at 1pm UTC for insights/actions

COMMON ISSUES:
- "Can't connect Stripe" → Check stripe_connect_id on artist_profiles. If null, onboarding incomplete.
- "Payout didn't come" → Check earnings table. Weekly payout only fires if Stripe balance > $0.
- "Fans can't see content" → Check is_free + allowed_tier_ids. Fan needs matching tier subscription.
- "AI Manager empty" → Runs at 1pm UTC daily. Starter tier = basic nudges only. Pro+ = full insights.
- "Old version showing" → Service worker cache. Tell user to clear browser cache or try incognito.
- "Data not loading" → Likely RLS policy issue. Client-side queries silently return null.

TONE: Friendly, professional, concise. Lead with the answer. Never guess about account data — if you don't have it, say so.

RESPONSE FORMAT:
Return JSON:
{
  "classification": "how_to" | "bug_report" | "billing" | "account" | "feature_request" | "other",
  "priority": "urgent" | "normal" | "low",
  "draft_response": "The response to send to the user (markdown ok)",
  "internal_notes": "What Joshua should know — root cause, next steps, related code files",
  "needs_escalation": true/false,
  "escalation_reason": "Why this needs Joshua's attention (if applicable)"
}`;

async function verifyAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  return data?.role === 'admin';
}

async function lookupArtist(identifier: string): Promise<string> {
  // Try by slug first
  const { data: bySlug } = await supabaseAdmin
    .from('artist_profiles')
    .select('id, user_id, slug, platform_tier, stripe_connect_id, is_active, pipeline_stage')
    .eq('slug', identifier)
    .maybeSingle();

  if (bySlug) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('display_name, email')
      .eq('id', bySlug.user_id)
      .single();

    const { count: subCount } = await supabaseAdmin
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', bySlug.id)
      .eq('status', 'active');

    return `Artist found: ${profile?.display_name || 'Unknown'} (${profile?.email || 'no email'})
Slug: ${bySlug.slug} | Tier: ${bySlug.platform_tier} | Stage: ${bySlug.pipeline_stage}
Stripe Connected: ${bySlug.stripe_connect_id ? 'Yes' : 'No'} | Active: ${bySlug.is_active}
Active Subscribers: ${subCount || 0}`;
  }

  // Try by email
  const { data: byEmail } = await supabaseAdmin
    .from('profiles')
    .select('id, display_name, email')
    .eq('email', identifier)
    .maybeSingle();

  if (byEmail) {
    const { data: artist } = await supabaseAdmin
      .from('artist_profiles')
      .select('id, slug, platform_tier, stripe_connect_id, is_active, pipeline_stage')
      .eq('user_id', byEmail.id)
      .maybeSingle();

    if (artist) {
      const { count: subCount } = await supabaseAdmin
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('artist_id', artist.id)
        .eq('status', 'active');

      return `Artist found: ${byEmail.display_name} (${byEmail.email})
Slug: ${artist.slug} | Tier: ${artist.platform_tier} | Stage: ${artist.pipeline_stage}
Stripe Connected: ${artist.stripe_connect_id ? 'Yes' : 'No'} | Active: ${artist.is_active}
Active Subscribers: ${subCount || 0}`;
    }

    return `User found: ${byEmail.display_name} (${byEmail.email}) — not an artist`;
  }

  return `No artist or user found matching "${identifier}"`;
}

export async function POST(req: NextRequest) {
  try {
    const { userId, message, artistLookup } = await req.json() as {
      userId: string;
      message: string;
      artistLookup?: string;
    };

    if (!userId || !message) {
      return NextResponse.json({ error: 'Missing userId or message' }, { status: 400 });
    }

    if (!(await verifyAdmin(userId))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Build context
    let context = '';

    // If an artist slug/email was provided, look them up
    if (artistLookup) {
      const artistInfo = await lookupArtist(artistLookup);
      context += `\n\nACCOUNT LOOKUP:\n${artistInfo}`;
    }

    const userMessage = `Support request:\n\n${message}${context}\n\nDraft a response and classify the issue. Return ONLY the JSON object.`;

    const response = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      max_tokens: 1500,
      temperature: 0.4,
      messages: [
        { role: 'system', content: SAGE_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    });

    const rawText = response.choices[0]?.message?.content || '{}';

    let parsed;
    try {
      const jsonStr = rawText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      parsed = {
        classification: 'other',
        priority: 'normal',
        draft_response: rawText,
        internal_notes: 'Could not parse structured response',
        needs_escalation: false,
        escalation_reason: null,
      };
    }

    return NextResponse.json({
      ...parsed,
      respondedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Support agent error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
