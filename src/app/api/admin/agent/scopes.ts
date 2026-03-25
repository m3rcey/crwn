import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

interface ScopeResult {
  systemPrompt: string;
  userMessage: string;
}

// ============================================================
// PIPELINE SCOPE
// ============================================================
export async function buildPipelineScope(): Promise<ScopeResult> {
  const [
    { data: artists },
    { data: sequences },
    { data: enrollments },
  ] = await Promise.all([
    supabaseAdmin.from('artist_profiles').select('id, user_id, slug, pipeline_stage, platform_tier, platform_subscription_status, platform_lead_score, stripe_connect_id, activation_milestones, created_at'),
    supabaseAdmin.from('platform_sequences').select('trigger, name, is_active'),
    supabaseAdmin.from('platform_sequence_enrollments').select('artist_user_id, sequence_id, status').eq('status', 'active'),
  ]);

  const allArtists = artists || [];
  const userIds = allArtists.map(a => a.user_id);
  const { data: profiles } = userIds.length > 0
    ? await supabaseAdmin.from('profiles').select('id, display_name, last_active_at').in('id', userIds)
    : { data: [] };
  const profileMap = new Map((profiles || []).map(p => [p.id, p]));

  const { data: notes } = await supabaseAdmin.from('artist_notes').select('artist_id, body, created_at').order('created_at', { ascending: false }).limit(100);
  const notesByArtist: Record<string, { body: string; date: string }[]> = {};
  (notes || []).forEach(n => {
    if (!notesByArtist[n.artist_id]) notesByArtist[n.artist_id] = [];
    if (notesByArtist[n.artist_id].length < 2) notesByArtist[n.artist_id].push({ body: n.body, date: n.created_at });
  });

  const enrolledUserIds = new Set((enrollments || []).map(e => e.artist_user_id));

  // Stage counts
  const stageCounts: Record<string, number> = { signed_up: 0, onboarding: 0, free: 0, paid: 0, at_risk: 0, churned: 0 };
  allArtists.forEach(a => {
    const stage = a.pipeline_stage || 'onboarding';
    stageCounts[stage] = (stageCounts[stage] || 0) + 1;
  });

  // Build per-artist detail for active (non-churned) artists
  const now = Date.now();
  const activeArtists = allArtists
    .filter(a => a.pipeline_stage !== 'churned')
    .map(a => {
      const p = profileMap.get(a.user_id);
      const m = (a.activation_milestones || {}) as Record<string, string>;
      const daysSinceSignup = Math.round((now - new Date(a.created_at).getTime()) / 86400000);
      const lastActive = p?.last_active_at ? Math.round((now - new Date(p.last_active_at).getTime()) / 86400000) : null;
      const missing = [];
      if (!m.onboarding_completed) missing.push('onboarding');
      if (!m.first_track_uploaded) missing.push('first_track');
      if (!m.tiers_created) missing.push('tiers');
      if (!m.stripe_connected) missing.push('stripe');
      if (!m.first_subscriber) missing.push('first_subscriber');
      return {
        id: a.id,
        name: p?.display_name || a.slug || 'unknown',
        slug: a.slug,
        stage: a.pipeline_stage || 'onboarding',
        tier: a.platform_tier || 'starter',
        lead_score: a.platform_lead_score || 0,
        days_old: daysSinceSignup,
        days_inactive: lastActive,
        has_stripe: !!a.stripe_connect_id,
        in_sequence: enrolledUserIds.has(a.user_id),
        missing,
        notes: notesByArtist[a.id] || [],
      };
    })
    .sort((a, b) => (b.days_inactive ?? 999) - (a.days_inactive ?? 999)); // most inactive first

  const systemPrompt = `You are CRWN's Pipeline Agent. You analyze individual artists in the pipeline to find who is stuck, who needs attention, and what actions to take.

PIPELINE STAGES (in order): signed_up → onboarding → free → paid → at_risk → churned

YOUR JOB:
1. Find the MOST CRITICAL pipeline problem (artists stuck at a stage, going dark, high-value artists at risk)
2. Identify SPECIFIC artists by ID who need action
3. Recommend concrete actions

RESPONSE FORMAT (JSON only):
{
  "diagnosis": {
    "bottleneck": "The pipeline problem (e.g. '8 artists stuck in onboarding for 10+ days')",
    "dropoff_rate": "Key stat",
    "why": "1-2 sentences explaining why, citing specific artist data",
    "impact_chain": ["Because X...", "Y follows...", "Which means Z for revenue"],
    "severity": "critical" | "warning" | "info"
  },
  "supporting_signals": [
    { "signal": "Short label", "detail": "One sentence with numbers", "sentiment": "bad" | "okay" | "good" }
  ],
  "actions": [
    {
      "type": "add_pipeline_note" | "flag_at_risk" | "enroll_in_sequence" | "update_pipeline_stages",
      "label": "Short action name",
      "description": "Why this action",
      "risk": "low" | "medium" | "high",
      "params": { ... }
    }
  ]
}

ACTION PARAMS:
- add_pipeline_note: { "artist_ids": ["id1", ...], "note": "text" }
- flag_at_risk: { "criteria": "desc", "from_stage": "stage" }
- enroll_in_sequence: { "sequence_trigger": "trigger_name", "artist_ids": ["id1", ...] }
- update_pipeline_stages: { "from_stage": "stage", "to_stage": "stage" }

RULES: Only reference real artist IDs and sequence triggers from the data. Max 4 actions. Be specific.`;

  const userMessage = `Analyze this pipeline (${allArtists.length} total artists):

STAGE DISTRIBUTION:
${Object.entries(stageCounts).map(([s, c]) => `- ${s}: ${c}`).join('\n')}

SEQUENCES AVAILABLE:
${(sequences || []).map(s => `- "${s.trigger}" (${s.name}) — ${s.is_active ? 'ENABLED' : 'DISABLED'}`).join('\n')}

ARTISTS (non-churned, sorted by most inactive first):
${activeArtists.slice(0, 30).map(a => `- id:${a.id} "${a.name}" [${a.slug}] | stage:${a.stage} tier:${a.tier} score:${a.lead_score} | ${a.days_old}d old, ${a.days_inactive !== null ? a.days_inactive + 'd inactive' : 'never active'} | stripe:${a.has_stripe ? 'yes' : 'NO'} seq:${a.in_sequence ? 'yes' : 'no'} | missing:[${a.missing.join(',')}]${a.notes.length > 0 ? ` | notes: "${a.notes[0].body.slice(0, 60)}"` : ''}`).join('\n')}

Return ONLY the JSON object. No markdown, no code fences.`;

  return { systemPrompt, userMessage };
}

// ============================================================
// PARTNERS SCOPE
// ============================================================
export async function buildPartnersScope(): Promise<ScopeResult> {
  const [
    { data: recruiters },
    { data: referrals },
    { data: payouts },
    { data: applications },
    { data: codes },
  ] = await Promise.all([
    supabaseAdmin.from('recruiters').select('id, user_id, tier, referral_code, is_partner, partner_flat_fee, partner_recurring_rate, total_artists_referred, total_earned, created_at'),
    supabaseAdmin.from('artist_referrals').select('id, recruiter_id, artist_id, status, created_at, qualified_at'),
    supabaseAdmin.from('recruiter_payouts').select('recruiter_id, amount, type, status, created_at').eq('status', 'paid'),
    supabaseAdmin.from('partner_applications').select('id, user_id, full_name, email, platform, audience_size, status, created_at'),
    supabaseAdmin.from('partner_codes').select('id, code, recruiter_id, is_active'),
  ]);

  const userIds = (recruiters || []).map(r => r.user_id).filter(Boolean);
  const { data: profiles } = userIds.length > 0
    ? await supabaseAdmin.from('profiles').select('id, display_name').in('id', userIds)
    : { data: [] };
  const profileMap = new Map((profiles || []).map(p => [p.id, p.display_name]));

  // Build recruiter performance
  const recruiterData = (recruiters || []).map(r => {
    const refs = (referrals || []).filter(ref => ref.recruiter_id === r.id);
    const qualified = refs.filter(ref => ref.status === 'qualified').length;
    const churned = refs.filter(ref => ref.status === 'churned').length;
    const pending = refs.filter(ref => ref.status === 'pending').length;
    const totalPaid = (payouts || []).filter(p => p.recruiter_id === r.id).reduce((s, p) => s + p.amount, 0);
    const rCodes = (codes || []).filter(c => c.recruiter_id === r.id);
    return {
      id: r.id,
      name: profileMap.get(r.user_id) || r.referral_code,
      code: r.referral_code,
      tier: r.tier || 'starter',
      isPartner: r.is_partner,
      flatFee: r.partner_flat_fee || 0,
      recurringRate: r.partner_recurring_rate || 0,
      totalReferred: refs.length,
      qualified,
      churned,
      pending,
      qualRate: refs.length > 0 ? Math.round((qualified / refs.length) * 100) : 0,
      totalPaid,
      activeCodes: rCodes.filter(c => c.is_active).length,
      inactiveCodes: rCodes.filter(c => !c.is_active).length,
      daysSinceJoin: Math.round((Date.now() - new Date(r.created_at).getTime()) / 86400000),
    };
  }).sort((a, b) => (a.qualRate) - (b.qualRate)); // worst qual rate first

  const pendingApps = (applications || []).filter(a => a.status === 'pending');

  const systemPrompt = `You are CRWN's Partners Agent. You evaluate recruiter and partner performance to find who's worth keeping, who's burning money, and which applications to act on.

YOUR JOB:
1. Find the biggest partner/recruiter problem (negative ROI, low qualification, stale applications)
2. Recommend specific actions for specific recruiters/applications

RESPONSE FORMAT (JSON only):
{
  "diagnosis": {
    "bottleneck": "The partner problem",
    "dropoff_rate": "Key stat",
    "why": "1-2 sentences with specific data",
    "impact_chain": ["Because X...", "Y follows...", "Z for the business"],
    "severity": "critical" | "warning" | "info"
  },
  "supporting_signals": [
    { "signal": "Short label", "detail": "One sentence with numbers", "sentiment": "bad" | "okay" | "good" }
  ],
  "actions": [
    {
      "type": "pause_recruiter" | "approve_application" | "reject_application" | "deactivate_code" | "add_pipeline_note",
      "label": "Short action name",
      "description": "Why",
      "risk": "low" | "medium" | "high",
      "params": { ... }
    }
  ]
}

ACTION PARAMS:
- pause_recruiter: { "recruiter_id": "id", "reason": "why" }
- approve_application: { "application_id": "id" }
- reject_application: { "application_id": "id", "reason": "why" }
- deactivate_code: { "code_id": "id", "reason": "why" }
- add_pipeline_note: { "artist_ids": ["id"], "note": "text" }

RULES: Only use real IDs from the data. Max 4 actions.`;

  const userMessage = `Analyze partner/recruiter performance:

RECRUITERS (${recruiterData.length} total, sorted worst qual rate first):
${recruiterData.map(r => `- id:${r.id} "${r.name}" [${r.code}] (${r.tier}${r.isPartner ? ', PARTNER' : ''}) | ${r.totalReferred} referred, ${r.qualified} qual, ${r.churned} churned, ${r.pending} pending | qual:${r.qualRate}% | paid:$${(r.totalPaid / 100).toFixed(2)} | fee:$${(r.flatFee / 100).toFixed(0)}+${r.recurringRate}% | codes:${r.activeCodes} active/${r.inactiveCodes} inactive | ${r.daysSinceJoin}d old`).join('\n') || 'None'}

PENDING APPLICATIONS (${pendingApps.length}):
${pendingApps.map(a => `- id:${a.id} "${a.full_name}" (${a.email}) | platform:${a.platform} audience:${a.audience_size} | applied ${Math.round((Date.now() - new Date(a.created_at).getTime()) / 86400000)}d ago`).join('\n') || 'None'}

Return ONLY the JSON object. No markdown, no code fences.`;

  return { systemPrompt, userMessage };
}

// ============================================================
// FUNNEL SCOPE
// ============================================================
export async function buildFunnelScope(): Promise<ScopeResult> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);

  const [
    { data: artists },
    { data: sequences },
    { data: clicks },
  ] = await Promise.all([
    supabaseAdmin.from('artist_profiles').select('id, user_id, slug, platform_tier, activation_milestones, acquisition_source, recruited_by, created_at').gte('created_at', ninetyDaysAgo.toISOString()),
    supabaseAdmin.from('platform_sequences').select('trigger, name, is_active'),
    supabaseAdmin.from('referral_clicks').select('referral_code, source_type, converted, clicked_at').gte('clicked_at', ninetyDaysAgo.toISOString()),
  ]);

  const allArtists = artists || [];
  const allClicks = clicks || [];
  const milestones = (a: any) => (a.activation_milestones || {}) as Record<string, string>;

  // Funnel counts
  const funnel = {
    clicks: allClicks.length,
    signups: allArtists.length,
    onboarded: allArtists.filter(a => milestones(a).onboarding_completed).length,
    first_track: allArtists.filter(a => milestones(a).first_track_uploaded).length,
    tiers_created: allArtists.filter(a => milestones(a).tiers_created).length,
    stripe_connected: allArtists.filter(a => milestones(a).stripe_connected).length,
    paid_tier: allArtists.filter(a => a.platform_tier && a.platform_tier !== 'starter').length,
    first_subscriber: allArtists.filter(a => milestones(a).first_subscriber).length,
  };

  // Step conversions
  const steps = [
    { from: 'Clicks', to: 'Signups', fromVal: funnel.clicks, toVal: funnel.signups },
    { from: 'Signups', to: 'Onboarded', fromVal: funnel.signups, toVal: funnel.onboarded },
    { from: 'Onboarded', to: 'First Track', fromVal: funnel.onboarded, toVal: funnel.first_track },
    { from: 'First Track', to: 'Tiers Created', fromVal: funnel.first_track, toVal: funnel.tiers_created },
    { from: 'Tiers Created', to: 'Stripe Connected', fromVal: funnel.tiers_created, toVal: funnel.stripe_connected },
    { from: 'Stripe Connected', to: 'Paid Tier', fromVal: funnel.stripe_connected, toVal: funnel.paid_tier },
    { from: 'Paid Tier', to: 'First Subscriber', fromVal: funnel.paid_tier, toVal: funnel.first_subscriber },
  ].map(s => ({ ...s, rate: s.fromVal > 0 ? Math.round((s.toVal / s.fromVal) * 100) : 0, dropped: s.fromVal - s.toVal }));

  // Per-source breakdown
  const sources = ['organic', 'recruiter', 'partner', 'founding'];
  const sourceData = sources.map(src => {
    const sa = src === 'organic' ? allArtists.filter(a => !a.acquisition_source || a.acquisition_source === 'organic') : allArtists.filter(a => a.acquisition_source === src);
    return {
      source: src,
      signups: sa.length,
      onboarded: sa.filter(a => milestones(a).onboarding_completed).length,
      first_track: sa.filter(a => milestones(a).first_track_uploaded).length,
      paid: sa.filter(a => a.platform_tier && a.platform_tier !== 'starter').length,
      first_sub: sa.filter(a => milestones(a).first_subscriber).length,
    };
  });

  // Time to milestone
  const milestoneKeys = ['onboarding_completed', 'first_track_uploaded', 'tiers_created', 'stripe_connected', 'first_subscriber'];
  const timeToMilestone: Record<string, number | null> = {};
  for (const key of milestoneKeys) {
    const deltas: number[] = [];
    for (const a of allArtists) {
      const m = milestones(a);
      if (m[key]) {
        const days = (new Date(m[key]).getTime() - new Date(a.created_at).getTime()) / 86400000;
        if (days >= 0) deltas.push(days);
      }
    }
    timeToMilestone[key] = deltas.length > 0 ? Math.round((deltas.reduce((s, d) => s + d, 0) / deltas.length) * 10) / 10 : null;
  }

  // Stalled artists
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000);
  const stalled = allArtists
    .filter(a => new Date(a.created_at) < threeDaysAgo && (!milestones(a).first_track_uploaded || !milestones(a).stripe_connected))
    .slice(0, 10)
    .map(a => {
      const m = milestones(a);
      const missing = milestoneKeys.filter(k => !m[k]).map(k => k.replace('_uploaded', '').replace('_completed', '').replace('_connected', ''));
      return { id: a.id, slug: a.slug, source: a.acquisition_source || 'organic', days: Math.round((Date.now() - new Date(a.created_at).getTime()) / 86400000), missing };
    });

  const systemPrompt = `You are CRWN's Funnel Agent. You find where the acquisition funnel leaks, compare sources, and suggest fixes.

THE FUNNEL: Click → Signup → Onboarded → First Track → Tiers Created → Stripe Connected → Paid Tier → First Subscriber

YOUR JOB:
1. Find the BIGGEST dropoff step
2. Compare across acquisition sources (which source converts best/worst?)
3. Cross-reference with time-to-milestone and sequence availability
4. Suggest actions to fix the leak

RESPONSE FORMAT (JSON only):
{
  "diagnosis": {
    "bottleneck": "The funnel step with biggest dropoff",
    "dropoff_rate": "X% conversion at this step",
    "why": "1-2 sentences citing source comparison, time data, stalled artists",
    "impact_chain": ["Because X...", "Y follows...", "Z for revenue"],
    "severity": "critical" | "warning" | "info"
  },
  "supporting_signals": [
    { "signal": "Short label", "detail": "One sentence with numbers", "sentiment": "bad" | "okay" | "good" }
  ],
  "actions": [
    {
      "type": "toggle_sequence" | "enroll_in_sequence" | "flag_at_risk" | "add_pipeline_note",
      "label": "Action name", "description": "Why", "risk": "low"|"medium"|"high",
      "params": { ... }
    }
  ]
}

ACTION PARAMS:
- toggle_sequence: { "sequence_trigger": "name", "enable": true|false }
- enroll_in_sequence: { "sequence_trigger": "name", "artist_ids": ["id",...] }
- flag_at_risk: { "criteria": "desc", "from_stage": "stage" }
- add_pipeline_note: { "artist_ids": ["id",...], "note": "text" }

Max 4 actions. Only use real IDs and triggers.`;

  const userMessage = `Analyze the acquisition funnel (last 90 days, ${allArtists.length} artists):

OVERALL FUNNEL:
${steps.map(s => `- ${s.from} → ${s.to}: ${s.rate}% (${s.toVal}/${s.fromVal}, ${s.dropped} dropped)`).join('\n')}

TIME TO MILESTONE (avg days from signup):
${Object.entries(timeToMilestone).map(([k, v]) => `- ${k}: ${v !== null ? v + 'd' : 'N/A'}`).join('\n')}

BY SOURCE:
${sourceData.map(s => `- ${s.source}: ${s.signups} signups → ${s.onboarded} onboarded → ${s.first_track} track → ${s.paid} paid → ${s.first_sub} subscriber (${s.signups > 0 ? Math.round((s.first_sub / s.signups) * 100) : 0}% end-to-end)`).join('\n')}

STALLED ARTISTS (3+ days, missing milestones):
${stalled.map(a => `- id:${a.id} [${a.slug}] src:${a.source} ${a.days}d old, missing:[${a.missing.join(',')}]`).join('\n') || 'None'}

SEQUENCES:
${(sequences || []).map(s => `- "${s.trigger}" (${s.name}) — ${s.is_active ? 'ENABLED' : 'DISABLED'}`).join('\n')}

Return ONLY the JSON object. No markdown, no code fences.`;

  return { systemPrompt, userMessage };
}

// ============================================================
// SEQUENCES SCOPE
// ============================================================
export async function buildSequencesScope(): Promise<ScopeResult> {
  const [
    { data: sequences },
    { data: steps },
    { data: enrollments },
  ] = await Promise.all([
    supabaseAdmin.from('platform_sequences').select('id, trigger, name, is_active, created_at'),
    supabaseAdmin.from('platform_sequence_steps').select('sequence_id, step_number, delay_days, subject').order('step_number', { ascending: true }),
    supabaseAdmin.from('platform_sequence_enrollments').select('sequence_id, status, current_step, enrolled_at'),
  ]);

  const seqData = (sequences || []).map(s => {
    const seqSteps = (steps || []).filter(st => st.sequence_id === s.id);
    const seqEnrollments = (enrollments || []).filter(e => e.sequence_id === s.id);
    const active = seqEnrollments.filter(e => e.status === 'active');
    const completed = seqEnrollments.filter(e => e.status === 'completed');
    const canceled = seqEnrollments.filter(e => e.status === 'canceled');
    const stuckAtZero = active.filter(e => e.current_step === 0).length;
    const completionRate = (active.length + completed.length + canceled.length) > 0
      ? Math.round((completed.length / (active.length + completed.length + canceled.length)) * 100) : 0;

    return {
      id: s.id,
      trigger: s.trigger,
      name: s.name,
      isActive: s.is_active,
      stepCount: seqSteps.length,
      steps: seqSteps.map(st => ({ num: st.step_number, delay: st.delay_days, subject: st.subject })),
      enrolled: seqEnrollments.length,
      active: active.length,
      completed: completed.length,
      canceled: canceled.length,
      stuckAtZero,
      completionRate,
    };
  });

  const systemPrompt = `You are CRWN's Sequences Agent. You evaluate email automation sequences to find what's working, what's dead, and what needs adjustment.

YOUR JOB:
1. Find the biggest sequence problem (low completion rates, stuck enrollments, disabled sequences that should be on)
2. Look at step-level issues (too many steps? wrong delays?)
3. Suggest actions

RESPONSE FORMAT (JSON only):
{
  "diagnosis": {
    "bottleneck": "The sequence problem",
    "dropoff_rate": "Key stat",
    "why": "1-2 sentences with specific data",
    "impact_chain": ["Because X...", "Y follows...", "Z for activation"],
    "severity": "critical" | "warning" | "info"
  },
  "supporting_signals": [
    { "signal": "Short label", "detail": "One sentence with numbers", "sentiment": "bad" | "okay" | "good" }
  ],
  "actions": [
    {
      "type": "toggle_sequence" | "cancel_stale_enrollments",
      "label": "Action name", "description": "Why", "risk": "low"|"medium"|"high",
      "params": { ... }
    }
  ]
}

ACTION PARAMS:
- toggle_sequence: { "sequence_trigger": "trigger", "enable": true|false }
- cancel_stale_enrollments: { "sequence_id": "id", "stuck_days": 30 }

Max 4 actions. Only use real triggers and IDs.`;

  const userMessage = `Analyze sequences (${seqData.length} total):

${seqData.map(s => `SEQUENCE: "${s.name}" [trigger: ${s.trigger}] — ${s.isActive ? 'ENABLED' : 'DISABLED'}
  Steps (${s.stepCount}): ${s.steps.map(st => `Step ${st.num}: "${st.subject}" (delay ${st.delay}d)`).join(' → ')}
  Enrollments: ${s.enrolled} total | ${s.active} active | ${s.completed} completed (${s.completionRate}%) | ${s.canceled} canceled
  Stuck at step 0: ${s.stuckAtZero}
`).join('\n')}

Return ONLY the JSON object. No markdown, no code fences.`;

  return { systemPrompt, userMessage };
}

// ============================================================
// EMAIL HEALTH SCOPE
// ============================================================
export async function buildEmailScope(): Promise<ScopeResult> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

  const [
    { data: suppressions },
    { data: campaignSends },
    { data: sequenceSends },
    { data: unsubscribes },
  ] = await Promise.all([
    supabaseAdmin.from('email_suppressions').select('reason, source, created_at').order('created_at', { ascending: false }).limit(200),
    supabaseAdmin.from('campaign_sends').select('status, channel, created_at').gte('created_at', thirtyDaysAgo.toISOString()),
    supabaseAdmin.from('sequence_sends').select('status, created_at').gte('created_at', thirtyDaysAgo.toISOString()),
    supabaseAdmin.from('unsubscribe_events').select('scope, created_at').gte('created_at', thirtyDaysAgo.toISOString()),
  ]);

  const allCampaign = campaignSends || [];
  const allSequence = sequenceSends || [];
  const allSuppressions = suppressions || [];
  const allUnsubs = unsubscribes || [];

  // Campaign stats
  const campaignTotal = allCampaign.filter(s => s.channel !== 'sms').length;
  const campaignBounced = allCampaign.filter(s => s.status === 'bounced').length;
  const campaignFailed = allCampaign.filter(s => s.status === 'failed').length;
  const campaignOpened = allCampaign.filter(s => s.status === 'opened' || s.status === 'clicked').length;
  const campaignClicked = allCampaign.filter(s => s.status === 'clicked').length;

  // Sequence stats
  const seqTotal = allSequence.length;
  const seqBounced = allSequence.filter(s => s.status === 'bounced').length;
  const seqOpened = allSequence.filter(s => s.status === 'opened' || s.status === 'clicked').length;

  // Suppression breakdown
  const recentSuppressions = allSuppressions.filter(s => new Date(s.created_at) >= sevenDaysAgo).length;
  const hardBounces = allSuppressions.filter(s => s.reason === 'hard_bounce').length;
  const spamComplaints = allSuppressions.filter(s => s.reason === 'spam').length;

  const deliverabilityRate = campaignTotal > 0 ? Math.round(((campaignTotal - campaignBounced) / campaignTotal) * 100) : 100;

  const systemPrompt = `You are CRWN's Email Health Agent. You monitor email deliverability, bounces, spam risk, and engagement.

BENCHMARKS:
- Deliverability >=95% = healthy. 90-94% = warning. <90% = critical (heading for spam)
- Spam complaints: ANY = red flag. > 0.1% complaint rate = emergency
- Open rate: >40% = great. 20-40% = normal. <20% = problem
- Bounce rate: <2% = healthy. 2-5% = clean your list. >5% = critical

YOUR JOB:
1. Assess overall email health
2. Flag specific problems (deliverability drops, suppression spikes, engagement drops)
3. Suggest actions

RESPONSE FORMAT (JSON only):
{
  "diagnosis": {
    "bottleneck": "The email health issue",
    "dropoff_rate": "Key stat",
    "why": "1-2 sentences with data",
    "impact_chain": ["Because X...", "Y follows...", "Z for deliverability"],
    "severity": "critical" | "warning" | "info"
  },
  "supporting_signals": [
    { "signal": "Label", "detail": "Detail", "sentiment": "bad" | "okay" | "good" }
  ],
  "actions": [
    {
      "type": "toggle_sequence" | "send_briefing",
      "label": "Action", "description": "Why", "risk": "low"|"medium"|"high",
      "params": { ... }
    }
  ]
}

Max 3 actions.`;

  const userMessage = `Analyze email health (last 30 days):

CAMPAIGNS:
- Sent: ${campaignTotal} | Bounced: ${campaignBounced} | Failed: ${campaignFailed}
- Opened: ${campaignOpened} (${campaignTotal > 0 ? Math.round((campaignOpened / campaignTotal) * 100) : 0}%) | Clicked: ${campaignClicked} (${campaignTotal > 0 ? Math.round((campaignClicked / campaignTotal) * 100) : 0}%)

SEQUENCES:
- Sent: ${seqTotal} | Bounced: ${seqBounced}
- Opened: ${seqOpened} (${seqTotal > 0 ? Math.round((seqOpened / seqTotal) * 100) : 0}%)

DELIVERABILITY: ${deliverabilityRate}%

SUPPRESSIONS: ${allSuppressions.length} total (${recentSuppressions} in last 7 days)
- Hard bounces: ${hardBounces} | Spam complaints: ${spamComplaints}

UNSUBSCRIBES (30d): ${allUnsubs.length}
- Global opt-outs: ${allUnsubs.filter(u => u.scope === 'global').length}

Return ONLY the JSON object. No markdown, no code fences.`;

  return { systemPrompt, userMessage };
}
