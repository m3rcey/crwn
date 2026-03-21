export function partnerApplicationNotificationEmail(params: {
  name: string;
  email: string;
  platform: string;
  audience_size: string;
  profile_url: string;
  why_crwn?: string;
}) {
  const { name, email, platform, audience_size, profile_url, why_crwn } = params;

  const platformLabels: Record<string, string> = {
    tiktok: 'TikTok',
    youtube: 'YouTube',
    instagram: 'Instagram',
    twitter: 'Twitter/X',
    other: 'Other',
  };

  const audienceLabels: Record<string, string> = {
    under_5k: 'Under 5K',
    '5k_25k': '5K-25K',
    '25k_100k': '25K-100K',
    '100k_500k': '100K-500K',
    '500k_plus': '500K+',
  };

  return {
    subject: `New Partner Application: ${name}`,
    html: `
      <div style="background-color: #1A1A1A; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="max-width: 460px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #D4AF37; font-size: 28px; font-weight: bold; margin: 0;">CRWN</h1>
          </div>
          <div style="background-color: #242424; border-radius: 12px; padding: 32px; border: 1px solid #333;">
            <h2 style="color: #FFFFFF; font-size: 20px; font-weight: 600; margin: 0 0 24px 0;">New Partner Application</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px;">Name</td>
                <td style="padding: 8px 0; color: #FFFFFF; font-size: 14px; text-align: right;">${name}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px;">Email</td>
                <td style="padding: 8px 0; color: #FFFFFF; font-size: 14px; text-align: right;">${email}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px;">Platform</td>
                <td style="padding: 8px 0; color: #FFFFFF; font-size: 14px; text-align: right;">${platformLabels[platform] || platform}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px;">Audience Size</td>
                <td style="padding: 8px 0; color: #FFFFFF; font-size: 14px; text-align: right;">${audienceLabels[audience_size] || audience_size}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px;">Profile</td>
                <td style="padding: 8px 0; color: #D4AF37; font-size: 14px; text-align: right;"><a href="${profile_url}" style="color: #D4AF37; text-decoration: none;">View Profile</a></td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px; vertical-align: top;">Why CRWN</td>
                <td style="padding: 8px 0; color: #FFFFFF; font-size: 14px; text-align: right;">${why_crwn || 'Not provided'}</td>
              </tr>
            </table>
          </div>
          <div style="text-align: center; margin-top: 24px;">
            <p style="color: #666; font-size: 11px; margin: 0;">
              Review in Supabase: partner_applications table
            </p>
          </div>
        </div>
      </div>
    `,
  };
}
