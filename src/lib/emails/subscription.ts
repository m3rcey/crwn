export function subscriptionEmail(displayName: string, artistName: string, tierName: string): string {
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
      <h2 style="color:#FFFFFF;font-size:24px;margin:0 0 16px;">You're in, ${displayName} 🎉</h2>
      <p style="color:#A0A0A0;font-size:16px;line-height:1.6;margin:0 0 24px;">
        You just subscribed to <strong style="color:#D4AF37;">${artistName}</strong> at the <strong style="color:#FFFFFF;">${tierName}</strong> tier. Here's what you've unlocked:
      </p>
      <div style="margin:0 0 24px;">
        <div style="padding:12px 0;border-bottom:1px solid #333;">
          <span style="color:#D4AF37;font-weight:600;">🔓 Exclusive Music</span>
          <span style="color:#A0A0A0;"> — Stream subscriber-only tracks and albums</span>
        </div>
        <div style="padding:12px 0;border-bottom:1px solid #333;">
          <span style="color:#D4AF37;font-weight:600;">💬 Community</span>
          <span style="color:#A0A0A0;"> — Access tier-gated posts and discussions</span>
        </div>
        <div style="padding:12px 0;">
          <span style="color:#D4AF37;font-weight:600;">🛍️ Shop</span>
          <span style="color:#A0A0A0;"> — Exclusive products and experiences</span>
        </div>
      </div>
      <div style="text-align:center;margin:32px 0 0;">
        <a href="https://thecrwn.app/home" style="display:inline-block;background:linear-gradient(135deg,#9a7b2a,#D4AF37);color:#1A1A1A;font-weight:700;font-size:16px;padding:14px 32px;border-radius:12px;text-decoration:none;">
          Go to Your Feed
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
