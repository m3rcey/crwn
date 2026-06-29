export function clipperRateChangeEmail(params: {
  fanName: string;
  artistName: string;
  fromRate: number;
  toRate: number;
  daysUntil: number;
  changeDateLabel: string;
}) {
  const { fanName, artistName, fromRate, toRate, daysUntil, changeDateLabel } = params;
  const whenPhrase = daysUntil <= 0 ? 'today' : `in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`;

  return {
    subject: `Heads up: your ${artistName} clipper cut changes ${whenPhrase}`,
    html: `
      <div style="background-color: #1A1A1A; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="max-width: 460px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #D4AF37; font-size: 28px; font-weight: bold; margin: 0;">CRWN</h1>
          </div>
          <div style="background-color: #242424; border-radius: 12px; padding: 32px; border: 1px solid #333;">
            <h2 style="color: #FFFFFF; font-size: 20px; font-weight: 600; margin: 0 0 12px 0;">Your cut is changing, ${fanName}</h2>
            <div style="text-align: center; margin: 24px 0;">
              <span style="color: #FFFFFF; font-size: 32px; font-weight: bold;">${fromRate}%</span>
              <span style="color: #666; font-size: 24px; margin: 0 10px;">&rarr;</span>
              <span style="color: #D4AF37; font-size: 32px; font-weight: bold;">${toRate}%</span>
              <p style="color: #666; font-size: 12px; margin: 6px 0 0 0;">effective ${changeDateLabel}</p>
            </div>
            <p style="color: #A0A0A0; font-size: 14px; line-height: 1.6; margin: 0 0 16px 0;">
              ${whenPhrase === 'today' ? 'Starting today' : `In ${daysUntil} day${daysUntil === 1 ? '' : 's'}`}, your clipper cut on <strong style="color: #FFFFFF;">${artistName}</strong> moves from <strong style="color: #FFFFFF;">${fromRate}%</strong> to <strong style="color: #FFFFFF;">${toRate}%</strong> on every <em>new</em> subscriber your clips bring in after that date.
            </p>
            <p style="color: #A0A0A0; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
              Subscribers you've already brought in keep their original rate. Nothing you've earned changes. Want the higher cut? Get your clips up before the date.
            </p>
            <div style="text-align: center;">
              <a href="https://thecrwn.app/library?tab=referrals" style="display: inline-block; background-color: #D4AF37; color: #1A1A1A; font-weight: 600; font-size: 14px; padding: 12px 32px; border-radius: 9999px; text-decoration: none;">
                View Earnings
              </a>
            </div>
          </div>
          <div style="text-align: center; margin-top: 24px;">
            <p style="color: #666; font-size: 11px; margin: 0;">
              JNW Creative Enterprises, Inc.
              <br/>
              <a href="https://thecrwn.app/terms" style="color: #D4AF37; text-decoration: none;">Terms</a> &middot;
              <a href="https://thecrwn.app/privacy" style="color: #D4AF37; text-decoration: none;">Privacy</a>
            </p>
          </div>
        </div>
      </div>
    `,
  };
}
