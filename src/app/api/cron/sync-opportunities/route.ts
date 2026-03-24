import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-build',
});

// Real sync platforms artists can actually use
const SYNC_PLATFORMS = [
  { name: 'Musicbed', url: 'https://www.musicbed.com', type: 'brief' },
  { name: 'Songtradr', url: 'https://www.songtradr.com', type: 'brief' },
  { name: 'Artlist', url: 'https://www.artlist.io', type: 'brief' },
  { name: 'Epidemic Sound', url: 'https://www.epidemicsound.com', type: 'brief' },
  { name: 'Syncr', url: 'https://www.syncr.com', type: 'brief' },
  { name: 'SubmitHub', url: 'https://www.submithub.com', type: 'event' },
  { name: 'Taxi Music', url: 'https://www.taxi.com', type: 'brief' },
  { name: 'Music Gateway', url: 'https://www.musicgateway.com', type: 'brief' },
  { name: 'Audiosocket', url: 'https://www.audiosocket.com', type: 'brief' },
  { name: 'Marmoset', url: 'https://www.marmosetmusic.com', type: 'brief' },
];

const GENERATE_OPPORTUNITIES_FUNCTION = {
  name: 'generate_sync_opportunities',
  description: 'Generate realistic sync licensing opportunities for independent artists',
  parameters: {
    type: 'object' as const,
    properties: {
      opportunities: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            title: {
              type: 'string' as const,
              description: 'Specific, realistic opportunity title. e.g. "Netflix Drama Series - Emotional Indie Track Needed" or "Nike Summer Campaign - Upbeat Hip-Hop"',
            },
            description: {
              type: 'string' as const,
              description: 'Detailed description of what the opportunity is and what the brand/project is looking for.',
            },
            type: {
              type: 'string' as const,
              enum: ['event', 'brief'],
            },
            project_type: {
              type: 'string' as const,
              enum: ['tv', 'film', 'ad', 'game', 'music'],
              description: 'The media type this placement is for',
            },
            genres: {
              type: 'array' as const,
              items: { type: 'string' as const },
              description: 'Target genres. Use from: Pop, R&B, Hip-Hop, Rap, Rock, Alternative, Indie, Electronic, Dance, Country, Folk, Jazz, Blues, Soul, Funk, Reggae, Latin, Classical, Ambient, Lo-Fi, Cinematic, Gospel, Metal, Punk, World',
            },
            moods: {
              type: 'array' as const,
              items: { type: 'string' as const },
              description: 'Target moods/vibes for the placement',
            },
            looking_for: {
              type: 'string' as const,
              description: 'What specifically they need from the artist (vocal style, tempo, instrumentation, etc.)',
            },
            brief_details: {
              type: 'string' as const,
              description: 'Specific brief requirements (song length, exclusivity, licensing terms, etc.)',
            },
            price_min: {
              type: 'number' as const,
              description: 'Minimum payment in cents (e.g. 50000 for $500)',
            },
            price_max: {
              type: 'number' as const,
              description: 'Maximum payment in cents (e.g. 500000 for $5,000)',
            },
            location_state: {
              type: 'string' as const,
              description: 'US state code if location-specific (e.g. "CA", "NY", "TX"). Null for remote/online.',
            },
            is_online: {
              type: 'boolean' as const,
              description: 'Whether this opportunity is open to remote submissions (most sync briefs are)',
            },
            deadline_days_from_now: {
              type: 'number' as const,
              description: 'Number of days from today until the deadline. Use 7-30 for most briefs.',
            },
            source_index: {
              type: 'number' as const,
              description: 'Index (0-9) of the sync platform this opportunity would be found on',
            },
            is_featured: {
              type: 'boolean' as const,
              description: 'Whether to feature this opportunity. Only 1-2 per batch should be featured.',
            },
          },
          required: ['title', 'description', 'type', 'project_type', 'genres', 'moods', 'looking_for', 'price_min', 'price_max', 'is_online', 'deadline_days_from_now', 'source_index'],
        },
        minItems: 5,
        maxItems: 10,
      },
    },
    required: ['opportunities'],
  },
};

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // First, deactivate expired opportunities
    const now = new Date();
    await supabaseAdmin
      .from('sync_opportunities')
      .update({ is_active: false })
      .lt('deadline', now.toISOString())
      .eq('is_active', true);

    // Count current active opportunities to avoid flooding
    const { count: activeCount } = await supabaseAdmin
      .from('sync_opportunities')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);

    // Cap at 30 active opportunities
    if ((activeCount || 0) >= 30) {
      return NextResponse.json({ message: 'Enough active opportunities', activeCount });
    }

    // Get existing titles to avoid duplicates
    const { data: existing } = await supabaseAdmin
      .from('sync_opportunities')
      .select('title')
      .eq('is_active', true);

    const existingTitles = new Set((existing || []).map(e => e.title));

    // Generate new opportunities via GPT-4o-mini
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 2048,
      messages: [
        {
          role: 'system',
          content: `You are a sync licensing industry expert. Generate realistic, currently-relevant sync opportunities for independent musicians. These should reflect REAL types of briefs that exist in the sync licensing world right now.

Mix of:
- TV/streaming placements (Netflix, Hulu, HBO, Apple TV+, etc.)
- Film placements (indie films, documentaries, shorts)
- Advertising campaigns (major brands, tech companies, automotive, fashion)
- Video game soundtracks
- Social media/content creator campaigns

Make each opportunity specific and believable. Vary the genres, budgets, and project types. Include a mix of high-budget ($2,000-$10,000+) and accessible ($200-$1,000) opportunities so artists at all levels see something relevant.

Most opportunities should be online/remote submissions. Only make 1-2 location-specific if relevant (e.g., a local film festival).

Current date: ${now.toISOString().split('T')[0]}`,
        },
        {
          role: 'user',
          content: `Generate 8 new sync licensing opportunities. Avoid these existing titles: ${[...existingTitles].slice(0, 20).join(', ')}`,
        },
      ],
      tools: [
        {
          type: 'function',
          function: GENERATE_OPPORTUNITIES_FUNCTION,
        },
      ],
      tool_choice: { type: 'function', function: { name: 'generate_sync_opportunities' } },
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.type !== 'function') {
      return NextResponse.json({ error: 'No function call in response' }, { status: 500 });
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const opportunities = parsed.opportunities || [];

    const results = [];
    for (const opp of opportunities) {
      // Skip if title already exists
      if (existingTitles.has(opp.title)) continue;

      const platform = SYNC_PLATFORMS[opp.source_index % SYNC_PLATFORMS.length];
      const deadline = new Date(now.getTime() + (opp.deadline_days_from_now || 14) * 24 * 60 * 60 * 1000);

      const { data, error } = await supabaseAdmin
        .from('sync_opportunities')
        .upsert({
          title: opp.title,
          description: opp.description || null,
          type: opp.type || 'brief',
          location_city: null,
          location_state: opp.location_state || null,
          is_online: opp.is_online ?? true,
          event_url: null,
          registration_url: platform.url,
          price_min: opp.price_min || null,
          price_max: opp.price_max || null,
          event_date: null,
          event_end_date: null,
          deadline: deadline.toISOString(),
          genres: opp.genres || ['all'],
          moods: opp.moods || [],
          project_type: opp.project_type || null,
          brief_details: opp.brief_details || null,
          looking_for: opp.looking_for || null,
          source: `CRWN Curated via ${platform.name}`,
          source_url: platform.url,
          is_active: true,
          is_featured: opp.is_featured || false,
        }, { onConflict: 'title' })
        .select()
        .single();

      if (error) {
        results.push({ title: opp.title, error: error.message });
      } else {
        results.push({ title: opp.title, id: data.id, status: 'created' });
      }
    }

    return NextResponse.json({
      deactivatedExpired: true,
      newOpportunities: results.length,
      results,
    });
  } catch (error) {
    console.error('Sync opportunities cron error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
