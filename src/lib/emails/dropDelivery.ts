// Transactional delivery email for a Fan Automation drop claim.
//
// TRANSACTIONAL, not marketing: it answers something the recipient just did (submitted the
// form on the drop page) and delivers what was promised there, plus the sign-in link that
// proves inbox ownership. It carries no unsubscribe because it is not a recurring send; the
// artist's ongoing emails all ride the campaign system, which does.
// Dark theme, gold accent, no em dashes, per the house email style.

export function dropDeliverySubject(artistName: string, magnetTitle: string): string {
  return magnetTitle ? `Your ${magnetTitle} from ${artistName}` : `Your drop from ${artistName}`;
}

export function dropDeliveryEmail(params: {
  firstName: string;
  artistName: string;
  magnetTitle: string;
  /** Short-lived signed download URL, or null for a track drop. */
  magnetUrl: string | null;
  /** Public track link for a track drop, or null. */
  trackUrl: string | null;
  /** Magic link that signs the fan in and returns them to the drop page's offer. */
  signInUrl: string | null;
  artistUrl: string;
  joinedFree: boolean;
}): string {
  const { firstName, artistName, magnetTitle, magnetUrl, trackUrl, signInUrl, artistUrl, joinedFree } = params;
  const hello = firstName ? `Hey ${firstName},` : 'Hey,';
  const accessHref = magnetUrl || trackUrl || artistUrl;
  const accessLabel = magnetUrl ? `Download ${magnetTitle || 'your drop'}` : `Play ${magnetTitle || 'your drop'}`;

  return `
  <div style="background:#0D0D0D;padding:32px 16px;font-family:Inter,Arial,sans-serif;color:#EDEDED;">
    <div style="max-width:520px;margin:0 auto;background:#1A1A1A;border-radius:16px;padding:32px;">
      <p style="margin:0 0 16px;font-size:15px;">${hello}</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">
        Here is what ${artistName} promised you${magnetTitle ? `: <strong>${magnetTitle}</strong>` : ''}.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${accessHref}" style="display:inline-block;background:#D4AF37;color:#0D0D0D;font-weight:600;padding:12px 24px;border-radius:999px;text-decoration:none;font-size:15px;">${accessLabel}</a>
      </p>
      ${magnetUrl ? '<p style="margin:0 0 20px;font-size:12px;color:#9A9A9A;">The download link works for the next hour. Come back to the drop page any time for a fresh one.</p>' : ''}
      ${joinedFree ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#C9C9C9;">You are now on ${artistName}'s free members list, so you hear about new drops before anyone outside it.</p>` : ''}
      ${signInUrl ? `<p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#C9C9C9;">One tap gets you into your free CRWN account, and unlocks the membership offer waiting on the drop page:</p>
      <p style="margin:0 0 20px;"><a href="${signInUrl}" style="color:#D4AF37;font-size:14px;">Open my account and see the offer</a></p>` : ''}
      <p style="margin:0;font-size:13px;color:#9A9A9A;">
        Sent because you requested this on ${artistName}'s drop page on CRWN.
        <a href="${artistUrl}" style="color:#D4AF37;">Visit ${artistName} on CRWN</a>
      </p>
    </div>
  </div>`;
}
