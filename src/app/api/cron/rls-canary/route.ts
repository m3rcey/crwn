import { NextRequest, NextResponse } from 'next/server';
import { resend, FROM_EMAIL } from '@/lib/resend';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy-anon-key-for-build';
const ALERT_EMAIL = 'joshn.wms@gmail.com';

/**
 * The origin a STRANGER uses, which is the only one worth asserting against.
 *
 * Hardcoded, and deliberately not an env var. This canary's whole job is to prove
 * what the LIVE PUBLIC surface serves, so the one thing it must never be is
 * configurable into pointing somewhere else: Vercel env vars cannot be read back
 * to check (`vercel env pull` returns empty strings for sensitive ones), so a
 * wrong value here would be an alarm quietly guarding the wrong door.
 *
 * Never `req.nextUrl.origin`, which is what this used to be: inside a Vercel cron
 * that resolves to the protected deployment url (*.vercel.app), whose Vercel
 * Authentication wall answers EVERY path with an http 200 html page. Probing it
 * told this canary the stream route had served a paid track (200 != 403), and the
 * same html then broke the next check's JSON.parse. Both alarms were the wall.
 */
const PUBLIC_ORIGIN = 'https://thecrwn.app';

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
/**
 * Fetch a URL as a bare, credential-less stranger would.
 *
 * `Range: bytes=0-0` keeps a 41MB master from being pulled into a 30s cron just
 * to learn its status code. A denial answers with a small JSON body regardless.
 */
async function fetchAnonymously(url: string): Promise<{ status: number; contentType: string }> {
  const res = await fetch(url, { headers: { Range: 'bytes=0-0' }, cache: 'no-store' });
  return { status: res.status, contentType: res.headers.get('content-type') || '' };
}

/**
 * Ask the stream route for a track's audio, exactly as a logged-out stranger does.
 *
 * A leak is PROVEN by a signed url coming back. It is never INFERRED from "the
 * status was not 403", because an auth wall, an outage, a 404 and a redirect all
 * fail to be 403 while leaking precisely nothing. Reporting those as a LEAK is how
 * a canary teaches its reader to ignore it, and this one guards the paid
 * catalogue: the day it cries wolf is the day the real leak gets archived.
 *
 * So the answer is the signed url or an honest "I could not tell".
 */
async function probeStream(
  id: string
): Promise<{ status: number; signedUrl: string | null; html: boolean }> {
  const res = await fetch(`${PUBLIC_ORIGIN}/api/tracks/${id}/stream`, { cache: 'no-store' });
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  if (!isJson) return { status: res.status, signedUrl: null, html: true };

  const body = (await res.json().catch(() => null)) as { url?: unknown } | null;
  const url = typeof body?.url === 'string' ? body.url : null;
  return {
    status: res.status,
    signedUrl: url?.includes('/object/sign/audio/') ? url : null,
    html: false,
  };
}

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

async function restRpc(fn: string, payload: unknown): Promise<{ status: number; body: string }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  return { status: res.status, body: await res.text() };
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

    // ── 8. The entitlement helpers cannot be used as an oracle ────────────────
    // These stay EXECUTE-able (the SECURITY DEFINER views call them with the
    // INVOKER's privilege, so revoking EXECUTE would break tracks_public /
    // community_posts_feed). Instead the functions IGNORE their p_user argument
    // and answer only for auth.uid(). So anon spoofing a paid track's OWNER must
    // still come back false -- true would mean the oracle is open again.
    // Ids are discovered live so this never rots against a deleted seed row.
    {
      const paid = await rest('tracks_public?select=id,artist_id&is_free=eq.false&limit=1');
      const paidRows = paid.status === 200 ? (JSON.parse(paid.body) as { id: string; artist_id: string }[]) : [];
      if (paidRows.length === 0) {
        checks.push({ name: 'can_play_track_not_an_oracle', ok: true, detail: 'no paid track to probe (vacuous)' });
      } else {
        const owner = await rest(`artist_profiles_public?select=user_id&id=eq.${paidRows[0].artist_id}`);
        const ownerId = owner.status === 200 ? (JSON.parse(owner.body)[0]?.user_id ?? null) : null;
        const { status, body } = await restRpc('can_play_track', { p_track: paidRows[0].id, p_user: ownerId });
        const leaked = status === 200 && body.trim() === 'true';
        checks.push({
          name: 'can_play_track_not_an_oracle',
          ok: !leaked,
          detail: leaked
            ? 'LEAK: anon read true for a paid track by spoofing p_user (the owner)'
            : `answers only for the caller (http ${status}, body ${body.slice(0, 12)})`,
        });
      }
    }
    // ── 9. The `audio` Storage bucket must stay PRIVATE ──────────────────────
    // Column redaction stopped enumeration but revoked nothing: while the bucket
    // was public, any url scraped beforehand resolved forever, to anyone. Only a
    // private bucket expires a url that already escaped.
    //
    // Anon cannot read a PAID track's url (that is check 1, and the point). It can
    // read a FREE one's, and `public` is a property of the BUCKET, not the object --
    // so a free track's raw url resolving proves the bucket is open, which means the
    // paid masters are downloadable too. The readable row probes for the unreadable one.
    //
    // Plain GET on purpose. That is the attacker's request, so it is the one worth
    // asserting. (Right after a flip, Cloudflare may still serve a copy it cached
    // while the bucket was public -- `Cache-Control: public, max-age=3600`. The
    // origin cannot refill it, so it drains inside the hour, long before this
    // daily cron next runs.)
    {
      const { status, body } = await rest(
        'tracks_public?select=audio_url_128&is_free=eq.true&audio_url_128=not.is.null&limit=1'
      );
      const raw = status === 200 ? (JSON.parse(body) as { audio_url_128: string }[])[0]?.audio_url_128 : null;
      if (!raw || !raw.includes('/storage/v1/object/public/audio/')) {
        checks.push({
          name: 'audio_bucket_private',
          ok: true,
          detail: 'no free track with a public-format locator to probe (vacuous)',
        });
      } else {
        const { status: rawStatus, contentType } = await fetchAnonymously(raw);
        const denied = rawStatus >= 400 && rawStatus < 500;
        checks.push({
          name: 'audio_bucket_private',
          ok: denied,
          detail: denied
            ? `raw object url refused (${rawStatus})`
            : `LEAK: the audio bucket is PUBLIC again — raw url served http ${rawStatus} (${contentType}). Every paid master is downloadable by anyone holding its url.`,
        });
      }
    }

    // ── 10. The signer gates on entitlement, and still serves the entitled ────
    // /api/tracks/[id]/stream reads tracks_public as its caller, so a NULL url is
    // the 403. With the bucket private this route IS playback: if it stops signing,
    // the player goes silent everywhere; if it stops refusing, the flip bought
    // nothing. Both directions are asserted, unauthenticated, against this very
    // deployment.
    {
      const paid = await rest('tracks_public?select=id&is_free=eq.false&limit=1');
      const paidId = paid.status === 200 ? (JSON.parse(paid.body) as { id: string }[])[0]?.id : null;
      if (!paidId) {
        checks.push({ name: 'stream_route_denies_paid', ok: true, detail: 'no paid track to probe (vacuous)' });
      } else {
        const { status, signedUrl, html } = await probeStream(paidId);
        if (signedUrl) {
          checks.push({
            name: 'stream_route_denies_paid',
            ok: false,
            detail: `LEAK: the stream route handed anon a signed url for a paid track (http ${status})`,
          });
        } else if (status === 403) {
          checks.push({
            name: 'stream_route_denies_paid',
            ok: true,
            detail: 'paid track refused to anon (403)',
          });
        } else {
          checks.push({
            name: 'stream_route_denies_paid',
            ok: false,
            detail: html
              ? `INCONCLUSIVE (not a leak): ${PUBLIC_ORIGIN} answered with an html page, http ${status}. No audio was served. The canary could not reach the stream route.`
              : `INCONCLUSIVE (not a leak): no signed url came back, but the route answered http ${status} instead of 403.`,
          });
        }
      }
    }

    {
      const free = await rest('tracks_public?select=id&is_free=eq.true&limit=1');
      const freeId = free.status === 200 ? (JSON.parse(free.body) as { id: string }[])[0]?.id : null;
      if (!freeId) {
        checks.push({ name: 'stream_route_signs_free', ok: true, detail: 'no free track to probe (vacuous)' });
      } else {
        const { status, signedUrl, html } = await probeStream(freeId);
        let ok = false;
        let detail: string;
        if (html) {
          detail = `BROKEN: ${PUBLIC_ORIGIN} answered with an html page, http ${status}. The canary could not reach the stream route.`;
        } else if (!signedUrl) {
          detail = `BROKEN: stream route returned no /object/sign/ url (http ${status}). The player is silent.`;
        } else {
          // Signed, but does the signature actually open the door?
          const { status: signedStatus } = await fetchAnonymously(signedUrl);
          ok = signedStatus === 200 || signedStatus === 206;
          detail = ok
            ? `free track signed and streams (${signedStatus})`
            : `BROKEN: signed url did not resolve, http ${signedStatus}`;
        }
        checks.push({ name: 'stream_route_signs_free', ok, detail });
      }
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
