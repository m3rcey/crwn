import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { recordLmEvent } from '@/lib/leadMagnets/server';

// PUBLIC analytics sink. Append-only. The server allowlists fields (recordLmEvent),
// so no raw email/phone/answers/payloads can land here even if a client sends them.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const ALLOWED_EVENTS = new Set([
  'lead_magnet_directory_viewed',
  'lead_magnet_viewed',
  'lead_magnet_started',
  'lead_magnet_step_completed',
  'lead_magnet_step_back',
  'lead_magnet_abandoned',
  'lead_magnet_preview_viewed',
  'lead_magnet_lead_capture_viewed',
  'lead_magnet_lead_submitted',
  'lead_magnet_result_generated',
  'lead_magnet_result_unlocked',
  'lead_magnet_result_saved',
  'lead_magnet_result_emailed',
  'lead_magnet_result_shared',
  'lead_magnet_signup_clicked',
  'lead_magnet_login_clicked',
  'lead_magnet_conversion_started',
  'lead_magnet_conversion_completed',
  'lead_magnet_conversion_failed',
  'lead_magnet_result_archived',
]);

export async function POST(req: NextRequest) {
  let body: { event?: string; meta?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const event = String(body.event || '');
  if (!ALLOWED_EVENTS.has(event)) return NextResponse.json({ ok: false }, { status: 400 });

  await recordLmEvent(supabaseAdmin, event, body.meta || {});
  return NextResponse.json({ ok: true });
}
