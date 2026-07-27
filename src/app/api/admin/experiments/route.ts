import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { EXPERIMENT_CONFIGS, getExperimentConfig } from '@/lib/experiments/registry';
import { METRIC_DEFINITIONS } from '@/lib/experiments/metrics';
import { isExperimentsEnabled } from '@/lib/experiments/server';

// Admin-only. Lists prebuilt experiment configs merged with their DB operational state, and updates
// that state (status/allocation/conclusion/winner/notes) for a KNOWN config key only. It can never
// create a new behavior: an unknown key, status, variant, or out-of-range allocation is rejected.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const STATUSES = ['draft', 'scheduled', 'running', 'paused', 'completed', 'archived'];

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  let rows: Record<string, Record<string, unknown>> = {};
  try {
    const { data } = await supabaseAdmin.from('experiments').select('*').limit(200);
    if (Array.isArray(data)) rows = Object.fromEntries(data.map((r) => [r.key as string, r]));
  } catch {
    rows = {}; // pre-migration: show configs as draft
  }

  const experiments = EXPERIMENT_CONFIGS.map((cfg) => {
    const row = rows[cfg.key];
    return {
      key: cfg.key,
      title: cfg.title,
      hypothesis: cfg.hypothesis,
      experienceKeys: cfg.experienceKeys,
      variants: cfg.variants.map((v) => ({ key: v.key, title: v.title, isControl: !!v.isControl })),
      primaryMetric: cfg.primaryMetric,
      secondaryMetrics: cfg.secondaryMetrics,
      configVersion: cfg.configVersion,
      status: (row?.status as string) || 'draft',
      allocation: (row?.allocation as Record<string, number>) || {},
      startAt: (row?.start_at as string) || null,
      endAt: (row?.end_at as string) || null,
      conclusion: (row?.conclusion as string) || null,
      winnerVariant: (row?.winner_variant as string) || null,
      notes: (row?.notes as string) || null,
      stopReason: (row?.stop_reason as string) || null,
    };
  });

  const enabled = await isExperimentsEnabled(supabaseAdmin);
  return NextResponse.json({ enabled, experiments, metricDefinitions: METRIC_DEFINITIONS });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  let body: {
    key?: string;
    status?: string;
    allocation?: Record<string, number>;
    startAt?: string | null;
    endAt?: string | null;
    conclusion?: string | null;
    winnerVariant?: string | null;
    notes?: string | null;
    stopReason?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const cfg = getExperimentConfig(String(body.key || ''));
  if (!cfg) return NextResponse.json({ error: 'Unknown experiment' }, { status: 404 });

  const variantKeys = new Set(cfg.variants.map((v) => v.key));

  // Validate status.
  const status = body.status && STATUSES.includes(body.status) ? body.status : undefined;
  if (body.status && !status) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });

  // Validate allocation: only known variants, whole percents 0-100.
  let allocation: Record<string, number> | undefined;
  if (body.allocation && typeof body.allocation === 'object') {
    allocation = {};
    for (const [k, v] of Object.entries(body.allocation)) {
      if (!variantKeys.has(k)) return NextResponse.json({ error: `Unknown variant ${k}` }, { status: 400 });
      const pct = Number(v);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) return NextResponse.json({ error: 'Invalid allocation' }, { status: 400 });
      allocation[k] = Math.round(pct);
    }
  }

  // Validate winner.
  if (body.winnerVariant && !variantKeys.has(body.winnerVariant)) {
    return NextResponse.json({ error: 'Unknown winner variant' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    key: cfg.key,
    config_version: cfg.configVersion,
    updated_at: new Date().toISOString(),
  };
  if (status) patch.status = status;
  if (allocation) patch.allocation = allocation;
  if (body.startAt !== undefined) patch.start_at = body.startAt;
  if (body.endAt !== undefined) patch.end_at = body.endAt;
  if (body.conclusion !== undefined) patch.conclusion = body.conclusion ? String(body.conclusion).slice(0, 2000) : null;
  if (body.winnerVariant !== undefined) patch.winner_variant = body.winnerVariant || null;
  if (body.notes !== undefined) patch.notes = body.notes ? String(body.notes).slice(0, 2000) : null;
  if (body.stopReason !== undefined) patch.stop_reason = body.stopReason ? String(body.stopReason).slice(0, 500) : null;

  try {
    const { error } = await supabaseAdmin.from('experiments').upsert(patch, { onConflict: 'key' });
    if (error) return NextResponse.json({ error: 'Could not save (has the migration been applied?)' }, { status: 500 });
  } catch {
    return NextResponse.json({ error: 'Could not save (has the migration been applied?)' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
