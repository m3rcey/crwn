import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { buildPipelineScope, buildPartnersScope, buildFunnelScope, buildSequencesScope, buildEmailScope, buildCrmScope } from '../scopes';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

const kimi = new OpenAI({
  apiKey: process.env.MOONSHOT_API_KEY || 'dummy-key-for-build',
  baseURL: 'https://api.moonshot.ai/v1',
  timeout: 45000, // 45s timeout
});

const SYSTEM_PROMPT = `You are CRWN's business intelligence agent. You diagnose the single biggest problem hurting the business right now, trace the cause-effect chain, and suggest concrete actions to fix it.

CRWN CONTEXT:
- Two-sided marketplace: artists (supply) and fans (demand).
- Artists pay platform tier subscriptions (Starter free, Pro $69/mo, Label $175/mo, Empire $350/mo).
- Annual billing: Pro $52/mo, Label $131/mo, Empire $262/mo (25% off).
- Platform takes 3-8% fee on fan transactions depending on artist tier (Starter 8%, Pro 6%, Label 5%, Empire 3%).
- Prices are in CENTS in the data. Convert to dollars for display.
- Variable costs (SMS, MMS, email) are per-message and factored into COGS.

THE FUNNEL (in order):
Link Click → Signup → Onboarding Complete → First Track → Tiers Created → Stripe Connected → Paid Tier → First Subscriber

Each step has a conversion rate to the next. The biggest dropoff is where money is leaking. Your job is to find it, explain WHY it's happening using the supporting data, and suggest actions to fix it.

DIAGNOSIS METHOD — follow this exact chain:
1. Find the BIGGEST funnel dropoff (lowest step-to-step conversion rate).
2. Cross-reference with: time-to-milestone (are artists stalling?), pipeline stage distribution (are artists piling up at a stage?), cohort retention (is it getting worse or better?), cancellation reasons (are people telling us why?), sequence states (are relevant nudges active?).
3. Trace the DOWNSTREAM IMPACT: how does this dropoff affect churn, LGP, MRR, and health check?
4. Recommend actions you can actually take to fix it.

BENCHMARKS (Hormozi framework):
- LGP:CAC: <3:1 critical, 3-5 warning, 5-10 good, 10+ great
- Churn: <=2% excellent, 2-5% warning, >5% critical — fix before scaling
- Gross Margin: >=80% healthy, 60-80% warning, <60% critical
- Payback: <1mo aggressive scaling, 1-3mo healthy, 3-6mo concerning, >6mo problem
- Health Check: 30-day profit must be >= 2x (amortized CAC + COGs). Below 1x = emergency.
- Cohort M0→M1 drop >40% = onboarding problem. M3+ still dropping = product problem.

RESPONSE FORMAT:
Return a JSON object with exactly this structure:

{
  "diagnosis": {
    "bottleneck": "The funnel step name where the biggest dropoff is (e.g. 'First Track → Tiers Created')",
    "dropoff_rate": "The conversion % at this step",
    "why": "1-2 sentence explanation of why this dropoff is happening, citing specific data (stall time, pipeline pile-up, cancel reasons, missing sequences, etc.)",
    "impact_chain": [
      "Because X, Y happens",
      "Because Y, Z follows",
      "Which means W for the business"
    ],
    "severity": "critical" | "warning" | "info"
  },
  "supporting_signals": [
    {
      "signal": "Short label (max 60 chars)",
      "detail": "One sentence with specific numbers",
      "sentiment": "bad" | "okay" | "good"
    }
  ],
  "actions": [...]
}

SUPPORTING SIGNALS: Pick 3-5 metrics that support or contextualize the diagnosis. Each signal label MUST lead with an action verb or clear directive. Good: "Enable onboarding_incomplete sequence — 60% stall rate". Bad: "Onboarding stall rate is 60%". Order: worst signals first.

ACTIONS array — concrete actions you recommend the admin approve. Each action must have:
- type: one of "toggle_sequence" | "update_pipeline_stages" | "send_briefing" | "add_pipeline_note" | "flag_at_risk" | "enroll_in_sequence" | "pause_recruiter"
- label: short action name — MUST lead with a verb (max 60 chars). Format: "[Verb] [what] — [metric reason]". Good: "Flag 3 stalled artists — no track in 14+ days". Bad: "Artists are stalling at onboarding".
- description: why this action should be taken, citing specific numbers (max 200 chars)
- risk: "low" | "medium" | "high"
- params: object with action-specific parameters:
  - toggle_sequence: { "sequence_trigger": "<trigger_name>", "enable": true|false }
  - update_pipeline_stages: { "from_stage": "<stage>", "to_stage": "<stage>", "criteria": "<description>" }
  - send_briefing: {}
  - add_pipeline_note: { "artist_ids": ["<id>", ...], "note": "<text>" }
  - flag_at_risk: { "criteria": "<description>", "from_stage": "<current_stage>" }
  - enroll_in_sequence: { "sequence_trigger": "<trigger_name>", "artist_ids": ["<id>", ...] }
  - pause_recruiter: { "recruiter_id": "<id>", "reason": "<why>" }

ACTION RULES:
- Only suggest actions directly supported by the data. Never guess.
- toggle_sequence: Only use exact trigger names from the SEQUENCES data. Only suggest enabling a disabled sequence or disabling an enabled one when the funnel data warrants it.
- update_pipeline_stages: Valid stages: signed_up, onboarding, free, paid, at_risk, churned.
- add_pipeline_note: Use STALLED ARTISTS data. Only reference real artist IDs from the data. Use to flag specific artists with actionable context.
- flag_at_risk: Move artists matching a criteria to at_risk stage. Only when data shows clear stall or churn signals.
- enroll_in_sequence: Use exact trigger names from SEQUENCES data. Only enroll stalled artists in a relevant activation sequence that is currently ENABLED.
- pause_recruiter: Only when RECRUITER PERFORMANCE data shows negative ROI or very low qualification rate (<20%) with 3+ referrals. Use exact recruiter ID from the data. This deactivates their referral codes.
- send_briefing: Only when diagnosis severity is critical.
- Maximum 4 actions. Prefer actions that directly address the diagnosed bottleneck. It's fine to return 0 actions.
- Be conservative. Each action is reviewed by the admin before execution.

Be direct. Use specific numbers from the data. No fluff. No generic advice.`;

export const maxDuration = 60; // Allow up to 60s for Kimi response

export async function POST(req: NextRequest) {
  try {
    const { userId, scope = 'dashboard' } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const validScopes = ['dashboard', 'pipeline', 'partners', 'funnel', 'sequences', 'email', 'crm'];
    if (!validScopes.includes(scope)) {
      return NextResponse.json({ error: `Invalid scope: ${scope}` }, { status: 400 });
    }

    // Verify admin role
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Non-dashboard scopes use dedicated builders
    if (scope !== 'dashboard') {
      const scopeBuilders: Record<string, () => Promise<{ systemPrompt: string; userMessage: string }>> = {
        pipeline: buildPipelineScope,
        partners: buildPartnersScope,
        funnel: buildFunnelScope,
        sequences: buildSequencesScope,
        email: buildEmailScope,
        crm: buildCrmScope,
      };

      const builder = scopeBuilders[scope];
      if (!builder) {
        return NextResponse.json({ error: `Unknown scope: ${scope}` }, { status: 400 });
      }

      const { systemPrompt: scopePrompt, userMessage: scopeMessage } = await builder();

      let scopeResponse;
      try {
        scopeResponse = await kimi.chat.completions.create({
          model: 'kimi-k2.5',
          max_tokens: 3000,
          temperature: 0.6,
          // @ts-expect-error — Kimi-specific param
          thinking: { type: 'disabled' },
          messages: [
            { role: 'system', content: scopePrompt },
            { role: 'user', content: scopeMessage },
          ],
        });
      } catch (apiErr: unknown) {
        const msg = apiErr instanceof Error ? apiErr.message : String(apiErr);
        console.error(`Kimi API error (${scope}):`, msg);
        return NextResponse.json({ error: `Kimi API error: ${msg}` }, { status: 502 });
      }

      const rawText = scopeResponse.choices[0]?.message?.content || '{}';
      let diagnosis, supportingSignals, actions;
      try {
        const jsonStr = rawText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonStr);
        diagnosis = parsed.diagnosis || null;
        supportingSignals = parsed.supporting_signals || [];
        actions = parsed.actions || [];
      } catch {
        diagnosis = { bottleneck: 'Parse Error', dropoff_rate: 'N/A', why: rawText.slice(0, 300), impact_chain: ['Agent response could not be parsed'], severity: 'warning' as const };
        supportingSignals = [];
        actions = [];
      }

      return NextResponse.json({ diagnosis, supportingSignals, actions, analyzedAt: new Date().toISOString() });
    }

    // ---- DASHBOARD SCOPE (original logic) ----

    // Fetch metrics from cache (or compute fresh via internal call)
    const { data: cached } = await supabaseAdmin
      .from('admin_metrics_cache')
      .select('metrics, computed_at')
      .eq('period', '30d')
      .single();

    if (!cached?.metrics) {
      return NextResponse.json({ error: 'No metrics data available. Refresh the dashboard first.' }, { status: 400 });
    }

    const metrics = cached.metrics;

    // Fetch sequence states for action context
    const { data: sequences } = await supabaseAdmin
      .from('platform_sequences')
      .select('trigger, name, is_active');

    // Fetch pipeline stage distribution + stalled artists for action context
    const { data: pipelineArtists } = await supabaseAdmin
      .from('artist_profiles')
      .select('id, user_id, slug, pipeline_stage, platform_tier, activation_milestones, created_at, recruited_by');

    const stageCounts: Record<string, number> = {};
    (pipelineArtists || []).forEach((a: any) => {
      const stage = a.pipeline_stage || 'onboarding';
      stageCounts[stage] = (stageCounts[stage] || 0) + 1;
    });

    // Identify stalled artists (signed up 3+ days ago, missing key milestones)
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000);
    const stalledArtists = (pipelineArtists || [])
      .filter((a: any) => {
        if (a.pipeline_stage === 'churned') return false;
        const created = new Date(a.created_at);
        if (created > threeDaysAgo) return false; // too new
        const m = a.activation_milestones || {};
        // Stalled = missing any of the key activation milestones
        return !m.first_track_uploaded || !m.tiers_created || !m.stripe_connected;
      })
      .slice(0, 10) // top 10 for context window
      .map((a: any) => {
        const m = a.activation_milestones || {};
        const daysSinceSignup = Math.round((Date.now() - new Date(a.created_at).getTime()) / 86400000);
        const missing = [];
        if (!m.onboarding_completed) missing.push('onboarding');
        if (!m.first_track_uploaded) missing.push('first_track');
        if (!m.tiers_created) missing.push('tiers');
        if (!m.stripe_connected) missing.push('stripe');
        if (!m.first_subscriber) missing.push('first_subscriber');
        return {
          id: a.id,
          slug: a.slug || 'unknown',
          tier: a.platform_tier || 'starter',
          stage: a.pipeline_stage || 'onboarding',
          days_since_signup: daysSinceSignup,
          missing_milestones: missing,
          recruited: !!a.recruited_by,
        };
      });

    // Fetch funnel data (90d)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);
    const funnelArtists = (pipelineArtists || []).filter((a: any) => new Date(a.created_at) >= ninetyDaysAgo);
    const milestones = (a: any) => (a.activation_milestones || {}) as Record<string, string>;
    const funnel = {
      signups: funnelArtists.length,
      onboarded: funnelArtists.filter((a: any) => milestones(a).onboarding_completed).length,
      first_track: funnelArtists.filter((a: any) => milestones(a).first_track_uploaded).length,
      tiers_created: funnelArtists.filter((a: any) => milestones(a).tiers_created).length,
      stripe_connected: funnelArtists.filter((a: any) => milestones(a).stripe_connected).length,
      paid_tier: funnelArtists.filter((a: any) => a.platform_tier && a.platform_tier !== 'starter').length,
      first_subscriber: funnelArtists.filter((a: any) => milestones(a).first_subscriber).length,
    };

    // Compute step-by-step conversion rates
    const funnelSteps = [
      { from: 'Signups', to: 'Onboarded', fromVal: funnel.signups, toVal: funnel.onboarded },
      { from: 'Onboarded', to: 'First Track', fromVal: funnel.onboarded, toVal: funnel.first_track },
      { from: 'First Track', to: 'Tiers Created', fromVal: funnel.first_track, toVal: funnel.tiers_created },
      { from: 'Tiers Created', to: 'Stripe Connected', fromVal: funnel.tiers_created, toVal: funnel.stripe_connected },
      { from: 'Stripe Connected', to: 'Paid Tier', fromVal: funnel.stripe_connected, toVal: funnel.paid_tier },
      { from: 'Paid Tier', to: 'First Subscriber', fromVal: funnel.paid_tier, toVal: funnel.first_subscriber },
    ];
    const funnelWithRates = funnelSteps.map(s => ({
      ...s,
      rate: s.fromVal > 0 ? Math.round((s.toVal / s.fromVal) * 100) : 0,
      dropped: s.fromVal - s.toVal,
    }));

    // Fetch recruiter performance with IDs for pause_recruiter action
    const { data: allRecruiters } = await supabaseAdmin
      .from('recruiters')
      .select('id, user_id, tier, referral_code, is_partner, total_artists_referred, total_earned');
    const { data: allReferrals } = await supabaseAdmin
      .from('artist_referrals')
      .select('recruiter_id, status');
    const { data: allPayoutsRaw } = await supabaseAdmin
      .from('recruiter_payouts')
      .select('recruiter_id, amount, status')
      .eq('status', 'paid');
    const recruiterUserIds = (allRecruiters || []).map((r: any) => r.user_id).filter(Boolean);
    const { data: recruiterProfiles } = recruiterUserIds.length > 0
      ? await supabaseAdmin.from('profiles').select('id, display_name').in('id', recruiterUserIds)
      : { data: [] };

    const recruiterProfileMap = new Map((recruiterProfiles || []).map((p: any) => [p.id, p.display_name]));
    const recruiterData = (allRecruiters || []).map((r: any) => {
      const refs = (allReferrals || []).filter((ref: any) => ref.recruiter_id === r.id);
      const qualified = refs.filter((ref: any) => ref.status === 'qualified').length;
      const churned = refs.filter((ref: any) => ref.status === 'churned').length;
      const totalPaid = (allPayoutsRaw || []).filter((p: any) => p.recruiter_id === r.id).reduce((s: number, p: any) => s + p.amount, 0);
      return {
        id: r.id,
        name: recruiterProfileMap.get(r.user_id) || r.referral_code,
        code: r.referral_code,
        tier: r.tier || 'starter',
        isPartner: r.is_partner,
        totalReferred: refs.length,
        qualified,
        churned,
        qualificationRate: refs.length > 0 ? Math.round((qualified / refs.length) * 100) : 0,
        totalPaid,
        roi: totalPaid > 0 ? Number(((metrics.lgp * qualified - totalPaid) / totalPaid).toFixed(1)) : 0,
      };
    }).filter((r: any) => r.totalReferred > 0)
      .sort((a: any, b: any) => a.roi - b.roi); // worst ROI first

    // Build the user message with all metrics
    const userMessage = `Diagnose CRWN's biggest problem right now (30-day trailing metrics, computed ${cached.computed_at}):

=== ACQUISITION FUNNEL (last 90 days) ===
Signups: ${funnel.signups} → Onboarded: ${funnel.onboarded} → First Track: ${funnel.first_track} → Tiers Created: ${funnel.tiers_created} → Stripe Connected: ${funnel.stripe_connected} → Paid Tier: ${funnel.paid_tier} → First Subscriber: ${funnel.first_subscriber}

STEP-BY-STEP CONVERSION:
${funnelWithRates.map(s => `- ${s.from} → ${s.to}: ${s.rate}% (${s.dropped} dropped)`).join('\n')}

TIME TO MILESTONE (avg days):
- Onboarding: ${metrics.timeToMilestone?.onboarding_completed ?? 'N/A'}d
- First Track: ${metrics.timeToMilestone?.first_track_uploaded ?? 'N/A'}d
- Tiers Created: ${metrics.timeToMilestone?.tiers_created ?? 'N/A'}d
- Stripe Connected: ${metrics.timeToMilestone?.stripe_connected ?? 'N/A'}d
- First Subscriber: ${metrics.timeToMilestone?.first_subscriber ?? 'N/A'}d

STALLED ARTISTS (3+ days old, missing milestones):
${stalledArtists.length > 0 ? stalledArtists.map((a: any) => `- id:${a.id}, slug:${a.slug}, tier:${a.tier}, stage:${a.stage}, ${a.days_since_signup}d old, missing: [${a.missing_milestones.join(', ')}]${a.recruited ? ' (recruited)' : ' (organic)'}`).join('\n') : 'None'}

=== BUSINESS HEALTH ===
- LGP:CAC Ratio: ${metrics.lgpCacRatio === null ? 'Infinity' : metrics.lgpCacRatio}:1 | LGP: $${(metrics.lgp / 100).toFixed(2)} | CAC: $${(metrics.cac / 100).toFixed(2)}
- MRR: $${(metrics.totalMRR / 100).toFixed(2)} | ARR: $${(metrics.totalARR / 100).toFixed(2)} | Gross Margin: ${metrics.grossMarginPct}%
- 30-Day Health Check: ${metrics.healthCheckRatio}x (target >=2x) — ${metrics.healthCheckPassing ? 'PASSING' : 'FAILING'}
- Payback: ${metrics.paybackMonths}mo | 30-Day Cash: $${(metrics.thirtyDayCash / 100).toFixed(2)}

PER-TIER HEALTH:
${(metrics.tierHealthCheck || []).map((t: any) => `- ${t.tier}: $${(t.price / 100).toFixed(0)}/mo, COGS $${(t.cogs / 100).toFixed(2)}, profit $${(t.profit / 100).toFixed(2)}, ratio ${t.ratio}x — ${t.passing ? 'PASSING' : 'FAILING'}`).join('\n')}

=== RETENTION ===
- Artist Churn: ${metrics.artistChurnRate}%/mo | Avg Lifespan: ${metrics.avgLifespanMonths}mo
- Artists: ${metrics.totalArtists} total (${metrics.paidArtists} paid, ${metrics.starterArtists} free) | Paid Conversion: ${metrics.totalArtists > 0 ? Math.round((metrics.paidArtists / metrics.totalArtists) * 100) : 0}%
- Churn Risk: ${metrics.churnRisk?.active ?? 0} active, ${metrics.churnRisk?.atRisk ?? 0} at-risk, ${metrics.churnRisk?.churning ?? 0} churning
- Fan Churn: ${metrics.fanChurnRate}% | Active Fans: ${metrics.totalActiveFans} | New: ${metrics.newFans} | Churned: ${metrics.churnedFans}

COHORT RETENTION (artist):
${(metrics.artistCohortRetention || []).slice(-4).map((c: any) => `- ${c.month} (n=${c.cohortSize}): ${(c.retention || []).map((r: number, i: number) => `M${i}:${r}%`).join(', ')}`).join('\n') || 'No data'}

COHORT RETENTION (fan):
${(metrics.fanCohortRetention || []).slice(-4).map((c: any) => `- ${c.month} (n=${c.cohortSize}): ${(c.retention || []).map((r: number, i: number) => `M${i}:${r}%`).join(', ')}`).join('\n') || 'No data'}

CANCELLATION REASONS:
Platform: ${(metrics.cancelReasonSummary?.platform || []).slice(0, 3).map((r: any) => `"${r.reason}" (${r.count})`).join(', ') || 'None'}
Fan: ${(metrics.cancelReasonSummary?.fan || []).slice(0, 3).map((r: any) => `"${r.reason}" (${r.count})`).join(', ') || 'None'}
Freeform: ${(metrics.cancelReasonSummary?.recentFreeform || []).slice(0, 3).map((f: any) => `"${f.text}"`).join(', ') || 'None'}

=== REFERRAL VS CHURN ===
- Artist: +${metrics.scoreboard?.artistReferrals ?? 0} referrals, -${metrics.scoreboard?.artistChurned ?? 0} churned = net ${metrics.scoreboard?.artistNetGrowth ?? 0}
- Fan: -${metrics.scoreboard?.fanChurned ?? 0} churned${metrics.scoreboard?.fanReferralTracked ? `, +${metrics.scoreboard.fanReferrals} referrals = net ${metrics.scoreboard.fanNetGrowth}` : ' (referrals not tracked)'}

=== RECRUITER / PARTNER PERFORMANCE (all, sorted worst ROI first) ===
${recruiterData.map((r: any) => `- id:${r.id}, ${r.name} [${r.code}] (${r.tier}${r.isPartner ? ', PARTNER' : ''}): ${r.totalReferred} referred, ${r.qualified} qualified, ${r.churned} churned, qual ${r.qualificationRate}%, paid $${(r.totalPaid / 100).toFixed(2)}, ROI ${r.roi}x`).join('\n') || 'No recruiters'}

=== AVAILABLE ACTIONS ===
SEQUENCES (you can toggle these):
${(sequences || []).map((s: { trigger: string; name: string; is_active: boolean }) => `- trigger: "${s.trigger}", name: "${s.name}", currently ${s.is_active ? 'ENABLED' : 'DISABLED'}`).join('\n')}

PIPELINE STAGES (you can move artists between these):
${Object.entries(stageCounts).map(([stage, count]) => `- ${stage}: ${count} artists`).join('\n')}

STALLED ARTIST IDS (you can add notes to or enroll in sequences):
${stalledArtists.map((a: any) => `- ${a.id} (${a.slug})`).join(', ') || 'None'}

RECRUITER IDS (you can pause these):
${recruiterData.map((r: any) => `- ${r.id} (${r.code}, ROI ${r.roi}x)`).join(', ') || 'None'}

=== OTHER METRICS ===
- Visitors: ${metrics.uniqueVisitorsInPeriod} | RPV: $${(metrics.revenuePerVisitor / 100).toFixed(4)}
- Sales Velocity: ${metrics.salesVelocity}/mo | Max Revenue: $${(metrics.hypotheticalMaxMonthlyRevenue / 100).toFixed(2)}/mo
- Variable Costs: $${((metrics.totalVariableCostsCents ?? 0) / 100).toFixed(2)} (SMS: ${metrics.messagingVolume?.sms ?? 0}, Email: ${metrics.messagingVolume?.email ?? 0})
- Tier Upgrades: ${metrics.tierUpgradeMetrics?.upgradeRate ?? 0}% (${metrics.tierUpgradeMetrics?.onLabelPlus ?? 0} on Label+ of ${metrics.tierUpgradeMetrics?.establishedPaidCount ?? 0} established)
- Billing Mix: ${(metrics.billingMix || []).map((b: any) => `${b.name} ${b.count}`).join(', ')}
${metrics.surveySummary ? `- NPS: ${metrics.surveySummary.nps ?? 'N/A'} | Loved: ${(metrics.surveySummary.topLoved || []).slice(0, 2).join(', ')} | Requested: ${(metrics.surveySummary.topRequested || []).slice(0, 2).join(', ')}` : ''}

Return ONLY the JSON object with "diagnosis", "supporting_signals", and "actions". No markdown, no code fences, no explanation.`;

    let response;
    try {
      response = await kimi.chat.completions.create({
        model: 'kimi-k2.5',
        max_tokens: 4000,
        temperature: 0.6,
        // @ts-expect-error — Kimi-specific param to disable slow thinking mode
        thinking: { type: 'disabled' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
      });
    } catch (apiErr: unknown) {
      const msg = apiErr instanceof Error ? apiErr.message : String(apiErr);
      console.error('Kimi API error:', msg);
      return NextResponse.json({ error: `Kimi API error: ${msg}` }, { status: 502 });
    }

    const rawText = response.choices[0]?.message?.content || '{}';

    // Parse JSON from response (handle potential markdown wrapping)
    let diagnosis;
    let supportingSignals;
    let actions;
    try {
      const jsonStr = rawText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(jsonStr);

      diagnosis = parsed.diagnosis || null;
      supportingSignals = parsed.supporting_signals || [];
      actions = parsed.actions || [];
    } catch {
      diagnosis = {
        bottleneck: 'Parse Error',
        dropoff_rate: 'N/A',
        why: rawText.slice(0, 300),
        impact_chain: ['Agent response could not be parsed'],
        severity: 'warning' as const,
      };
      supportingSignals = [];
      actions = [];
    }

    return NextResponse.json({ diagnosis, supportingSignals, actions, analyzedAt: new Date().toISOString() });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Agent analyze error:', errMsg, error);
    return NextResponse.json({ error: `Analysis failed: ${errMsg}` }, { status: 500 });
  }
}
