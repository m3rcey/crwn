const BASE_URL = 'https://thecrwn.app';

interface DigestArtist {
  artistName: string;
  slug: string;
  newTracks: { title: string }[];
  newPosts: number;
  newProducts: number;
}

interface FanWeeklyDigestParams {
  fanName: string;
  artists: DigestArtist[];
  unsubscribeUrl: string;
}

export function fanWeeklyDigestEmail({ fanName, artists, unsubscribeUrl }: FanWeeklyDigestParams): string {
  const firstName = fanName.split(' ')[0];

  const artistSections = artists.map(a => {
    const items: string[] = [];
    if (a.newTracks.length > 0) {
      const trackList = a.newTracks.slice(0, 3).map(t => t.title).join(', ');
      items.push(`<li style="color:#ccc;font-size:14px;margin-bottom:4px;">New tracks: ${trackList}${a.newTracks.length > 3 ? ` +${a.newTracks.length - 3} more` : ''}</li>`);
    }
    if (a.newPosts > 0) {
      items.push(`<li style="color:#ccc;font-size:14px;margin-bottom:4px;">${a.newPosts} new community post${a.newPosts > 1 ? 's' : ''}</li>`);
    }
    if (a.newProducts > 0) {
      items.push(`<li style="color:#ccc;font-size:14px;margin-bottom:4px;">${a.newProducts} new item${a.newProducts > 1 ? 's' : ''} in shop</li>`);
    }

    return `
      <div style="background:#1A1A1A;border-radius:12px;padding:16px;margin-bottom:12px;">
        <a href="${BASE_URL}/${a.slug}" style="color:#D4AF37;font-size:16px;font-weight:600;text-decoration:none;">${a.artistName}</a>
        <ul style="margin:8px 0 0;padding-left:20px;list-style:disc;">
          ${items.join('')}
        </ul>
        <a href="${BASE_URL}/${a.slug}" style="display:inline-block;margin-top:10px;color:#D4AF37;font-size:13px;text-decoration:none;">View page &rarr;</a>
      </div>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0D0D0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="text-align:center;margin-bottom:24px;">
      <span style="font-size:24px;font-weight:700;color:#D4AF37;">CRWN</span>
    </div>

    <p style="color:#fff;font-size:18px;font-weight:600;margin:0 0 4px;">Your weekly roundup</p>
    <p style="color:#999;font-size:14px;margin:0 0 20px;">Hey ${firstName}, here's what you missed this week from your artists.</p>

    ${artistSections}

    <div style="text-align:center;margin-top:24px;">
      <a href="${BASE_URL}/home" style="display:inline-block;background:#D4AF37;color:#000;font-size:14px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:999px;">Explore on CRWN</a>
    </div>

    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #222;text-align:center;">
      <p style="color:#555;font-size:11px;margin:0;">
        You're getting this because you're subscribed to artists on CRWN.<br>
        <a href="${unsubscribeUrl}" style="color:#666;text-decoration:underline;">Unsubscribe from digests</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}
