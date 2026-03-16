export function artistNewPostEmail(artistName: string, fanName: string, postPreview: string): string {
  const truncatedPreview = postPreview.length > 150 ? postPreview.substring(0, 150) + '...' : postPreview;
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
    <div style="background-color:#242424;border-radius:16px;padding:32px;border:1px solid #333;">
      <h2 style="color:#FFFFFF;font-size:24px;margin:0 0 16px;">New Community Post &#128172;</h2>
      <p style="color:#A0A0A0;font-size:16px;line-height:1.6;margin:0 0 24px;">
        Hey ${artistName}, <strong style="color:#FFFFFF;">${fanName}</strong> just posted in your community.
      </p>
      <div style="background-color:#1A1A1A;border-radius:12px;padding:20px;margin:0 0 24px;">
        <p style="color:#A0A0A0;font-size:13px;margin:0 0 8px;font-weight:600;">POST PREVIEW</p>
        <p style="color:#FFFFFF;font-size:14px;line-height:1.6;margin:0;font-style:italic;">
          "${truncatedPreview}"
        </p>
      </div>
      <div style="text-align:center;margin:32px 0 0;">
        <a href="https://thecrwn.app/profile/artist?tab=community" style="display:inline-block;background:linear-gradient(135deg,#9a7b2a,#D4AF37);color:#1A1A1A;font-weight:700;font-size:16px;padding:14px 32px;border-radius:12px;text-decoration:none;">
          View Community
        </a>
      </div>
    </div>
    <div style="text-align:center;margin-top:32px;">
      <p style="color:#666;font-size:12px;margin:0;">
        &copy; ${new Date().getFullYear()} JNW Creative Enterprises, Inc. All rights reserved.
      </p>
      <p style="color:#666;font-size:12px;margin:8px 0 0;">
        <a href="https://thecrwn.app/terms" style="color:#666;text-decoration:underline;">Terms</a> &middot;
        <a href="https://thecrwn.app/privacy" style="color:#666;text-decoration:underline;">Privacy</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}
