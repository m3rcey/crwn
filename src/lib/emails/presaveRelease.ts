export function presaveReleaseEmail(
  fanName: string,
  artistName: string,
  releaseTitle: string,
  artworkUrl: string | null,
  linkSlug: string,
  platformLinks: { spotify?: string; appleMusic?: string; youtube?: string; soundcloud?: string; tidal?: string }
): string {
  const platformButtons = [
    platformLinks.spotify && `<a href="${platformLinks.spotify}" style="display:block;padding:12px 24px;background-color:#1DB954;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;text-align:center;margin-bottom:8px;">Listen on Spotify</a>`,
    platformLinks.appleMusic && `<a href="${platformLinks.appleMusic}" style="display:block;padding:12px 24px;background-color:#FA243C;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;text-align:center;margin-bottom:8px;">Listen on Apple Music</a>`,
    platformLinks.youtube && `<a href="${platformLinks.youtube}" style="display:block;padding:12px 24px;background-color:#FF0000;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;text-align:center;margin-bottom:8px;">Listen on YouTube Music</a>`,
    platformLinks.soundcloud && `<a href="${platformLinks.soundcloud}" style="display:block;padding:12px 24px;background-color:#FF5500;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;text-align:center;margin-bottom:8px;">Listen on SoundCloud</a>`,
    platformLinks.tidal && `<a href="${platformLinks.tidal}" style="display:block;padding:12px 24px;background-color:#000;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;text-align:center;margin-bottom:8px;">Listen on TIDAL</a>`,
  ].filter(Boolean).join('');

  const artworkBlock = artworkUrl
    ? `<img src="${artworkUrl}" alt="${releaseTitle}" style="width:200px;height:200px;border-radius:12px;object-fit:cover;margin:0 auto 24px;display:block;" />`
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#1A1A1A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="color:#D4AF37;font-size:32px;margin:0;">CRWN</h1>
    </div>
    <div style="background-color:#242424;border-radius:16px;padding:32px;border:1px solid #333;text-align:center;">
      ${artworkBlock}
      <h2 style="color:#FFFFFF;font-size:22px;margin:0 0 8px;">It's here.</h2>
      <p style="color:#A0A0A0;font-size:16px;line-height:1.6;margin:0 0 8px;">
        ${fanName ? `${fanName}, ` : ''}${artistName} just dropped <strong style="color:#fff;">${releaseTitle}</strong>.
      </p>
      <p style="color:#A0A0A0;font-size:14px;line-height:1.6;margin:0 0 24px;">
        You pre-saved this — now go listen.
      </p>
      ${platformButtons || `<a href="https://thecrwn.app/link/${linkSlug}" style="display:block;padding:14px 24px;background:linear-gradient(to right,#9a7b2a,#D4AF37);color:#0D0D0D;text-decoration:none;border-radius:12px;font-weight:700;font-size:14px;text-align:center;">Listen Now</a>`}
    </div>
    <div style="text-align:center;margin-top:24px;">
      <p style="color:#555;font-size:12px;">
        You're getting this because you pre-saved on <a href="https://thecrwn.app" style="color:#D4AF37;text-decoration:none;">CRWN</a>.
      </p>
    </div>
  </div>
</body>
</html>`;
}
