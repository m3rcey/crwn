export function bookingTokenEmail(fanName: string, artistName: string, productTitle: string, expiresAt: string) {
  return {
    subject: `Your 1-on-1 with ${artistName} is ready to book`,
    html: `
      <div style="background-color: #0D0D0D; color: #FFFFFF; padding: 40px 20px; font-family: 'Inter', Arial, sans-serif;">
        <div style="max-width: 500px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #D4AF37; font-size: 28px; margin: 0;">CRWN</h1>
          </div>
          <h2 style="font-size: 20px; margin-bottom: 16px;">Hey ${fanName},</h2>
          <p style="color: #CCCCCC; line-height: 1.6;">
            Your purchase of <strong style="color: #FFFFFF;">${productTitle}</strong> with
            <strong style="color: #D4AF37;">${artistName}</strong> is confirmed!
          </p>
          <p style="color: #CCCCCC; line-height: 1.6;">
            Head to your purchases on CRWN to book your session. Your booking window expires on
            <strong style="color: #FFFFFF;">${new Date(expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://thecrwn.app/library" style="background-color: #D4AF37; color: #000000; padding: 14px 32px; border-radius: 9999px; text-decoration: none; font-weight: 600; display: inline-block;">
              Book Your Session
            </a>
          </div>
          <p style="color: #666666; font-size: 12px; text-align: center; margin-top: 40px;">
            © CRWN · thecrwn.app
          </p>
        </div>
      </div>
    `,
  };
}
