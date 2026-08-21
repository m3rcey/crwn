// Inbound SMS: a person texts a keyword, CRWN replies once with the link they asked for.
//
// WHAT THIS IS NOT. CRWN removed SMS in July 2026 for A2P compliance cost and still has
// no outbound SMS, no campaigns, no drip, no consent rows. This route does not bring any
// of that back. It answers a message a human just sent, with a link, and stops. Nobody is
// enrolled in anything: the free membership still only happens if they go to the page and
// complete the vote.
//
// DARK BY DEFAULT. Without TWILIO_AUTH_TOKEN, SMS_KEYWORD_ENABLED and
// TWILIO_JUBO_PHONE_NUMBER this route refuses every request. Signature verification fails
// closed on top of that, so an unconfigured deployment cannot be made to send a message.
//
// ITS OWN NUMBER. The keyword lives on TWILIO_JUBO_PHONE_NUMBER. TWILIO_PHONE_NUMBER
// belongs to a different purpose and is NEVER read here, not even as a fallback: a reply
// going out from the wrong line is worse than no reply. A signed request for any other
// number is ignored in silence.
//
// STOP / HELP ARE NOT OURS. Carrier and Twilio Advanced Opt-Out own those words. This
// route recognises them only in order to STAY SILENT, because answering with our own text
// would either duplicate Twilio's mandated reply or, worse, appear to swallow an opt-out.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTwilioSignature } from '@/lib/webhookSignatures';
import {
  classifyInbound,
  twimlMessage,
  votingLinkReply,
  noActiveVoteReply,
  isConfiguredPhone,
  sameNumber,
} from '@/lib/sms/keywords';
import { checkRateLimit } from '@/lib/rateLimit';
import { resolveShowPhase, type ShowPoll } from '@/lib/songLab/schedule';
import { SHOW_POLL_COLUMNS } from '@/lib/songLab/server';
import { offerIsLive, type SongLabOfferCore } from '@/lib/songLab/core';
import { isPresentableArtistName } from '@/lib/publicName';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const XML = { 'Content-Type': 'text/xml; charset=utf-8' } as const;

/** Silence, as valid TwiML. Used for every case where CRWN should not answer. */
function silent() {
  return new NextResponse(twimlMessage(null), { status: 200, headers: XML });
}

/**
 * Keyword to artist. One env var, `SMS_KEYWORDS`, formatted `keyword:artist-slug` and
 * comma separated, e.g. `jubo:julius-williams`. Configuration, not code: adding a second
 * artist's keyword is an env change and a deploy, never an edit to this file, and no
 * artist slug is ever hardcoded.
 */
function keywordMap(): Record<string, string> {
  const raw = process.env.SMS_KEYWORDS || '';
  const map: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const [keyword, slug] = pair.split(':').map((s) => (s || '').trim().toLowerCase());
    if (keyword && slug) map[keyword] = slug;
  }
  return map;
}

export async function POST(req: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const enabled = process.env.SMS_KEYWORD_ENABLED === 'true';
  if (!enabled || !authToken) return silent();

  // Twilio signs the exact form body, so it must be read as text and parsed by hand.
  const rawBody = await req.text();
  const form = new URLSearchParams(rawBody);
  const params: Record<string, string> = {};
  form.forEach((value, key) => { params[key] = value; });

  // The URL Twilio signed is the PUBLIC one. Behind Vercel the internal request URL can
  // be http and carry an internal host, which would never match.
  const publicBase = process.env.NEXT_PUBLIC_SITE_URL || 'https://thecrwn.app';
  const signedUrl = `${publicBase.replace(/\/$/, '')}/api/sms/inbound`;

  if (!verifyTwilioSignature(signedUrl, params, req.headers.get('x-twilio-signature'), authToken)) {
    // Not Twilio, or the public URL is misconfigured. Never answer, never log the body.
    console.error('[sms] inbound rejected: signature did not verify');
    return new NextResponse('Forbidden', { status: 403 });
  }

  // WHICH CRWN NUMBER WAS TEXTED. JUBO runs on its OWN number
  // (TWILIO_JUBO_PHONE_NUMBER), separate from TWILIO_PHONE_NUMBER, which belongs to a
  // different purpose and is deliberately never read here. Twilio sends the receiving
  // number as `To`, and a TwiML reply goes back out from whichever number received the
  // message, so this check is what keeps the keyword on its own line instead of answering
  // on any number that happens to point at this webhook.
  //
  // Missing or malformed configuration FAILS SAFE and silent. It must never fall back to
  // the other number: the two have separate purposes, and borrowing one would put CRWN
  // replies on a line that is not meant to send them.
  const juboNumber = process.env.TWILIO_JUBO_PHONE_NUMBER;
  if (!isConfiguredPhone(juboNumber)) {
    console.error('[sms] inbound ignored: TWILIO_JUBO_PHONE_NUMBER is not configured');
    return silent();
  }
  if (!sameNumber(params.To, juboNumber)) {
    // A signed Twilio request for one of CRWN's OTHER numbers. Legitimate traffic, just
    // not ours to answer. Never log either number.
    console.warn('[sms] inbound ignored: message was not sent to the JUBO number');
    return silent();
  }

  const from = (params.From || '').trim();
  const messageSid = (params.MessageSid || params.SmsMessageSid || '').trim();

  // Abuse control, keyed on the sender. Twilio retries a webhook it considers failed, and
  // a retry carries the SAME MessageSid, so the sid is what makes a retry harmless: the
  // reply is derived, not queued, and re-deriving it produces the same TwiML with no
  // second side effect anywhere.
  if (from) {
    const allowed = await checkRateLimit(`sms:${from}`, 'sms-inbound', 60, 6);
    if (!allowed) {
      console.warn('[sms] rate limited a sender');
      return silent();
    }
  }

  const map = keywordMap();
  const intent = classifyInbound(params.Body, Object.keys(map));

  // Carrier-reserved (STOP, HELP, START...). Twilio's own opt-out handling answers these.
  if (intent.kind === 'reserved') return silent();
  if (intent.kind === 'ignore') return silent();

  const artistSlug = map[intent.keyword];
  if (!artistSlug) return silent();

  try {
    // The artist, through the Song Lab gate: a keyword for a non-enabled artist answers
    // nothing rather than leaking that the account exists.
    const { data: artist } = await supabaseAdmin
      .from('artist_profiles')
      .select('id, user_id, slug, song_lab_enabled')
      .eq('slug', artistSlug)
      .maybeSingle();
    if (!artist || artist.song_lab_enabled !== true) return silent();

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('id', artist.user_id)
      .maybeSingle();
    const rawName = profile?.display_name ?? null;
    const artistName = isPresentableArtistName(rawName) ? (rawName as string) : 'This artist';

    // The live vote magnet for this artist. Newest active vote offer wins, and it must be
    // inside its own window, so an old show's link is never texted out.
    const { data: offers } = await supabaseAdmin
      .from('song_lab_offers')
      .select('*')
      .eq('artist_id', artist.id)
      .eq('benefit_kind', 'vote')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    const now = new Date();
    const live = (offers || []).find((o) => offerIsLive(o as SongLabOfferCore, now));
    if (!live) {
      return new NextResponse(twimlMessage(noActiveVoteReply(artistName)), { status: 200, headers: XML });
    }

    // Only send a link that will actually show a ballot or an honest interlude. An event
    // whose polls are all closed is not worth texting to somebody standing in a venue.
    let polls: ShowPoll[] = [];
    if (live.project_id) {
      const { data } = await supabaseAdmin
        .from('song_lab_decisions')
        .select(SHOW_POLL_COLUMNS)
        .eq('artist_id', artist.id)
        .eq('project_id', live.project_id)
        .neq('status', 'draft');
      polls = (data || []) as ShowPoll[];
    } else if (live.decision_id) {
      const { data } = await supabaseAdmin
        .from('song_lab_decisions')
        .select(SHOW_POLL_COLUMNS)
        .eq('artist_id', artist.id)
        .eq('id', live.decision_id)
        .neq('status', 'draft')
        .maybeSingle();
      polls = data ? [data as ShowPoll] : [];
    }

    const phase = resolveShowPhase(polls, now);
    if (phase.kind === 'ended' || phase.kind === 'none') {
      return new NextResponse(twimlMessage(noActiveVoteReply(artistName)), { status: 200, headers: XML });
    }

    // The SAME event URL the QR code carries, tagged so Studio can tell the two doors
    // apart. The tag is a reporting dimension only.
    const url = `${publicBase.replace(/\/$/, '')}/${artist.slug}/join/${live.slug}?utm_source=jubo&utm_medium=sms`;
    return new NextResponse(twimlMessage(votingLinkReply(artistName, url)), { status: 200, headers: XML });
  } catch (err) {
    console.error('[sms] inbound handler error:', err instanceof Error ? err.message : 'unknown');
    // Silence beats a broken or guessed link in somebody's hand at a show.
    return silent();
  } finally {
    if (messageSid) console.log('[sms] handled inbound', messageSid.slice(0, 10));
  }
}

/** Twilio probes with GET when a webhook URL is saved. Answer, reveal nothing. */
export async function GET() {
  return new NextResponse(twimlMessage(null), { status: 200, headers: XML });
}
