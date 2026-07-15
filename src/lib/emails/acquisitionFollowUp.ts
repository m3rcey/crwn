// Follow-up copy for the Instagram acquisition funnel.
//
// FOUR RULES. Break any of them and the message is worse than not sending it.
//
// 1. EVERY DM ENDS WITH A QUESTION.
//    This is not a style note, it is infrastructure. Meta's messaging window reopens EVERY
//    TIME SHE REPLIES. A message that ends in a link she ignores lets the 24-hour window
//    close, and once it closes CRWN can never DM her again. A message that ends in a question
//    she answers buys another 24 hours and turns a broadcast into a conversation.
//    The question is what keeps the channel alive.
//
// 2. LEAD WITH THE LOSS (CLAUDE.md). Not "here is what you could earn" (gain-framed,
//    ignorable) but "this is what you are not earning" (loss-framed, uncomfortable, effective).
//    Name the cost of inaction first, then the fix.
//
// 3. NO EM DASHES (CLAUDE.md). Anywhere. Not in a subject, not in a DM, not in a button.
//
// 4. HER, NOT HIM. Most CRWN artists are women. So no "bro", no "mate", no "my guy". The
//    reference funnel this was modelled on opens with "Hey mate!" and "Yo bro" and that voice
//    is wrong for this audience.
//
// ON THE "PERSONAL" DM: it is automated, and it does NOT claim otherwise. The reference funnel
// says "Non automated Niall so you can reply haha" while being automated, which is a lie.
// CRWN's whole pitch is that artists finally get dealt with straight, so opening the
// relationship with a fib about who wrote the message is a bad trade. "You can reply to this,
// I read them" is TRUE (replies land in the ManyChat inbox) and does exactly the same job.

export interface FollowUpCopy {
  dm: string;
  subject: string;
  html: string;
}

// Where the email CTAs send her: the CRWN signup, tagged so we can attribute signups back to the
// Instagram funnel. By the time she is in the email nurture she has already seen her number, so
// the job of these emails is to convert her into an artist account. The `ref` is read at signup
// for attribution; an unrecognized value is ignored harmlessly.
const SIGNUP_URL = 'https://thecrwn.app/signup?ref=ig-funnel';

/** They got the link and never opened it. */
export function resultNotViewed(params: { headline: string; resultUrl: string }): FollowUpCopy {
  const { headline, resultUrl } = params;
  const amount = headline.replace(/^About /i, '').replace(/ a month.*$/i, '');

  return {
    // Loss first. Then the link. Then a question, so a reply reopens the window.
    dm: `Your numbers are still sitting here unopened. ${amount} a month is what you are leaving on the table every month you do not set this up, and it goes to a platform instead of you.

${resultUrl}

What is stopping you from taking a look?`,

    subject: 'You still have not looked at your numbers',
    html: shell({
      heading: 'You still have not looked at your numbers',
      body: `
        <p style="${P}">We ran them. You did not open them.</p>
        <p style="${P}">Every month you do not set this up is a month that money goes to a platform instead of to you. It is not hypothetical. The number is already calculated and it is sitting in your account right now.</p>
        <p style="${P}"><strong style="color:#FFF;">What is stopping you from taking a look?</strong> Reply to this email, I read them.</p>
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
    // The question NAMES the two real objections and lets her just point at one. "What is
    // actually in the way?" was therapy-speak: open-ended, requires reflection, and reflection
    // is friction. A question she can answer in one word gets answered.
    dm: `You saw the number. Nothing changes until you build the thing that collects it. Your fans are already spending money every month, it just does not reach you.

${resultUrl}

Be honest with me: is it that the setup looks like a hassle, or that you do not believe the number?`,

    subject: 'Knowing the number does not change the number',
    html: shell({
      heading: 'Knowing the number does not change the number',
      body: `
        <p style="${P}">You looked. Good. But a number on a page has never paid anyone.</p>
        <p style="${P}">Your fans are already spending money every month. Right now none of it reaches you, and that stays true for exactly as long as you have nowhere for them to send it.</p>
        <p style="${P}"><strong style="color:#FFF;">Be honest with me: is it that the setup looks like a hassle, or that you do not believe the number?</strong> Reply and tell me, I read every one.</p>
      `,
      cta: 'Start earning on CRWN',
      ctaUrl: SIGNUP_URL,
    }),
  };
}

/**
 * The personal one. Day 4.
 *
 * Automated, and honest about being repliable. This is the highest-leverage message in the
 * sequence because it breaks the automation spell: first person, a real name, an admission
 * that the artist is being talked to rather than marketed at, and a question she can actually
 * answer. Pair it with a photo in ManyChat (see the setup guide) and it stops reading like a
 * funnel.
 *
 * Note what it does NOT do: claim to be hand-typed. It says "you can reply to this, I read
 * them", which is true, and gets the same result without lying to an artist on day four of
 * knowing her.
 */
export function personalNudge(params: { amount: string | null }): FollowUpCopy {
  const { amount } = params;
  const money = amount ? `${amount} a month` : 'that number';

  return {
    dm: `Hey, Josh here. I built CRWN. You can reply to this by the way, I read them.

I saw your numbers come through. ${money} is real money, and right now none of it reaches you. Not because your fans will not pay, but because there is nowhere for them to send it.

I have watched artists with a tenth of your reach out-earn people on major deals, purely because they owned the relationship.

What is the actual thing keeping you from setting this up?`,

    subject: 'Josh from CRWN, quick question',
    html: shell({
      heading: 'Quick question',
      body: `
        <p style="${P}">Josh here. I built CRWN. You can reply to this, I read them.</p>
        <p style="${P}">I saw your numbers come through. ${money} is real money, and right now none of it reaches you. Not because your fans will not pay, but because there is nowhere for them to send it.</p>
        <p style="${P}">I have watched artists with a tenth of your reach out-earn people on major deals, purely because they owned the relationship.</p>
        <p style="${P}"><strong style="color:#FFF;">What is the actual thing keeping you from setting this up?</strong></p>
      `,
      cta: 'Start free on CRWN',
      ctaUrl: SIGNUP_URL,
    }),
  };
}

/**
 * Day 7. The call offer.
 *
 * Offers BOTH paths and lets her choose, because at this volume nobody knows which one works
 * and the choice she makes IS the data. 57% of artists who finish CRWN's setup never connect
 * Stripe, which means they can never be paid: that is the single step a 15-minute call fixes
 * and self-serve does not.
 */
export function offerCall(params: { bookingUrl: string; resultUrl: string }): FollowUpCopy {
  const { bookingUrl, resultUrl } = params;

  return {
    dm: `Most artists who see their number do nothing with it, and it is almost never because they do not want the money. It is because setting up payments is the boring part and it sits there undone.

So, two ways to do this:

1. Start free yourself: ${resultUrl}
2. Book 15 minutes and I will set the whole thing up with you, live: ${bookingUrl}

Which one sounds more like you?`,

    subject: 'Want me to just set it up with you?',
    html: shell({
      heading: 'Want me to just set it up with you?',
      body: `
        <p style="${P}">Most artists who see their number do nothing with it, and it is almost never because they do not want the money. It is because setting up payments is the boring part, so it sits there undone while the money keeps going somewhere else.</p>
        <p style="${P}">Two ways to do this. Start free on your own, or book 15 minutes and I will build it with you live: your tiers, your pricing, your payouts.</p>
        <p style="${P}"><strong style="color:#FFF;">Which one sounds more like you?</strong></p>
      `,
      cta: 'Book 15 minutes',
      ctaUrl: bookingUrl,
    }),
  };
}

/** She walked away mid-conversation, before we had enough to run anything. */
export function sessionAbandoned(): FollowUpCopy {
  return {
    dm: `You stopped one answer short, so I never got to show you the number. It does not go away because you did not look at it, it just keeps being money you are not collecting.

Roughly how many monthly listeners do you have?`,

    subject: 'You stopped one answer short',
    html: shell({
      heading: 'You stopped one answer short',
      body: `
        <p style="${P}">We were one question away from showing you what your fanbase is actually worth, and then you went quiet.</p>
        <p style="${P}">That number does not go away because you did not look at it. It just keeps being money you are not collecting.</p>
        <p style="${P}"><strong style="color:#FFF;">Roughly how many monthly listeners do you have?</strong></p>
      `,
      cta: 'Finish it',
      ctaUrl: 'https://thecrwn.app/worth',
    }),
  };
}

/** She booked a call. Confirm, and make sure she brings the one thing that matters. */
export function callBooked(): FollowUpCopy {
  return {
    dm: `Locked in. Talk soon.

One thing that will make the call actually useful: have your Spotify for Artists open, so we can look at your real numbers instead of estimates. We will set up your tiers and your payouts live, and you will leave able to take money.

Anything specific you want me to cover?`,

    subject: 'You are booked in',
    html: shell({
      heading: 'You are booked in',
      body: `
        <p style="${P}">Talk soon.</p>
        <p style="${P}">One thing that will make the call actually useful: have your Spotify for Artists open so we can look at your real numbers instead of estimates. We will set up your tiers and your payouts live, and you will leave able to take money.</p>
        <p style="${P}"><strong style="color:#FFF;">Anything specific you want me to cover?</strong></p>
      `,
      cta: 'See your numbers again',
      ctaUrl: 'https://thecrwn.app/worth',
    }),
  };
}

// ---------------------------------------------------------------------------
// THE NO-SHOW LADDER
//
// She booked and did not turn up. Three messages, then stop.
//
// The tone MUST get lighter, not heavier. A no-show is almost never disrespect: it is a
// forgotten calendar invite, a session that ran over, a day that got away from her. Guilt-trip
// her and she will never reply, because replying now costs her an apology.
//
// The third message is a BREAKUP, and it is the highest-replying message in this entire
// funnel. "Should I take you off the list?" reliably outperforms any nudge, because it hands
// her back control and it costs her one word to keep the door open.
// ---------------------------------------------------------------------------

/** No-show, within the hour. Warm, zero guilt, easy to answer. */
export function callNoShow(params: { bookingUrl: string }): FollowUpCopy {
  const { bookingUrl } = params;
  return {
    dm: `Missed you. No stress, it happens.

The offer stands: 15 minutes and you walk away with your tiers, your pricing and your payouts done, able to take money from your fans the same day.

${bookingUrl}

Was it just bad timing, or do you want me to leave you to it?`,

    subject: 'Missed you',
    html: shell({
      heading: 'Missed you',
      body: `
        <p style="${P}">No stress, it happens.</p>
        <p style="${P}">The offer stands: 15 minutes and you walk away with your tiers, your pricing and your payouts done, able to take money from your fans the same day.</p>
        <p style="${P}"><strong style="color:#FFF;">Was it just bad timing, or do you want me to leave you to it?</strong></p>
      `,
      cta: 'Pick a new time',
      ctaUrl: bookingUrl,
    }),
  };
}

/** No-show, +2 days. Name the cost of the delay, then a binary question. */
export function callNoShowSecond(params: { bookingUrl: string; amount: string | null }): FollowUpCopy {
  const { bookingUrl, amount } = params;
  const money = amount ? `${amount} a month` : 'that money';

  return {
    dm: `Still thinking about your number. ${money} is not a someday thing, it is happening right now, every month, to someone who is not you.

The setup genuinely takes 15 minutes with me. It is the part most artists never get round to, which is exactly why most artists never get paid directly.

${bookingUrl}

Is this a not-right-now thing, or a not-for-me thing?`,

    subject: 'Still thinking about your number',
    html: shell({
      heading: 'Still thinking about your number',
      body: `
        <p style="${P}">${money.charAt(0).toUpperCase() + money.slice(1)} is not a someday thing. It is happening right now, every month, and it is going to someone who is not you.</p>
        <p style="${P}">The setup genuinely takes 15 minutes with me. It is the part most artists never get round to, which is exactly why most artists never get paid directly.</p>
        <p style="${P}"><strong style="color:#FFF;">Is this a not-right-now thing, or a not-for-me thing?</strong></p>
      `,
      cta: 'Grab 15 minutes',
      ctaUrl: bookingUrl,
    }),
  };
}

/**
 * No-show, +5 days. THE BREAKUP.
 *
 * The highest-replying message in the funnel, and it is not close. It works because it hands
 * her back control and costs her exactly one word to keep the door open. Chasing costs her an
 * apology; this costs her nothing.
 *
 * It is also the LAST message. If she does not reply, she is done, and CRWN stops. A funnel
 * that will not take no for an answer is not persistent, it is a nuisance, and the artist you
 * annoy today is the one who will not come back in a year when she is ready.
 */
export function callNoShowFinal(params: { bookingUrl: string }): FollowUpCopy {
  const { bookingUrl } = params;
  return {
    dm: `I am going to stop chasing you, I promise.

Your numbers do not expire and neither does the offer. If the moment comes where you are tired of watching a platform keep most of what your fans spend, the door is open.

${bookingUrl}

Last thing and then I will leave you alone: do you want me to keep you on the list, or take you off?`,

    subject: 'Last one from me',
    html: shell({
      heading: 'Last one from me',
      body: `
        <p style="${P}">I am going to stop chasing you, I promise.</p>
        <p style="${P}">Your numbers do not expire and neither does the offer. If the moment comes where you are tired of watching a platform keep most of what your fans spend, the door is open.</p>
        <p style="${P}"><strong style="color:#FFF;">Last thing and then I will leave you alone: do you want me to keep you on the list, or take you off?</strong></p>
      `,
      cta: 'The door is open',
      ctaUrl: bookingUrl,
    }),
  };
}

/**
 * THE TOOL DRIP. After the main sequence, one email per CRWN tool, several days apart.
 *
 * She has already seen her Worth number; this stretch keeps the relationship warm by teaching
 * one feature at a time. Each email follows the same spine: what it is, why she needs it (loss
 * first, per CLAUDE.md), how it works, then the tool itself. The content is driven entirely by
 * the lead-magnet registry, so adding a tool there adds it to this drip with no copy here.
 */
export function toolSpotlight(tool: {
  featureName: string;
  headline: string;    // the loss hook, from the tool's hero
  why: string;         // why it costs her to skip it
  whatItIs: string;    // one-line description
  howLong: string;     // e.g. "3 min"
  primaryCta: string;
  toolUrl: string;
}): FollowUpCopy {
  const { featureName, headline, why, whatItIs, howLong, primaryCta, toolUrl } = tool;

  return {
    // Loss hook, one line on the fix, the link, then a question so a reply reopens the window.
    dm: `${headline}

That is what ${featureName} is for. ${whatItIs} It takes about ${howLong}.

${toolUrl}

Want me to walk you through it for your music?`,

    subject: headline,
    html: shell({
      heading: featureName,
      body: `
        <p style="${P}"><strong style="color:#FFF;">${headline}</strong></p>
        <p style="${P}">${why}</p>
        <p style="${P}"><strong style="color:#FFF;">What it is.</strong> ${whatItIs}</p>
        <p style="${P}"><strong style="color:#FFF;">How it works.</strong> Answer a few quick questions and CRWN builds it for you in about ${howLong}. No blank page, no guesswork.</p>
      `,
      cta: primaryCta,
      ctaUrl: toolUrl,
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
