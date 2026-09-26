import { resend, FROM_EMAIL } from '@/lib/resend';
import { newArtistSignupEmail } from '@/lib/emails/newArtistSignup';
import { artistWelcomeEmail } from '@/lib/emails/artistWelcome';

export const ADMIN_NOTIFY_EMAIL = 'joshn.wms@gmail.com';

/**
 * The founder's "new artist on CRWN" alert, plus Josh's personal welcome (Cal.com link)
 * to the artist. Called IN-PROCESS by the server code that just created the
 * artist_profiles row (2026-09-26).
 *
 * It used to run from a pg_net AFTER INSERT trigger POSTing to
 * /api/notifications/new-artist-hook with a shared secret hand-pasted into the SQL. That
 * chain broke silently more than once: the secret in the trigger and the one in Vercel
 * only had to drift apart for every call to 401 with nothing logged anywhere the founder
 * would see. It also fired BEFORE the chosen name was saved, so the alert named the email
 * seed. Here there is no secret, no network hop and no trigger.
 *
 * Resend reports failure by RETURNING { error }, it does not throw, so both sends check
 * it. Never let this fail the signup: it logs and returns what happened.
 */
export async function sendNewArtistAlerts(params: {
  slug: string;
  displayName: string;
  recruitedBy?: string | null;
  artistEmail?: string | null;
}): Promise<{ founder: boolean; welcome: boolean }> {
  const { slug, displayName, recruitedBy, artistEmail } = params;
  // The onboarding-health canary creates and deletes an artist daily.
  if (slug.startsWith('__')) return { founder: false, welcome: false };

  let founder = false;
  let welcome = false;

  try {
    const alert = newArtistSignupEmail({ name: displayName, slug, recruiterCode: recruitedBy || null });
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_NOTIFY_EMAIL,
      subject: alert.subject,
      html: alert.html,
    });
    if (error) console.error('new-artist alert: founder email refused by Resend:', error);
    else founder = true;
  } catch (e) {
    console.error('new-artist alert: founder email failed:', e);
  }

  if (artistEmail) {
    try {
      const w = artistWelcomeEmail({ name: displayName });
      const { error } = await resend.emails.send({
        from: 'Josh at CRWN <hello@thecrwn.app>',
        replyTo: ADMIN_NOTIFY_EMAIL,
        to: artistEmail,
        subject: w.subject,
        html: w.html,
      });
      if (error) console.error('new-artist alert: artist welcome refused by Resend:', error);
      else welcome = true;
    } catch (e) {
      console.error('new-artist alert: artist welcome failed:', e);
    }
  }

  return { founder, welcome };
}
