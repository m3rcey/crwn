// The Fan Automation drop claim: email in, magnet + free membership out.
//
// DELIBERATELY PUBLIC (declared in src/lib/architecture/security.test.ts): the caller is a
// fan arriving from an Instagram or Facebook DM, usually with no CRWN account. It follows
// the Song Lab live-claim boundary EXACTLY (src/lib/songLab/liveClaim.ts):
//
//   * A typed email is a CAPTURED CONTACT. It may own a free membership and receive the
//     promised drop. It NEVER receives a session, a token, or a cookie.
//   * An email that belongs to a CONFIRMED account is a real person: nothing is written for
//     it, the response shape does not reveal the account exists, and the drop is still
//     delivered (the drop is the public promise; the membership is what needs identity).
//   * A signed-in caller uses their session identity, never a typed email.
//   * Paid members are NEVER downgraded: joinFreeTier reports already_member and writes
//     nothing when any active subscription exists.
//
// The lead row (fan_automation_leads) is funnel STATE, like popup_events: it is what makes a
// duplicate submission a re-delivery instead of a second lead, and what conversion reporting
// derives from. It is not a metric write path, so it takes no DNT gate.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { normalizeEmail, cleanFirstName, identityDecision } from '@/lib/songLab/liveClaim';
import { isPlausibleEmail } from '@/lib/songLab/voteForm';
import { joinFreeTier } from '@/lib/subscriptions/freeJoin';
import { notifyNewSubscriber } from '@/lib/notifications';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { dropDeliveryEmail, dropDeliverySubject } from '@/lib/emails/dropDelivery';
import { getSignedDownloadUrl } from '@/lib/r2/client';
import { signAudioValue } from '@/lib/storage/signedAudio';
import { isPresentableArtistName } from '@/lib/publicName';
import { siteBase } from '@/lib/fanAutomations/config';
import {
  parseCampaignAttribution,
  sanitizeStoredAttribution,
  mergeAttribution,
  hasAttribution,
} from '@/lib/analytics/campaignAttribution';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const IP_WINDOW_SECONDS = 600;
const IP_MAX = 60;
const EMAIL_WINDOW_SECONDS = 3600;
const EMAIL_MAX = 6;

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for') || '';
  return fwd.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
}

type MembershipResult = 'created' | 'already_member' | 'sign_in_required' | null;

export async function POST(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    if (!token || token.length > 64) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const firstName = cleanFirstName(body.firstName);
    const typedEmail = normalizeEmail(body.email);
    // The page's own query string, sent by the client verbatim and normalized HERE.
    // Attribution is descriptive only: nothing below reads it into a price, a tier, an
    // ownership check, or a redirect. The normalizer is the length and HTML boundary.
    const rawQuery = typeof body.query === 'string' ? body.query.slice(0, 2048) : '';
    const incomingAttribution = parseCampaignAttribution(new URLSearchParams(rawQuery));

    const ipOk = await checkRateLimit(`drop-ip:${clientIp(req)}`, 'drop-claim-ip', IP_WINDOW_SECONDS, IP_MAX);
    if (!ipOk) return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 });

    // The automation, by its unguessable token. Paused still delivers (a paused automation
    // stops NEW DMs; a fan already holding the link keeps their promise). Draft/archived 404.
    const { data: automation } = await supabaseAdmin
      .from('fan_automations')
      .select('id, artist_id, status, provider, public_token, magnet_kind, magnet_title, magnet_file_key, magnet_file_name, magnet_track_id')
      .eq('public_token', token)
      .in('status', ['active', 'paused'])
      .maybeSingle();
    if (!automation) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: artist } = await supabaseAdmin
      .from('artist_profiles')
      .select('id, slug, user_id')
      .eq('id', automation.artist_id)
      .maybeSingle();
    if (!artist) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // ── Identity: a live session outranks a typed email. ──
    const session = await createServerSupabaseClient();
    const { data: { user: sessionUser } } = await session.auth.getUser();

    let fanUserId: string | null = null;
    let email = typedEmail;
    let membership: MembershipResult = null;
    let createdNow = false;

    if (sessionUser) {
      fanUserId = sessionUser.id;
      email = normalizeEmail(sessionUser.email) || typedEmail;
    } else {
      if (!isPlausibleEmail(email)) {
        return NextResponse.json({ error: 'Enter a valid email.', field: 'email' }, { status: 400 });
      }
      const emailOk = await checkRateLimit(`drop-email:${email}`, 'drop-claim-email', EMAIL_WINDOW_SECONDS, EMAIL_MAX);
      if (!emailOk) return NextResponse.json({ error: 'That email was just used. Check your inbox.' }, { status: 429 });

      const lookup = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
        { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || '', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}` } },
      ).then((r) => (r.ok ? r.json() : null)).catch(() => null);

      // A failed lookup must not fall through to creating an account (that is how a
      // confirmed owner would be acted-as). Fail closed to the no-membership path.
      if (!lookup || !Array.isArray(lookup.users)) {
        membership = 'sign_in_required';
      } else {
        const decision = identityDecision(email, lookup.users);
        if (decision.kind === 'needs_sign_in') {
          membership = 'sign_in_required';
        } else if (decision.kind === 'reuse') {
          fanUserId = decision.userId;
        } else {
          const { data: made, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            // NO email_confirm: the address stays unverified, which is the truth.
            user_metadata: firstName ? { display_name: firstName } : undefined,
          });
          if (createError || !made?.user) {
            membership = 'sign_in_required';
          } else {
            fanUserId = made.user.id;
            createdNow = true;
          }
        }
      }
    }

    // The artist previewing their own funnel must not become their own member.
    const isOwner = !!fanUserId && fanUserId === artist.user_id;

    // The funnel's own nurture pointer, read fail-soft: before the foundation migration
    // this column does not exist and the read errors, which simply means default nurture.
    let nurtureSequenceId: string | null = null;
    try {
      const { data: nurtureRow } = await supabaseAdmin
        .from('fan_automations')
        .select('nurture_sequence_id')
        .eq('id', automation.id)
        .maybeSingle();
      nurtureSequenceId = nurtureRow?.nurture_sequence_id ?? null;
    } catch { /* pre-migration */ }

    // ── Free membership through the ONE canonical writer. ──
    if (fanUserId && !isOwner) {
      const { data: freeTier } = await supabaseAdmin
        .from('subscription_tiers')
        .select('id, name')
        .eq('artist_id', artist.id)
        .eq('is_active', true)
        .eq('price', 0)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (freeTier) {
        const join = await joinFreeTier(supabaseAdmin, fanUserId, freeTier.id, { sequenceId: nurtureSequenceId });
        if (join.status === 'joined') {
          membership = 'created';
          try {
            await notifyNewSubscriber(supabaseAdmin, artist.user_id, firstName || 'A fan', freeTier.name || 'Free');
          } catch { /* non-fatal */ }
        } else if (join.status === 'already_member') {
          // Includes every paid member: joinFreeTier wrote nothing and never downgrades.
          membership = 'already_member';
        }
      }
    }

    // A captured supporter must not be routed into the artist setup wizard on sign-in.
    if (createdNow && fanUserId) {
      await supabaseAdmin
        .from('profiles')
        .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
        .eq('id', fanUserId)
        .eq('role', 'fan')
        .then(() => {}, () => {});
    }

    // ── Fan CRM row (source 'keyword' is the existing enum value for comment-sourced). ──
    if (email && !isOwner) {
      await supabaseAdmin
        .from('fan_contacts')
        .upsert(
          {
            artist_id: artist.id,
            email,
            ...(firstName ? { name: firstName } : {}),
            source: 'keyword',
            tags: ['fan-automation'],
            is_subscribed_email: true,
          },
          { onConflict: 'artist_id,email', ignoreDuplicates: true },
        )
        .then(() => {}, () => {});
    }

    // ── Lead row: the attribution spine. Duplicate submission = re-delivery, not a lead. ──
    if (email && !isOwner) {
      const leadRow: Record<string, unknown> = {
        automation_id: automation.id,
        artist_id: artist.id,
        email,
        first_name: firstName || null,
        fan_user_id: membership === 'sign_in_required' ? null : fanUserId,
        membership_result: membership,
        provider: automation.provider,
        magnet_delivered_at: new Date().toISOString(),
      };

      // FIRST-TOUCH attribution, same policy as the calculator funnel: merge never
      // replaces a field that is already set, so a later untagged visit cannot erase the
      // link that actually brought this fan. Every read and write is fail-soft so the
      // lead row itself survives the pre-migration schema.
      if (hasAttribution(incomingAttribution)) {
        try {
          const { data: existingLead } = await supabaseAdmin
            .from('fan_automation_leads')
            .select('attribution')
            .eq('automation_id', automation.id)
            .eq('email', email)
            .maybeSingle();
          leadRow.attribution = mergeAttribution(
            sanitizeStoredAttribution(existingLead?.attribution),
            incomingAttribution,
          );
        } catch { /* pre-migration: store without attribution */ }
      }

      const upsertLead = (row: Record<string, unknown>) =>
        supabaseAdmin
          .from('fan_automation_leads')
          .upsert(row, { onConflict: 'automation_id,email', ignoreDuplicates: false });

      const { error: leadError } = await upsertLead(leadRow).then(
        (r: { error: unknown }) => r, (e: unknown) => ({ error: e }));
      if (leadError && leadRow.attribution) {
        // 42703 pre-migration: the unknown column fails the WHOLE statement. The lead
        // matters more than the tag: retry without it.
        delete leadRow.attribution;
        await upsertLead(leadRow).then(() => {}, () => {});
      }
    }

    // ── Deliver the magnet. Signed and short-lived for uploads, never a public URL. ──
    const site = siteBase();
    let magnetUrl: string | null = null;
    let trackUrl: string | null = null;
    if (automation.magnet_kind === 'upload' && automation.magnet_file_key) {
      try {
        magnetUrl = await getSignedDownloadUrl(automation.magnet_file_key, 3600, automation.magnet_file_name || undefined);
      } catch (e) {
        console.error('[drop] magnet signing failed:', e);
      }
    } else if (automation.magnet_kind === 'track' && automation.magnet_track_id) {
      // A track magnet is delivered exactly like an upload one: a SHORT-LIVED SIGNED URL,
      // minted only after the claim above succeeded.
      //
      // Why not just link the embed page. Because the exchange this funnel exists to make
      // is "identify yourself, join the free tier, then the music opens". Making the track
      // is_free so the embed would serve it hands the same permanent, anonymous access to
      // anybody who never claimed anything, which is the giveaway without the exchange.
      // The track therefore stays GATED to the artist's rungs (every member can play it
      // forever on the artist page, through the one oracle), and the person who just
      // completed the claim gets bytes now through a URL that expires.
      //
      // The audio value is read with the service role here because audio_url_* is revoked
      // from every browser role; it never reaches the client, only the signed URL does.
      try {
        const { data: magnetTrack } = await supabaseAdmin
          .from('tracks')
          .select('id, audio_url_128, is_active, artist_id')
          .eq('id', automation.magnet_track_id)
          .eq('artist_id', artist.id)
          .maybeSingle();
        if (magnetTrack?.is_active !== false && magnetTrack?.audio_url_128) {
          trackUrl = await signAudioValue(magnetTrack.audio_url_128, 3600);
        }
      } catch (e) {
        console.error('[drop] track magnet signing failed:', e);
      }
      // Fail soft to the embed page: a member who is signed in can still play it there,
      // and a broken signature must not swallow the promise entirely.
      if (!trackUrl) trackUrl = `${site}/embed/${automation.magnet_track_id}`;
    }

    // ── The delivery email. NOT a gate: the page already delivered above. ──
    let emailSent = false;
    if (email && resend && !isOwner) {
      try {
        const { data: suppressed } = await supabaseAdmin
          .from('email_suppressions')
          .select('email')
          .eq('email', email)
          .maybeSingle();
        if (!suppressed) {
          const { data: artistProfile } = await supabaseAdmin
            .from('profiles').select('display_name').eq('id', artist.user_id).maybeSingle();
          const rawName = artistProfile?.display_name ?? null;
          const artistName = isPresentableArtistName(rawName) ? (rawName as string) : 'This artist';

          let signInUrl: string | null = null;
          if (!sessionUser && membership !== 'sign_in_required') {
            try {
              const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
                type: 'magiclink',
                email,
                options: { redirectTo: `${site}/drop/${automation.public_token}?offer=gold` },
              });
              signInUrl = linkData?.properties?.action_link ?? null;
            } catch { /* delivery stands without a link */ }
          }

          await resend.emails.send({
            from: FROM_EMAIL,
            to: email,
            subject: dropDeliverySubject(artistName, automation.magnet_title || ''),
            html: dropDeliveryEmail({
              firstName,
              artistName,
              magnetTitle: automation.magnet_title || '',
              magnetUrl,
              trackUrl,
              signInUrl,
              artistUrl: `${site}/${artist.slug}`,
              joinedFree: membership === 'created',
            }),
          });
          emailSent = true;
        }
      } catch (e) {
        console.error('[drop] delivery email failed (non-fatal):', e);
      }
    }

    // No session, no token, no cookie: capture is not ownership. The response shape is
    // identical whether or not the email belongs to an existing account.
    return NextResponse.json({
      ok: true,
      membership,
      isOwner,
      emailSent,
      hasSession: !!sessionUser,
      magnet: {
        kind: automation.magnet_kind,
        title: automation.magnet_title || '',
        url: magnetUrl,
        trackUrl,
      },
    });
  } catch (err) {
    console.error('[drop] claim error:', err);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
