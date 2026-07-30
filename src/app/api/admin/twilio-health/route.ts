import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';

// Admin-only Twilio diagnostics, READ ONLY.
//
// This exists because SMS was debugged blind twice. Twilio's failure text blames the from-number
// for what was actually a test-credential problem, and "Twilio accepted the message" is not the
// same fact as "the phone rang". Neither question can be answered from outside the deployment,
// because only production holds the live credentials.
//
// So: ask Twilio directly, from the server that has the keys, and report it in plain English.
// It NEVER returns the auth token, and it reports the founder alert number only as a masked
// suffix, which is enough to catch a format mistake without printing a personal cell.
export const dynamic = 'force-dynamic';

const SID = process.env.TWILIO_ACCOUNT_SID || '';
const TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const FROM = process.env.TWILIO_PHONE_NUMBER || '';
const FOUNDER = process.env.FOUNDER_ALERT_PHONE || '';

/** Plain-English meaning for the delivery failures that actually happen. */
const ERROR_HINTS: Record<string, string> = {
  '30003': 'The handset was unreachable (off, out of coverage, or blocking).',
  '30004': 'The carrier blocked the message (often the recipient replied STOP at some point).',
  '30005': 'Unknown destination handset. The number does not exist or cannot receive SMS.',
  '30006': 'Landline or a carrier that cannot receive SMS.',
  '30007': 'CARRIER SPAM FILTER. US carriers block application-to-person traffic that is not registered under A2P 10DLC.',
  '30034': 'A2P 10DLC NOT REGISTERED. US carriers reject business SMS from an unregistered number. This is a Twilio registration task, not a code problem.',
  '21606': 'That from-number is not a valid, SMS-capable number ON THIS ACCOUNT.',
  '21610': 'The recipient previously replied STOP to this number.',
  '20008': 'TEST credentials are configured, so no real SMS can ever send. Replace with the live pair.',
};

async function twilio(path: string): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const auth = Buffer.from(`${SID}:${TOKEN}`).toString('base64');
  const res = await fetch(`https://api.twilio.com${path}`, {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(8000),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body };
}

function maskTail(n: string): string {
  if (!n) return 'NOT SET';
  const digits = n.replace(/\D/g, '');
  return `${n.startsWith('+') ? 'E.164 ok (+)' : 'MISSING + PREFIX'}, ${digits.length} digits, ends ${digits.slice(-4)}`;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  if (!SID || !TOKEN) {
    return NextResponse.json({ error: 'Twilio is not configured (missing SID or token).' }, { status: 200 });
  }

  const out: Record<string, unknown> = {
    configured: {
      accountSidPrefix: `${SID.slice(0, 6)}…`,
      isTestCredentials: null as boolean | null,
      senderNumber: FROM || 'NOT SET',
      founderAlertPhone: maskTail(FOUNDER),
    },
  };

  // 1. Account: live or trial, and are these test credentials?
  const acct = await twilio(`/2010-04-01/Accounts/${SID}.json`);
  if (acct.body.code === 20008) {
    (out.configured as Record<string, unknown>).isTestCredentials = true;
    out.verdict = 'TEST credentials are configured. No real SMS can send. Replace TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN with the live pair.';
    return NextResponse.json(out);
  }
  (out.configured as Record<string, unknown>).isTestCredentials = false;
  out.account = acct.ok
    ? { type: acct.body.type, status: acct.body.status, name: acct.body.friendly_name }
    : { error: acct.body.message || `HTTP ${acct.status}` };

  // 2. Which numbers does this account actually own, and can they send SMS?
  const nums = await twilio(`/2010-04-01/Accounts/${SID}/IncomingPhoneNumbers.json?PageSize=50`);
  const list = (nums.body.incoming_phone_numbers as Record<string, unknown>[] | undefined) || [];
  out.numbersOwned = list.map((n) => ({
    number: n.phone_number,
    smsCapable: (n.capabilities as Record<string, unknown> | undefined)?.sms ?? false,
    name: n.friendly_name,
  }));

  const owned = list.find((n) => n.phone_number === FROM);
  out.senderCheck = !FROM
    ? 'TWILIO_PHONE_NUMBER is not set.'
    : owned
      ? ((owned.capabilities as Record<string, unknown>)?.sms
          ? `OK: ${FROM} is owned by this account and is SMS capable.`
          : `PROBLEM: ${FROM} is owned but is NOT SMS capable. Use an SMS-capable number from numbersOwned.`)
      : `PROBLEM: ${FROM} is NOT owned by this account. Set TWILIO_PHONE_NUMBER to one of numbersOwned.`;

  // 3. What actually happened to a specific message? This is the only way to tell
  //    "Twilio accepted it" apart from "the phone rang".
  const sid = req.nextUrl.searchParams.get('sid');
  if (sid && /^SM[a-zA-Z0-9]{10,40}$/.test(sid)) {
    const msg = await twilio(`/2010-04-01/Accounts/${SID}/Messages/${sid}.json`);
    const code = msg.body.error_code != null ? String(msg.body.error_code) : null;
    out.message = msg.ok
      ? {
          status: msg.body.status,
          to: msg.body.to,
          from: msg.body.from,
          sentAt: msg.body.date_sent,
          errorCode: code,
          errorMessage: msg.body.error_message,
          hint: code ? ERROR_HINTS[code] || 'See https://www.twilio.com/docs/api/errors/' + code : null,
        }
      : { error: msg.body.message || `HTTP ${msg.status}` };
  }

  // 3b. A2P 10DLC status. US carriers reject business SMS (error 30034) until a brand AND a
  //     campaign are APPROVED, and until the sending number is attached to the Messaging
  //     Service that carries the campaign. Registration is not approval, so report both.
  try {
    const auth = Buffer.from(`${SID}:${TOKEN}`).toString('base64');
    const headers = { Authorization: `Basic ${auth}` };

    const brandRes = await fetch('https://messaging.twilio.com/v1/a2p/BrandRegistrations?PageSize=5', {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    const brandJson = (await brandRes.json().catch(() => ({}))) as Record<string, unknown>;
    const brands = (brandJson.data as Record<string, unknown>[] | undefined) || [];
    out.a2pBrands = brands.map((b) => ({ status: b.status, type: b.brand_type, failureReason: b.failure_reason }));

    const svcRes = await fetch('https://messaging.twilio.com/v1/Services?PageSize=20', {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    const svcJson = (await svcRes.json().catch(() => ({}))) as Record<string, unknown>;
    const services = (svcJson.services as Record<string, unknown>[] | undefined) || [];

    const svcReports: Record<string, unknown>[] = [];
    for (const s of services.slice(0, 5)) {
      const sid = String(s.sid);
      const [numsRes, compRes] = await Promise.all([
        fetch(`https://messaging.twilio.com/v1/Services/${sid}/PhoneNumbers?PageSize=50`, { headers, signal: AbortSignal.timeout(8000) }),
        fetch(`https://messaging.twilio.com/v1/Services/${sid}/Compliance/Usa2p`, { headers, signal: AbortSignal.timeout(8000) }),
      ]);
      const numsJson = (await numsRes.json().catch(() => ({}))) as Record<string, unknown>;
      const compJson = (await compRes.json().catch(() => ({}))) as Record<string, unknown>;
      const attached = ((numsJson.phone_numbers as Record<string, unknown>[] | undefined) || []).map((p) => p.phone_number);
      svcReports.push({
        sid,
        name: s.friendly_name,
        campaignStatus: compJson.campaign_status ?? compJson.status ?? 'none',
        senderAttached: FROM ? attached.includes(FROM) : false,
      });
    }
    out.messagingServices = svcReports;

    const approved = svcReports.find(
      (s) => String(s.campaignStatus).toUpperCase() === 'VERIFIED' || String(s.campaignStatus).toUpperCase() === 'APPROVED',
    );
    out.a2pVerdict = !brands.length
      ? 'No A2P brand registered yet. US SMS will keep failing with 30034.'
      : approved
        ? approved.senderAttached
          ? `A2P campaign is approved and ${FROM} is attached to Messaging Service ${approved.sid}. US SMS should deliver. Set TWILIO_MESSAGING_SERVICE_SID to ${approved.sid} for the most reliable routing.`
          : `A2P campaign is approved BUT ${FROM} is NOT attached to Messaging Service ${approved.sid}. Attach it, or SMS keeps failing.`
        : `A2P brand registered, campaign not approved yet (${svcReports.map((s) => s.campaignStatus).join(', ') || 'no campaign'}). Registration is not approval; US SMS keeps failing with 30034 until it clears.`;
  } catch {
    out.a2pVerdict = 'Could not read A2P status from Twilio.';
  }

  // 4. The most recent outbound messages, so a failure is visible without knowing a SID.
  const recent = await twilio(`/2010-04-01/Accounts/${SID}/Messages.json?PageSize=5`);
  const msgs = (recent.body.messages as Record<string, unknown>[] | undefined) || [];
  out.recentMessages = msgs.map((m) => {
    const code = m.error_code != null ? String(m.error_code) : null;
    return {
      sid: m.sid,
      status: m.status,
      to: m.to,
      from: m.from,
      sentAt: m.date_sent,
      errorCode: code,
      hint: code ? ERROR_HINTS[code] || null : null,
    };
  });

  return NextResponse.json(out);
}
