export function artistNewPurchaseEmail(artistName: string, fanName: string, productTitle: string, amount: string, productType: string): string {
  const typeLabel = productType === 'digital' ? 'Digital Product'
    : productType === 'experience' ? 'Experience'
    : productType === 'bundle' ? 'Bundle'
    : productType === 'track' ? 'Track'
    : productType === 'album' ? 'Album'
    : 'Product';
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
      <h2 style="color:#FFFFFF;font-size:24px;margin:0 0 16px;">New Sale &#128176;</h2>
      <p style="color:#A0A0A0;font-size:16px;line-height:1.6;margin:0 0 24px;">
        Hey ${artistName}, you just made a sale!
      </p>
      <div style="background-color:#1A1A1A;border-radius:12px;padding:20px;margin:0 0 24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="color:#A0A0A0;font-size:14px;padding:8px 0;">Fan</td>
            <td style="color:#FFFFFF;font-size:14px;padding:8px 0;text-align:right;font-weight:600;">${fanName}</td>
          </tr>
          <tr>
            <td style="color:#A0A0A0;font-size:14px;padding:8px 0;">Item</td>
            <td style="color:#FFFFFF;font-size:14px;padding:8px 0;text-align:right;font-weight:600;">${productTitle}</td>
          </tr>
          <tr>
            <td style="color:#A0A0A0;font-size:14px;padding:8px 0;">Type</td>
            <td style="color:#FFFFFF;font-size:14px;padding:8px 0;text-align:right;">${typeLabel}</td>
          </tr>
          <tr>
            <td style="color:#A0A0A0;font-size:14px;padding:8px 0;border-top:1px solid #333;">Total</td>
            <td style="color:#D4AF37;font-size:18px;padding:8px 0;text-align:right;font-weight:700;border-top:1px solid #333;">$${amount}</td>
          </tr>
        </table>
      </div>
      <div style="text-align:center;margin:32px 0 0;">
        <a href="https://thecrwn.app/profile/artist?tab=payouts" style="display:inline-block;background:linear-gradient(135deg,#9a7b2a,#D4AF37);color:#1A1A1A;font-weight:700;font-size:16px;padding:14px 32px;border-radius:12px;text-decoration:none;">
          View Earnings
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
