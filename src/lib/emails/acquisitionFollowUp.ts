// Follow-up copy for the Instagram acquisition funnel.
//
// TWO RULES, both from CLAUDE.md, both non-negotiable:
//
//   1. LEAD WITH THE LOSS. Not "here's what you could earn" (gain-framed, ignorable) but
//      "this is what you are not earning right now" (loss-framed, uncomfortable, effective).
//      Name the cost of inaction first, then the fix.
//   2. NO EM DASHES. Anywhere. Not in a subject, not in a button, not in a preheader.
//
// The DM copy is deliberately shorter and blunter than the email. Someone reading an
// Instagram DM is on their phone, mid-scroll, and has already ignored you once.

export interface FollowUpCopy {
  dm: string;
  subject: string;
  html: string;
}

/** They got the link and never opened it. */
export function resultNotViewed(params: { headline: string; resultUrl: string }): FollowUpCopy {
  const { headline, resultUrl } = params;

  return {
    // Loss-framed: the number is already calculated and sitting there unread. The loss is
    // that they still do not know it.
    dm: `You never opened your numbers. They are still sitting here. ${headline.replace(/^About /, '')} is what you are leaving on the table every month you do not run this. Takes 20 seconds to look: ${resultUrl}`,

    subject: 'You still have not looked at your numbers',
    html: shell({
      heading: 'You still have not looked at your numbers',
      body: `
        <p style="${P}">We ran them. You did not open them.</p>
        <p style="${P}">Every month you do not set this up is a month that money goes to a platform instead of to you. It is not a hypothetical. The number is already calculated and it is sitting in your account right now.</p>
      `,
      cta: 'See what you are losing',
      ctaUrl: resultUrl,
    }),
  };
}

/** They opened the result and did nothing with it. */
export function resultViewedNotClaimed(params: { resultUrl: string }): FollowUpCopy {
  const { resultUrl } = params;

  return {
    dm: `You saw the number. Nothing changes until you build the thing that collects it. Your fans are paying someone every month right now, just not you. Want me to set it up with you? ${resultUrl}`,

    subject: 'Knowing the number does not change the number',
    html: shell({
      heading: 'Knowing the number does not change the number',
      body: `
        <p style="${P}">You looked. Good. But a number on a page has never paid anyone.</p>
        <p style="${P}">Your fans are already spending money every month. Right now none of it reaches you, and that stays true for exactly as long as you have nowhere for them to send it.</p>
        <p style="${P}">Save your result and we will build the thing that collects it.</p>
      `,
      cta: 'Set it up',
      ctaUrl: resultUrl,
    }),
  };
}

/** They walked away mid-conversation, before we had enough to run anything. */
export function sessionAbandoned(): FollowUpCopy {
  return {
    dm: `You never finished, so I never got to show you the number. One answer and I can. What is your rough monthly listener count?`,

    subject: 'You stopped one answer short',
    html: shell({
      heading: 'You stopped one answer short',
      body: `
        <p style="${P}">We were one question away from showing you what your fanbase is actually worth, and then you went quiet.</p>
        <p style="${P}">That number does not go away because you did not look at it. It just keeps being money you are not collecting.</p>
      `,
      cta: 'Finish it',
      ctaUrl: 'https://thecrwn.app/worth',
    }),
  };
}

/** To Josh, not to the artist. A lead worth a human. */
export function highIntentAlert(params: {
  score: number;
  band: string;
  instagramUsername: string | null;
  reasonCodes: string[];
}): { subject: string; html: string } {
  const { score, band, instagramUsername, reasonCodes } = params;
  const who = instagramUsername ? `@${instagramUsername}` : 'an anonymous lead';

  return {
    subject: `High intent lead: ${who} (${score})`,
    html: shell({
      heading: 'This one is worth a real reply',
      body: `
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="${TD_L}">Instagram</td><td style="${TD_R}">${who}</td></tr>
          <tr><td style="${TD_L}">Score</td><td style="${TD_R}">${score} / 100</td></tr>
          <tr><td style="${TD_L}">Band</td><td style="${TD_R}">${band}</td></tr>
          <tr><td style="${TD_L}">Signals</td><td style="${TD_R}">${reasonCodes.join(', ') || 'none'}</td></tr>
        </table>
        <p style="${P}">They came through the Instagram funnel and scored high enough that automation is the wrong answer. Go talk to them.</p>
      `,
      cta: 'Open admin',
      ctaUrl: 'https://thecrwn.app/admin',
    }),
  };
}

// ---------------------------------------------------------------------------
// Shell. Matches the existing CRWN email templates (dark card, gold accent).
// ---------------------------------------------------------------------------

const P = 'color: #B0B0B0; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;';
const TD_L = 'padding: 8px 0; color: #666; font-size: 14px;';
const TD_R = 'padding: 8px 0; color: #FFFFFF; font-size: 14px; text-align: right;';

function shell(params: { heading: string; body: string; cta: string; ctaUrl: string }): string {
  const { heading, body, cta, ctaUrl } = params;
  return `
    <div style="background-color: #1A1A1A; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="max-width: 460px; margin: 0 auto;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #D4AF37; font-size: 28px; font-weight: bold; margin: 0;">CRWN</h1>
        </div>
        <div style="background-color: #242424; border-radius: 12px; padding: 32px; border: 1px solid #333;">
          <h2 style="color: #FFFFFF; font-size: 20px; font-weight: 600; margin: 0 0 20px 0;">${heading}</h2>
          ${body}
          <div style="text-align: center; margin-top: 28px;">
            <a href="${ctaUrl}" style="display: inline-block; background-color: #D4AF37; color: #000000; font-weight: 600; font-size: 15px; padding: 14px 28px; border-radius: 999px; text-decoration: none;">${cta}</a>
          </div>
        </div>
        <p style="text-align: center; color: #555; font-size: 12px; margin-top: 24px;">
          CRWN, where artists own the money their fans already spend.
        </p>
      </div>
    </div>
  `;
}
