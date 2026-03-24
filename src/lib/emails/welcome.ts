export function welcomeEmail(displayName: string): string {
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
      <h2 style="color:#FFFFFF;font-size:24px;margin:0 0 16px;">Welcome to CRWN, ${displayName} 👑</h2>
      <p style="color:#A0A0A0;font-size:16px;line-height:1.6;margin:0 0 24px;">
        You just joined the future of music. CRWN is where artists and fans connect directly. No middlemen, no algorithms, just real support.
      </p>
      <p style="color:#A0A0A0;font-size:16px;line-height:1.6;margin:0 0 24px;">
        Here's how to get started:
      </p>
      <div style="margin:0 0 24px;">
        <div style="padding:12px 0;border-bottom:1px solid #333;">
          <span style="color:#D4AF37;font-weight:600;">🎵 Explore</span>
          <span style="color:#A0A0A0;"> Discover artists and stream exclusive music</span>
        </div>
        <div style="padding:12px 0;border-bottom:1px solid #333;">
          <span style="color:#D4AF37;font-weight:600;">👑 Subscribe</span>
          <span style="color:#A0A0A0;"> Support your favorite artists directly</span>
        </div>
        <div style="padding:12px 0;">
          <span style="color:#D4AF37;font-weight:600;">💬 Connect</span>
          <span style="color:#A0A0A0;"> Join artist communities and get exclusive access</span>
        </div>
      </div>
      <div style="text-align:center;margin:32px 0 0;">
        <a href="https://thecrwn.app/explore" style="display:inline-block;background:linear-gradient(135deg,#9a7b2a,#D4AF37);color:#1A1A1A;font-weight:700;font-size:16px;padding:14px 32px;border-radius:12px;text-decoration:none;">
          Start Exploring
        </a>
      </div>
    </div>
    <div style="text-align:center;margin-top:32px;">
      <p style="color:#666;font-size:12px;margin:0;">
        © ${new Date().getFullYear()} JNW Creative Enterprises, Inc. All rights reserved.
      </p>
      <p style="color:#666;font-size:12px;margin:8px 0 0;">
        <a href="https://thecrwn.app/terms" style="color:#666;text-decoration:underline;">Terms</a> · 
        <a href="https://thecrwn.app/privacy" style="color:#666;text-decoration:underline;">Privacy</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}
