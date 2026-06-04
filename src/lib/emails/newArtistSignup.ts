export function newArtistSignupEmail(params: {
  name: string;
  slug: string;
  recruiterCode?: string | null;
}) {
  const { name, slug, recruiterCode } = params;
  const pageUrl = `https://thecrwn.app/${slug}`;

  return {
    subject: `New artist on CRWN: ${name}`,
    html: `
      <div style="background-color: #1A1A1A; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="max-width: 460px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #D4AF37; font-size: 28px; font-weight: bold; margin: 0;">CRWN</h1>
          </div>
          <div style="background-color: #242424; border-radius: 12px; padding: 32px; border: 1px solid #333;">
            <h2 style="color: #FFFFFF; font-size: 20px; font-weight: 600; margin: 0 0 24px 0;">New artist just published a page</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px;">Name</td>
                <td style="padding: 8px 0; color: #FFFFFF; font-size: 14px; text-align: right;">${name}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px;">Handle</td>
                <td style="padding: 8px 0; color: #FFFFFF; font-size: 14px; text-align: right;">/${slug}</td>
              </tr>
              ${recruiterCode ? `<tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px;">Recruiter</td>
                <td style="padding: 8px 0; color: #FFFFFF; font-size: 14px; text-align: right;">${recruiterCode}</td>
              </tr>` : ''}
            </table>
            <div style="text-align: center; margin-top: 28px;">
              <a href="${pageUrl}" style="display: inline-block; background-color: #D4AF37; color: #000000; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 999px;">View their page</a>
            </div>
          </div>
        </div>
      </div>
    `,
  };
}
