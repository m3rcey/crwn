import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { validateUpload } from '@/lib/uploadValidation';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy-anon-key-for-build';
const ALERT_EMAIL = 'joshn.wms@gmail.com';

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

export const maxDuration = 30;

type Check = { name: string; ok: boolean; detail: string };

/**
 * Daily synthetic onboarding health-check (a "canary").
 *
 * Exercises the EXACT path a new artist takes and alerts the founder by email
 * the moment any step breaks — instead of an artist discovering it weeks later.
 * This is the safety net for the class of outage where a half-applied migration
 * silently broke artist publishing for months (missing artist_gate_enabled()).
 *
 * It does the real thing, under real RLS:
 *   1. The gate function exists and is callable
 *   2. A throwaway authenticated user can actually INSERT an artist_profiles row
 *   3. The track-upload validator accepts common audio and rejects junk
 * Then it deletes the throwaway user (cascades away the test row).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const checks: Check[] = [];
  // Unique per run so a crashed cleanup never blocks the next day's run.
  const stamp = Date.now();
  const email = `onboarding-canary-${stamp}@thecrwn.app`;
  const password = `Canary!${stamp}`;
  const slug = `__canary-${stamp}`;
  let testUserId: string | null = null;

  try {
    // 1. The gate function must exist and be callable (the exact thing that broke).
    {
      const { data, error } = await supabaseAdmin.rpc('artist_gate_enabled');
      if (error) {
        checks.push({ name: 'gate_function', ok: false, detail: `artist_gate_enabled() not callable: ${error.message}` });
      } else {
        checks.push({ name: 'gate_function', ok: true, detail: `gate enabled = ${data}` });
      }
    }

    // 2. A real authenticated user must be able to publish an artist page (RLS insert).
    {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email, password, email_confirm: true,
      });
      if (createErr || !created?.user) {
        checks.push({ name: 'publish_insert', ok: false, detail: `could not create test user: ${createErr?.message || 'no user'}` });
      } else {
        testUserId = created.user.id;
        const userClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
        const { error: signInErr } = await userClient.auth.signInWithPassword({ email, password });
        if (signInErr) {
          checks.push({ name: 'publish_insert', ok: false, detail: `test user sign-in failed: ${signInErr.message}` });
        } else {
          const { error: insertErr } = await userClient
            .from('artist_profiles')
            .insert({ user_id: testUserId, slug, tagline: 'canary', banner_url: '', city: '', state: '', genres: [] });
          if (insertErr) {
            checks.push({ name: 'publish_insert', ok: false, detail: `artist_profiles insert blocked (${insertErr.code}): ${insertErr.message}` });
          } else {
            checks.push({ name: 'publish_insert', ok: true, detail: 'authenticated user published a page successfully' });
          }
        }
      }
    }

    // 3. The track-upload validator must accept common audio and reject non-audio.
    {
      const mk = (name: string, type: string) => ({ name, type, size: 5_000_000 }) as unknown as File;
      const shouldPass = [mk('song.mp3', 'audio/mpeg'), mk('beat.m4a', ''), mk('master.wav', 'audio/x-wav'), mk('mix.flac', 'audio/flac')];
      const shouldFail = mk('virus.exe', 'application/octet-stream');
      const passFails = shouldPass.filter((f) => !validateUpload(f, 'audio').valid).map((f) => f.name);
      const junkAccepted = validateUpload(shouldFail, 'audio').valid;
      if (passFails.length || junkAccepted) {
        checks.push({ name: 'audio_validation', ok: false, detail: `rejected valid audio: [${passFails.join(', ')}]; accepted junk: ${junkAccepted}` });
      } else {
        checks.push({ name: 'audio_validation', ok: true, detail: 'accepts mp3/m4a/wav/flac, rejects .exe' });
      }
    }
  } catch (e) {
    checks.push({ name: 'unexpected_error', ok: false, detail: e instanceof Error ? e.message : String(e) });
  } finally {
    // Cleanup: deleting the auth user cascades away the profiles + artist_profiles rows.
    if (testUserId) {
      try { await supabaseAdmin.auth.admin.deleteUser(testUserId); } catch { /* best-effort */ }
    }
  }

  const failed = checks.filter((c) => !c.ok);
  const healthy = failed.length === 0;

  if (!healthy) {
    const rows = checks
      .map((c) => `<tr><td style="padding:8px 0;color:#666;font-size:14px;">${c.ok ? '✅' : '🔴'} ${c.name}</td><td style="padding:8px 0;color:#FFF;font-size:14px;text-align:right;">${c.detail}</td></tr>`)
      .join('');
    const html = `
      <div style="background-color:#1A1A1A;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <div style="max-width:520px;margin:0 auto;">
          <div style="text-align:center;margin-bottom:32px;"><h1 style="color:#D4AF37;font-size:28px;font-weight:bold;margin:0;">CRWN</h1></div>
          <div style="background-color:#242424;border-radius:12px;padding:32px;border:1px solid #B00;">
            <h2 style="color:#FFF;font-size:20px;font-weight:600;margin:0 0 8px 0;">🔴 Onboarding is broken</h2>
            <p style="color:#999;font-size:14px;margin:0 0 24px 0;">A new artist can't complete signup right now. ${failed.length} check(s) failed.</p>
            <table style="width:100%;border-collapse:collapse;">${rows}</table>
          </div>
        </div>
      </div>`;
    try {
      await resend.emails.send({ from: FROM_EMAIL, to: ALERT_EMAIL, subject: `🔴 CRWN onboarding broken: ${failed.map((f) => f.name).join(', ')}`, html });
    } catch (e) {
      console.error('onboarding-health: alert email failed', e);
    }
  }

  return NextResponse.json({ healthy, checks, checkedAt: new Date().toISOString() }, { status: healthy ? 200 : 500 });
}
