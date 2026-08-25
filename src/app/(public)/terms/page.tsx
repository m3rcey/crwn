import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service | CRWN',
  description: 'CRWN Terms of Service',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-crwn-bg">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link href="/home" className="text-crwn-gold hover:underline text-sm mb-8 inline-block">
          ← Back to CRWN
        </Link>
        <h1 className="text-3xl font-bold text-crwn-gold mb-2">Terms of Service</h1>
        <p className="text-crwn-text-secondary mb-8">Effective Date: August 25, 2026</p>

        <div className="prose prose-invert max-w-none space-y-6 text-crwn-text-secondary">
          <h2 className="text-xl font-semibold text-crwn-text">1. Acceptance of Terms</h2>
          <p>By creating an account on CRWN ("the Platform"), accessible at thecrwn.app, you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the Platform.</p>
          <p>CRWN is operated by JNW Creative Enterprises, Inc. ("we," "us," or "our"). These Terms constitute a legally binding agreement between you and JNW Creative Enterprises, Inc.</p>
          <p>We may update these Terms from time to time. Continued use of the Platform after changes constitutes acceptance of the revised Terms. We will notify you of material changes via email or in-app notification.</p>

          <h2 className="text-xl font-semibold text-crwn-text">2. Account Registration</h2>
          <p>You must be at least 18 years of age to create an account on CRWN. You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account.</p>
          <p>You agree to provide accurate, current, and complete information during registration and to update such information as necessary. We reserve the right to suspend or terminate accounts that contain false or misleading information.</p>

          <h2 className="text-xl font-semibold text-crwn-text">3. User Roles</h2>
          <h3 className="text-lg font-medium text-crwn-text">3.1 Fans</h3>
          <p>Fans may browse public artist pages, subscribe to artist tiers, purchase products from the shop, stream music, participate in communities, create playlists, and engage with content on the Platform.</p>
          <h3 className="text-lg font-medium text-crwn-text">3.2 Artists</h3>
          <p>Artists may upload and distribute music, create subscription tiers, sell digital products and experiences, build communities, and receive payouts through Stripe Connect. Artists are subject to the additional terms in the CRWN Artist Agreement.</p>

          <h2 className="text-xl font-semibold text-crwn-text">4. Subscriptions and Payments</h2>
          <p><strong>Automatic Renewal:</strong> Paid subscriptions on CRWN (fan memberships and CRWN platform plans) renew automatically at the end of each billing period, monthly or annual, until canceled. You can cancel at any time from your account settings or by contacting support@thecrwn.app, and your access continues until the end of the current billing period. We will notify you before a price change takes effect; continued use after that date constitutes acceptance of the new price.</p>
          <p><strong>Upgrades:</strong> If you upgrade to a higher tier, you will be charged a prorated amount immediately for the remainder of your current billing period.</p>
          <p><strong>Downgrades:</strong> If you downgrade to a lower tier, the change takes effect at the end of your current billing period.</p>
          <p><strong>Cancellations:</strong> You may cancel your subscription at any time. Your access continues until the end of the current billing period. No partial refunds are issued for unused time.</p>
          <p><strong>Shop Purchases:</strong> All shop purchases are final and non-refundable unless the product is not delivered as described. Contact us within 14 days of purchase if you believe a product was misrepresented.</p>
          <p><strong>Live Session Tickets:</strong> A ticket to a live session, including a seat in an Executive Producer Session, gives you access to that session at its scheduled time and to any replay the artist chooses to include. Once the session takes place, the ticket is final and non-refundable, including if you do not attend. If the artist cancels the session, or reschedules it to a time you cannot attend, you are entitled to a refund of the ticket price. Request a refund at support@thecrwn.app within 14 days of the affected session.</p>
          <p><strong>Tips:</strong> Tips sent to an artist (for example during a live session) are voluntary payments. A tip is not a purchase of goods or services and is non-refundable. Platform and payment processing fees apply to tips.</p>
          <p><strong>Artist Benefits and Promotions:</strong> Membership benefits, promised content, and rewards offered in an artist&apos;s campaigns or promotions are offers made by the artist, and fulfilling them is the artist&apos;s sole responsibility. CRWN is not a party to those offers. If an artist repeatedly fails to deliver promised benefits, contact support@thecrwn.app; we may take action against the artist&apos;s account, and any refund beyond your cancellation rights is at our discretion.</p>
          <p><strong>Platform Fees:</strong> CRWN charges a platform fee on all fan-to-artist transactions. The fee is 12% on Launch (the free plan), 8% on Pro ($49/month), and 5% on Scale ($199/month). Promotional rates may apply if you join through a partner offer. Stripe processing fees are separate.</p>

          <h2 className="text-xl font-semibold text-crwn-text">5. Content and Intellectual Property</h2>
          <p>You retain ownership of all content you upload to CRWN. By uploading content, you grant CRWN a non-exclusive, worldwide, royalty-free license to host, display, stream, distribute, and promote your content on the Platform.</p>
          <p>You are solely responsible for the content you upload and represent that you own or have obtained all necessary rights and permissions.</p>
          <p><strong>DMCA:</strong> If you believe content on CRWN infringes your copyright, submit a DMCA notice to dmca@thecrwn.app.</p>

          <h2 className="text-xl font-semibold text-crwn-text">6. Community Guidelines</h2>
          <p>Treat all users with respect. No harassment, hate speech, threats, spam, scams, impersonation, or illegal content. Artists may moderate their own communities. CRWN reserves the right to remove content or suspend accounts that violate these guidelines.</p>

          <h2 className="text-xl font-semibold text-crwn-text">7. Privacy</h2>
          <p>Your use of CRWN is also governed by our <Link href="/privacy" className="text-crwn-gold hover:underline">Privacy Policy</Link>.</p>

          <h2 className="text-xl font-semibold text-crwn-text">8. Prohibited Uses</h2>
          <p>Do not use the Platform for unlawful purposes, attempt unauthorized access, use bots or scrapers, circumvent content gating, redistribute content without authorization, or upload malware.</p>

          <h2 className="text-xl font-semibold text-crwn-text">9. Termination</h2>
          <p>We may suspend or terminate your account for violation of these Terms. Upon termination, fan subscriptions are canceled, artists receive outstanding payouts within 30 days, and content may be removed.</p>

          <h2 className="text-xl font-semibold text-crwn-text">10. Disclaimers and Limitation of Liability</h2>
          <p>THE PLATFORM IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. TO THE MAXIMUM EXTENT PERMITTED BY LAW, JNW CREATIVE ENTERPRISES, INC. SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES.</p>

          <h2 className="text-xl font-semibold text-crwn-text">11. Dispute Resolution</h2>
          <p>Disputes shall be resolved through binding arbitration in Missouri. You waive the right to participate in class actions against JNW Creative Enterprises, Inc.</p>

          <h2 className="text-xl font-semibold text-crwn-text">12. General Provisions</h2>
          <p><strong>Governing Law:</strong> State of Missouri.</p>
          <p><strong>Contact:</strong> support@thecrwn.app</p>
          <h2 className="text-xl font-semibold text-crwn-text">13. SMS Messaging</h2>
          <p><strong>Sender:</strong> text messages associated with CRWN are sent by JNW Creative Enterprises, Inc., the company that operates CRWN.</p>
          <p><strong>What the program is:</strong> JNW Creative Enterprises, Inc. operates one automated SMS program, an internal operational alert. When an artist uses the optional &quot;Get a call now&quot; request on a CRWN calculator and qualifies for a conversation with our team, the system sends a notification to an authorized JNW Creative Enterprises, Inc. representative with the information needed to identify the artist and return their call.</p>
          <p><strong>Recipients:</strong> only authorized JNW Creative Enterprises, Inc. personnel who agreed in advance to receive these operational alerts. Artists, fans, prospects, and customers are not recipients of this program.</p>
          <p><strong>What we do not send:</strong> CRWN does not operate a marketing or promotional SMS program. We do not send marketing text messages to artists or fans, we provide artists with no tool for texting their fans, and we do not sell or rent mobile numbers.</p>
          <p><strong>Frequency:</strong> message frequency varies and depends on inbound requests. This is a low volume program.</p>
          <p><strong>Charges:</strong> message and data rates may apply. Charges from your mobile carrier are your responsibility.</p>
          <p><strong>Opt out and help:</strong> reply STOP to any message to stop receiving messages. Reply HELP for help. You may also contact support@thecrwn.app.</p>
          <p><strong>Giving us your number:</strong> providing CRWN with a callback number is optional and requires you to tick an unchecked consent box first. It means a CRWN representative may call or text you about the request you made. It does not subscribe you to a recurring or automated messaging program, and consent is never a condition of using CRWN or of any purchase.</p>
          <p><strong>Privacy:</strong> how we handle mobile numbers and text messaging consent, including the fact that we do not share, sell, or provide them to third parties or affiliates for marketing or promotional purposes, is described in our <Link href="/privacy" className="text-crwn-gold hover:underline">Privacy Policy</Link>.</p>

          <h2 className="text-xl font-semibold text-crwn-text">14. Fan Earnings Program</h2>
          <p>CRWN may offer programs that let fans earn money, such as referral commissions when someone joins through your link, or clip commissions at a rate set by the artist. These terms apply to all such earnings.</p>
          <p><strong>Accrual and cashout:</strong> Earnings accrue to your CRWN balance as the underlying transactions settle. Cashing out requires a minimum balance of $25.00 and a connected Stripe account, including completing Stripe&apos;s identity verification. Earnings may be adjusted for refunds, chargebacks, and canceled transactions.</p>
          <p><strong>Taxes:</strong> You are responsible for any taxes on amounts you receive. We may require tax information and may issue tax forms where the law requires.</p>
          <p><strong>Fraud:</strong> Earnings generated through fraud, self-referral, accounts you control, or artificial activity are void and may be reversed, and we may suspend the account involved.</p>
          <p><strong>Program changes:</strong> We may change or end an earnings program prospectively at any time. Balances already earned under the program rules remain payable unless obtained through fraud.</p>
          <p><strong>Unpaid referrals:</strong> Recommending CRWN to another artist outside of a written partner program is voluntary and unpaid. Compensation for partner referrals is governed by the <Link href="/partner-terms" className="text-crwn-gold hover:underline">Partner Program Terms</Link>.</p>
        </div>

        <div className="mt-12 pt-6 border-t border-crwn-elevated text-center text-xs text-crwn-text-secondary">
          JNW Creative Enterprises, Inc. © 2026. All rights reserved.
        </div>
      </div>
    </div>
  );
}
