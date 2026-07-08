// Transactional email to the winning clipper when an artist marks their bounty
// submission as the winner. v1 rewards are non-cash (badge / detail), so the
// reward line stays generic when no rewardLabel is provided.

const MY_BOUNTIES_URL = 'https://thecrwn.app/my-bounties';

export function bountyWonEmail(params: {
  clipperName?: string | null;
  bountyTitle: string;
  artistName?: string | null;
  rewardLabel?: string | null;
}) {
  const first = (params.clipperName || '').trim().split(' ')[0] || 'there';
  const artist = (params.artistName || '').trim();
  const reward = (params.rewardLabel || '').trim();

  const artistLine = artist
    ? `${artist} picked your clip as the winner.`
    : `Your clip took the bounty.`;
  const rewardLine = reward
    ? `Your reward: ${reward}.`
    : `Your reward is on the way.`;

  return {
    subject: `You won the "${params.bountyTitle}" bounty 🏆`,
    html: `
      <div style="background-color: #1A1A1A; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="max-width: 460px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #D4AF37; font-size: 28px; font-weight: bold; margin: 0;">CRWN</h1>
          </div>
          <div style="background-color: #242424; border-radius: 12px; padding: 32px; border: 1px solid #333;">
            <p style="color: #FFFFFF; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">Congrats ${first} 🏆</p>
            <p style="color: #CCCCCC; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
              You won the "${params.bountyTitle}" bounty. ${artistLine}
            </p>
            <p style="color: #CCCCCC; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
              ${rewardLine}
            </p>
            <div style="text-align: center; margin: 28px 0 8px 0;">
              <a href="${MY_BOUNTIES_URL}" style="display: inline-block; background-color: #D4AF37; color: #000000; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 999px;">View your bounties</a>
            </div>
            <p style="color: #CCCCCC; font-size: 15px; line-height: 1.6; margin: 24px 0 0 0;">
              Keep clipping.<br />
              CRWN
            </p>
          </div>
        </div>
      </div>
    `,
  };
}
