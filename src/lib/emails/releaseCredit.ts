// Transactional email to a fan when an artist credits them on a release
// (track or album). Role / release title are optional; the copy stays generic
// when they're not provided.

const IMPACT_URL = 'https://thecrwn.app/impact';

export function releaseCreditEmail(params: {
  fanName?: string | null;
  artistName?: string | null;
  releaseTitle?: string | null;
  role?: string | null;
}) {
  const first = (params.fanName || '').trim().split(' ')[0] || 'there';
  const artist = (params.artistName || '').trim();
  const release = (params.releaseTitle || '').trim();
  const role = (params.role || '').trim();

  const who = artist ? `${artist}` : 'An artist';
  const roleFragment = role ? ` as ${role}` : '';
  const releaseFragment = release ? ` on "${release}"` : ' on a new release';

  return {
    subject: `You're credited on ${artist ? artist + "'s" : 'a'} release 🎶`,
    html: `
      <div style="background-color: #1A1A1A; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="max-width: 460px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #D4AF37; font-size: 28px; font-weight: bold; margin: 0;">CRWN</h1>
          </div>
          <div style="background-color: #242424; border-radius: 12px; padding: 32px; border: 1px solid #333;">
            <p style="color: #FFFFFF; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">Hey ${first} 🎶</p>
            <p style="color: #CCCCCC; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
              ${who} credited you${roleFragment}${releaseFragment}.
            </p>
            <p style="color: #CCCCCC; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
              Your support is on the record. See the releases you're part of below.
            </p>
            <div style="text-align: center; margin: 28px 0 8px 0;">
              <a href="${IMPACT_URL}" style="display: inline-block; background-color: #D4AF37; color: #000000; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 999px;">See your impact</a>
            </div>
            <p style="color: #CCCCCC; font-size: 15px; line-height: 1.6; margin: 24px 0 0 0;">
              Thanks for backing the music.<br />
              CRWN
            </p>
          </div>
        </div>
      </div>
    `,
  };
}
