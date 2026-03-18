export function weeklyArtistReportEmail(data: {
  displayName: string;
  weekStart: string;
  weekEnd: string;
  revenueThisWeek: number;
  revenueLastWeek: number;
  newSubscribers: number;
  totalSubscribers: number;
  playsThisWeek: number;
  topTrack: string | null;
  topTrackPlays: number;
  slug: string;
}): string {
  const revenueDiff = data.revenueThisWeek - data.revenueLastWeek;
  const revenueUp = revenueDiff >= 0;
  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

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
      <h2 style="color:#FFFFFF;font-size:24px;margin:0 0 8px;">Weekly Report</h2>
      <p style="color:#666;font-size:14px;margin:0 0 24px;">${data.weekStart} to ${data.weekEnd}</p>

      <p style="color:#A0A0A0;font-size:16px;line-height:1.6;margin:0 0 24px;">
        Hey ${data.displayName}, here is how your CRWN page performed this week.
      </p>

      <div style="display:flex;gap:12px;margin:0 0 24px;">
        <div style="flex:1;background:#1A1A1A;border-radius:12px;padding:16px;text-align:center;">
          <p style="color:#666;font-size:12px;text-transform:uppercase;margin:0 0 4px;">Revenue</p>
          <p style="color:#D4AF37;font-size:24px;font-weight:700;margin:0;">${formatCurrency(data.revenueThisWeek)}</p>
          <p style="color:${revenueUp ? '#22c55e' : '#ef4444'};font-size:12px;margin:4px 0 0;">
            ${revenueUp ? '+' : ''}${formatCurrency(revenueDiff)} vs last week
          </p>
        </div>
        <div style="flex:1;background:#1A1A1A;border-radius:12px;padding:16px;text-align:center;">
          <p style="color:#666;font-size:12px;text-transform:uppercase;margin:0 0 4px;">New Subs</p>
          <p style="color:#FFFFFF;font-size:24px;font-weight:700;margin:0;">+${data.newSubscribers}</p>
          <p style="color:#666;font-size:12px;margin:4px 0 0;">${data.totalSubscribers} total</p>
        </div>
      </div>

      <div style="background:#1A1A1A;border-radius:12px;padding:16px;margin:0 0 24px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <p style="color:#666;font-size:12px;text-transform:uppercase;margin:0 0 4px;">Plays This Week</p>
            <p style="color:#FFFFFF;font-size:24px;font-weight:700;margin:0;">${data.playsThisWeek.toLocaleString()}</p>
          </div>
          ${data.topTrack ? `
          <div style="text-align:right;">
            <p style="color:#666;font-size:12px;text-transform:uppercase;margin:0 0 4px;">Top Track</p>
            <p style="color:#D4AF37;font-size:14px;font-weight:600;margin:0;">${data.topTrack}</p>
            <p style="color:#666;font-size:12px;margin:2px 0 0;">${data.topTrackPlays} plays</p>
          </div>
          ` : ''}
        </div>
      </div>

      <a href="https://thecrwn.app/profile/artist" style="display:block;text-align:center;background-color:#D4AF37;color:#1A1A1A;font-weight:600;padding:14px 24px;border-radius:9999px;text-decoration:none;font-size:16px;">
        View Full Dashboard
      </a>
    </div>

    <div style="text-align:center;margin-top:24px;">
      <p style="color:#666;font-size:12px;margin:0;">
        You are receiving this because you are an artist on CRWN.
      </p>
      <p style="color:#666;font-size:12px;margin:4px 0 0;">
        <a href="https://thecrwn.app/${data.slug}" style="color:#D4AF37;text-decoration:none;">thecrwn.app/${data.slug}</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}
