import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { LEAD_MAGNETS } from '@/lib/leadMagnets/registry';

// Admin-only aggregate reporting. Server-side admin authorization (the client /admin
// page check is cosmetic). Returns AGGREGATES only, never lead PII or full payloads.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  // Event counts by (tool, type).
  const { data: events } = await supabaseAdmin.from('lead_magnet_events').select('tool_slug, event_type');
  const { data: leads } = await supabaseAdmin.from('lead_magnet_leads').select('tool_slug, utm_source');
  const { data: results } = await supabaseAdmin.from('lead_magnet_results').select('tool_slug, status, source');

  const byTool: Record<string, Record<string, number>> = {};
  const bump = (slug: string, key: string, n = 1) => {
    const t = (byTool[slug] ??= {});
    t[key] = (t[key] || 0) + n;
  };

  for (const e of events || []) if (e.tool_slug) bump(e.tool_slug, e.event_type);
  for (const l of leads || []) if (l.tool_slug) bump(l.tool_slug, 'leads');
  for (const r of results || []) {
    if (!r.tool_slug) continue;
    bump(r.tool_slug, `results_${r.source}`);
    if (r.status === 'converted') bump(r.tool_slug, 'conversions');
  }

  // Top acquisition sources across all tools.
  const sources: Record<string, number> = {};
  for (const l of leads || []) {
    const s = l.utm_source || 'direct';
    sources[s] = (sources[s] || 0) + 1;
  }

  const tools = LEAD_MAGNETS.map((m) => {
    const t = byTool[m.slug] || {};
    const starts = t['lead_magnet_started'] || 0;
    const completes = t['lead_magnet_result_generated'] || 0;
    return {
      slug: m.slug,
      name: m.name,
      views: t['lead_magnet_viewed'] || 0,
      starts,
      completions: completes,
      completionRate: starts ? Math.round((completes / starts) * 100) : 0,
      leads: t['leads'] || 0,
      signupClicks: t['lead_magnet_signup_clicked'] || 0,
      savedResults: t['results_artist'] || 0,
      conversionStarts: t['lead_magnet_conversion_started'] || 0,
      conversions: t['conversions'] || 0,
      emails: t['lead_magnet_result_emailed'] || 0,
      shares: t['lead_magnet_result_shared'] || 0,
    };
  });

  return NextResponse.json({ tools, topSources: Object.entries(sources).sort((a, b) => b[1] - a[1]).slice(0, 10) });
}
