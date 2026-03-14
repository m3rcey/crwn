export function artistTierEmail(displayName: string, tierName: string): string {
  const isPro = tierName.toLowerCase().includes('pro');

  const features = isPro ? [
    { icon: '🎵', label: 'Unlimited Uploads', desc: 'No more track limits' },
    { icon: '👥', label: 'Unlimited Community', desc: 'Grow without caps' },
    { icon: '📊', label: 'Advanced Analytics', desc: 'LTV, churn, ARPU, geo data, and more' },
    { icon: '🎫', label: 'Bundles & Experiences', desc: 'Sell premium packages to your fans' },
    { icon: '📅', label: '1-on-1 Scheduling', desc: 'Book paid sessions with fans' },
    { icon: '🎥', label: 'Group Live Q&A', desc: 'Host live sessions with your community' },
  ] : [
    { icon: '👑', label: 'Everything in Pro', desc: 'All Pro features included' },
    { icon: '💰', label: '6% Platform Fee', desc: 'Down from 8%, more money in your pocket' },
    { icon: '🎤', label: 'Up to 10 Artist Profiles', desc: 'Manage your entire roster' },
    { icon: '📊', label: 'Up to 10 Fan Tiers', desc: 'More ways to monetize your audience' },
    { icon: '🔌', label: 'API Access', desc: 'Integrate with your existing tools' },
  ];

  const featureRows = features.map(f =>
    `<div style="padding:12px 0;border-bottom:1px solid #333;">
      <span style="color:#D4AF37;font-weight:600;">${f.icon} ${f.label}</span>
      <span style="color:#A0A0A0;"> - ${f.desc}</span>
    </div>`
  ).join('');

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
      <h2 style="color:#FFFFFF;font-size:24px;margin:0 0 16px;">Welcome to ${tierName}, ${displayName} 👑</h2>
      <p style="color:#A0A0A0;font-size:16px;line-height:1.6;margin:0 0 24px;">
        You just unlocked the full power of CRWN. Here's what's now available to you:
      </p>
      <div style="margin:0 0 24px;">
        ${featureRows}
      </div>
      <div style="text-align:center;margin:32px 0 0;">
        <a href="https://thecrwn.app/profile/artist" style="display:inline-block;background:linear-gradient(135deg,#9a7b2a,#D4AF37);color:#1A1A1A;font-weight:700;font-size:16px;padding:14px 32px;border-radius:12px;text-decoration:none;">
          Go to Your Dashboard
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
