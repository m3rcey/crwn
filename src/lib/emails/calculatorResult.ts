// Lead-magnet follow-up email: delivers on the "we'll email your breakdown" promise
// on /worth. Sent from the PUBLIC lead-capture route to an anonymous visitor, so it
// takes plain pre-formatted strings (no auth context). Matches the app email style.
export function calculatorResultEmail(params: {
  annualDisplay: string;   // e.g. "$37,000"
  monthlyDisplay: string;  // e.g. "$3,105"
  listeners: number;
}): string {
  const { annualDisplay, monthlyDisplay, listeners } = params;
  const listenersLine = listeners > 0
    ? `Based on your ${listeners.toLocaleString('en-US')} monthly listeners, here's what going direct on CRWN could unlock:`
    : `Here's what going direct on CRWN could unlock:`;

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
      <h2 style="color:#FFFFFF;font-size:24px;margin:0 0 16px;">Your numbers 👑</h2>
      <p style="color:#A0A0A0;font-size:16px;line-height:1.6;margin:0 0 24px;">
        ${listenersLine}
      </p>

      <div style="text-align:center;background-color:#1A1A1A;border:1px solid #D4AF37;border-radius:12px;padding:24px;margin:0 0 24px;">
        <div style="color:#A0A0A0;font-size:13px;text-transform:uppercase;letter-spacing:1px;">You're leaving roughly</div>
        <div style="color:#D4AF37;font-size:42px;font-weight:700;line-height:1.2;">${annualDisplay}</div>
        <div style="color:#A0A0A0;font-size:14px;">on the table every year &middot; ${monthlyDisplay}/mo net</div>
      </div>

      <h3 style="color:#FFFFFF;font-size:18px;margin:0 0 12px;">The setup that captures it</h3>
      <div style="margin:0 0 24px;">
        <div style="padding:12px 0;border-bottom:1px solid #333;">
          <span style="color:#D4AF37;font-weight:600;">Inner Circle: $10/mo</span>
          <span style="color:#A0A0A0;"> Exclusive tracks, 7-day early access, DMs, shop discount</span>
        </div>
        <div style="padding:12px 0;border-bottom:1px solid #333;">
          <span style="color:#D4AF37;font-weight:600;">The Vault: $25/mo</span>
          <span style="color:#A0A0A0;"> Stems &amp; multitracks, 14-day early access, monthly live Q&amp;A</span>
        </div>
        <div style="padding:12px 0;border-bottom:1px solid #333;">
          <span style="color:#D4AF37;font-weight:600;">Throne: $100/mo</span>
          <span style="color:#A0A0A0;"> Day-0 first listen, monthly 1-on-1 call, a custom song each quarter</span>
        </div>
        <div style="padding:12px 0;">
          <span style="color:#D4AF37;font-weight:600;">Sold à la carte</span>
          <span style="color:#A0A0A0;"> Stem packs, paid live sessions, custom songs, shoutouts</span>
        </div>
      </div>

      <p style="color:#A0A0A0;font-size:15px;line-height:1.6;margin:0 0 8px;">
        <strong style="color:#FFFFFF;">Release like the majors don't:</strong> new music hits Throne first,
        then steps down to each tier, then the free tier, and the DSPs get it last. Every tier is a skip-the-line pass.
      </p>

      <div style="text-align:center;margin:32px 0 0;">
        <a href="https://thecrwn.app/signup?ref=calculator-email" style="display:inline-block;background:linear-gradient(135deg,#9a7b2a,#D4AF37);color:#1A1A1A;font-weight:700;font-size:16px;padding:14px 32px;border-radius:12px;text-decoration:none;">
          Start free, keep this money
        </a>
      </div>
      <p style="color:#666;font-size:13px;text-align:center;margin:16px 0 0;">
        Free to start. No card required.
      </p>
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
