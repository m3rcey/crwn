import { NextRequest, NextResponse } from 'next/server';
import { resend, FROM_EMAIL } from '@/lib/resend';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy-anon-key-for-build';
const ALERT_EMAIL = 'joshn.wms@gmail.com';

export const maxDuration = 30;

type Check = { name: string; ok: boolean; detail: string };

/**
 * Daily RLS / grant canary.
 *
 * Every leak this repo has fixed had the same signature: the gate lived in the
 * client, the database happily served the data to anyone holding the public anon
 * key, and NOTHING NOTICED. A migration that re-runs `GRANT SELECT ON tracks TO
 * anon` — one line, trivially easy to write by accident — silently reopens the
 * paid catalogue.
 *
 * The only check that can catch that is the one made from OUTSIDE, with the anon
 * key, exactly as an attacker would. `pg_policies` cannot see it, and a migration's
 * own `DO $$` block runs as a BYPASSRLS role and passes vacuously.
 *
 * So this route holds nothing but the anon key and talks raw PostgREST. It asserts
 * the negative space: things that MUST be denied, plus the public surfaces that
 * MUST still work, so a "fix" that empties the feed also trips the alarm.
 *
 * Deliberately does NOT use supabase-js: the client normalises errors, and here the
 * HTTP status IS the assertion.
 */
async function rest(path: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    cache: 'no-store',
  });
  return { status: res.status, body: await res.text() };
}

async function restWrite(path: string, payload: unknown): Promise<number> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  return res.status;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const checks: Check[] = [];

  try {
    // ── 1. Paid track audio must be UNREADABLE on the base table ──────────────
    // Column privileges: anon holds SELECT on every column of `tracks` EXCEPT
    // audio_url_128/320. A table-level GRANT would re-cover them, so this is the
    // assertion that a careless `GRANT SELECT ON tracks TO anon` cannot survive.
    for (const col of ['audio_url_320', 'audio_url_128']) {
      const { status, body } = await rest(`tracks?select=${col}&limit=1`);
      const denied = status === 401 || status === 403;
      checks.push({
        name: `tracks.${col}_denied`,
        ok: denied,
        detail: denied
          ? `denied (${status})`
          : `LEAK: anon read ${col}, http ${status}: ${body.slice(0, 120)}`,
      });
    }

    // The wildcard door. PostgREST expands `*` in the database, so it must fail too.
    {
      const { status, body } = await rest('tracks?select=*&limit=1');
      const denied = status === 401 || status === 403;
      checks.push({
        name: 'tracks_select_star_denied',
        ok: denied,
        detail: denied ? `denied (${status})` : `LEAK: select=* returned http ${status}: ${body.slice(0, 120)}`,
      });
    }

    // ── 2. …while track METADATA still works, or the whole app is blank ───────
    {
      const { status, body } = await rest('tracks?select=id,title,price,is_free&limit=1');
      const ok = status === 200 && body.includes('"id"');
      checks.push({
        name: 'tracks_metadata_readable',
        ok,
        detail: ok ? 'anon reads id/title/price' : `BROKEN: http ${status}: ${body.slice(0, 120)}`,
      });
    }

    // ── 3. tracks_public redacts paid audio for anonymous readers ─────────────
    {
      const { status, body } = await rest('tracks_public?select=id,can_play,audio_url_320&is_free=eq.false');
      let ok = status === 200;
      let detail = `http ${status}`;
      if (ok) {
        const rows = JSON.parse(body) as { can_play: boolean; audio_url_320: string | null }[];
        const leaked = rows.filter((r) => r.audio_url_320 !== null);
        ok = leaked.length === 0;
        detail = ok
          ? `${rows.length} paid track(s), all redacted`
          : `LEAK: ${leaked.length} paid track(s) expose audio through the view`;
      }
      checks.push({ name: 'tracks_public_redacts_paid', ok, detail });
    }

    // ── 4. …and still SERVES free audio, or the player is silent ─────────────
    {
      const { status, body } = await rest('tracks_public?select=audio_url_128&is_free=eq.true&limit=1');
      let ok = status === 200;
      let detail = `http ${status}`;
      if (ok) {
        const rows = JSON.parse(body) as { audio_url_128: string | null }[];
        ok = rows.length > 0 && !!rows[0].audio_url_128;
        detail = ok ? 'free track streams' : 'BROKEN: free tracks return no audio — the player is silent';
      }
      checks.push({ name: 'tracks_public_serves_free', ok, detail });
    }

    // ── 5. Stripe ids stay unreadable on artist_profiles ─────────────────────
    // Not a credential -- an acct_ id cannot move money without the platform's
    // secret key -- but no browser has any reason to read it.
    for (const col of ['stripe_connect_id', 'platform_stripe_customer_id']) {
      const { status, body } = await rest(`artist_profiles?select=${col}&limit=1`);
      const denied = status === 401 || status === 403;
      checks.push({
        name: `artist_profiles.${col}_denied`,
        ok: denied,
        detail: denied ? `denied (${status})` : `LEAK: anon read ${col}, http ${status}: ${body.slice(0, 120)}`,
      });
    }

    {
      const { status, body } = await rest('artist_profiles?select=*&limit=1');
      const denied = status === 401 || status === 403;
      checks.push({
        name: 'artist_profiles_select_star_denied',
        ok: denied,
        detail: denied ? `denied (${status})` : `LEAK: select=* returned http ${status}: ${body.slice(0, 120)}`,
      });
    }

    // …while the public artist page's source still works, or every profile 500s.
    {
      const { status, body } = await rest('artist_profiles_public?select=slug,platform_tier&limit=1');
      const ok = status === 200 && body.includes('"slug"');
      checks.push({
        name: 'artist_profiles_public_readable',
        ok,
        detail: ok ? 'anon reads the redacted view' : `BROKEN: http ${status}: ${body.slice(0, 120)}`,
      });
    }

    // ── 6. Paid community posts stay unreadable (the first leak we closed) ────
    {
      const { status, body } = await rest('community_posts?select=id,content&is_free=eq.false&limit=1');
      // Either the rows are invisible (RLS) or the request is denied. Both are fine.
      const ok = (status === 200 && body.trim() === '[]') || status === 401 || status === 403;
      checks.push({
        name: 'paid_community_posts_hidden',
        ok,
        detail: ok ? 'no paid posts visible to anon' : `LEAK: http ${status}: ${body.slice(0, 120)}`,
      });
    }

    // ── 7. Agent tables reject anonymous writes (the second leak we closed) ───
    {
      const status = await restWrite('agent_coordination', { lock_key: '__canary_should_never_insert' });
      const denied = status === 401 || status === 403;
      checks.push({
        name: 'agent_coordination_write_denied',
        ok: denied,
        detail: denied ? `denied (${status})` : `LEAK: anon write returned http ${status}`,
      });
    }
  } catch (e) {
    checks.push({
      name: 'unexpected_error',
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  const failed = checks.filter((c) => !c.ok);
  const healthy = failed.length === 0;

  if (!healthy) {
    const rows = checks
      .map(
        (c) =>
          `<tr><td style="padding:8px 0;color:#666;font-size:14px;">${c.ok ? '✅' : '🔴'} ${c.name}</td><td style="padding:8px 0;color:#FFF;font-size:14px;text-align:right;">${c.detail}</td></tr>`
      )
      .join('');
    const html = `
      <div style="background-color:#1A1A1A;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <div style="max-width:520px;margin:0 auto;">
          <div style="text-align:center;margin-bottom:32px;"><h1 style="color:#D4AF37;font-size:28px;font-weight:bold;margin:0;">CRWN</h1></div>
          <div style="background-color:#242424;border-radius:12px;padding:32px;border:1px solid #B00;">
            <h2 style="color:#FFF;font-size:20px;font-weight:600;margin:0 0 8px 0;">🔴 RLS canary tripped</h2>
            <p style="color:#999;font-size:14px;margin:0 0 24px 0;">Checked from outside with the public anon key. ${failed.length} check(s) failed. A failure named LEAK means data is exposed right now; a failure named BROKEN means a fix emptied a public surface.</p>
            <table style="width:100%;border-collapse:collapse;">${rows}</table>
          </div>
        </div>
      </div>`;
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: ALERT_EMAIL,
        subject: `🔴 CRWN RLS canary: ${failed.map((f) => f.name).join(', ')}`,
        html,
      });
    } catch (e) {
      console.error('rls-canary: alert email failed', e);
    }
  }

  return NextResponse.json(
    { healthy, checks, checkedAt: new Date().toISOString() },
    { status: healthy ? 200 : 500 }
  );
}
