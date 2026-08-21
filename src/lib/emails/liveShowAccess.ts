// Sent after a live-show attendee votes. Their vote is ALREADY counted and their free
// membership already exists, so this email is not a gate: it is the key to the account,
// and it says so. Nothing here asks them to confirm anything for the vote to work.
//
// Sent through Resend like every other CRWN email, NOT through Supabase's built-in auth
// mailer, which is rate limited to a handful per hour and would throttle a full room.

export function liveShowAccessEmail(params: {
  firstName: string;
  artistName: string;
  songLabel: string | null;
  signInUrl: string | null;
  artistUrl: string;
}): string {
  const { firstName, artistName, songLabel, signInUrl, artistUrl } = params;
  const greeting = firstName ? `Thanks, ${firstName}` : 'Thanks';
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
      <h2 style="color:#FFFFFF;font-size:26px;margin:0 0 16px;">${greeting}, your vote is counted</h2>
      <p style="color:#A0A0A0;font-size:17px;line-height:1.6;margin:0 0 20px;">
        ${songLabel
          ? `You picked <strong style="color:#FFFFFF;">${songLabel}</strong> at ${artistName}'s show, and it is already in.`
          : `Your pick at ${artistName}'s show is already in.`}
        You do not need to do anything else.
      </p>
      <p style="color:#A0A0A0;font-size:17px;line-height:1.6;margin:0 0 24px;">
        You are now part of ${artistName}'s free fan community, so you will hear the result
        and news about upcoming shows.
      </p>
      ${signInUrl ? `
      <div style="border-top:1px solid #333;padding-top:24px;">
        <p style="color:#A0A0A0;font-size:16px;line-height:1.6;margin:0 0 16px;">
          Whenever you want to get into your free account, use this button. It is just for you.
        </p>
        <div style="text-align:center;margin:0 0 8px;">
          <a href="${signInUrl}" style="display:inline-block;background:linear-gradient(135deg,#9a7b2a,#D4AF37);color:#1A1A1A;font-weight:700;font-size:16px;padding:14px 32px;border-radius:12px;text-decoration:none;">
            Open my free account
          </a>
        </div>
        <p style="color:#6b6b6b;font-size:13px;line-height:1.5;margin:12px 0 0;text-align:center;">
          If you did not vote at a show, you can ignore this email and nothing else will happen.
        </p>
      </div>` : ''}
      <div style="text-align:center;margin:28px 0 0;">
        <a href="${artistUrl}" style="color:#D4AF37;font-size:15px;text-decoration:underline;">
          See ${artistName} on CRWN
        </a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function liveShowAccessSubject(artistName: string): string {
  return `Your vote is in at ${artistName}`;
}
