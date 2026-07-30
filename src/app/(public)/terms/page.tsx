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
        <p className="text-crwn-text-secondary mb-8">Effective Date: July 24, 2026</p>

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
          <p><strong>Upgrades:</strong> If you upgrade to a higher tier, you will be charged a prorated amount immediately for the remainder of your current billing period.</p>
          <p><strong>Downgrades:</strong> If you downgrade to a lower tier, the change takes effect at the end of your current billing period.</p>
          <p><strong>Cancellations:</strong> You may cancel your subscription at any time. Your access continues until the end of the current billing period. No partial refunds are issued for unused time.</p>
          <p><strong>Shop Purchases:</strong> All shop purchases are final and non-refundable unless the product is not delivered as described. Contact us within 14 days of purchase if you believe a product was misrepresented.</p>
          <p><strong>Live Session Tickets:</strong> A ticket to a live session, including a seat in an Executive Producer Session, gives you access to that session at its scheduled time and to any replay the artist chooses to include. Once the session takes place, the ticket is final and non-refundable, including if you do not attend. If the artist cancels the session, or reschedules it to a time you cannot attend, you are entitled to a refund of the ticket price. Request a refund at support@thecrwn.app within 14 days of the affected session.</p>
          <p><strong>Platform Fees:</strong> CRWN charges a platform fee on all fan-to-artist transactions. The fee is 12% on the Free plan and 8% on Pro ($9.99/month). Promotional rates may apply if you join through a partner offer. Stripe processing fees are separate.</p>

          <h2 className="text-xl font-semibold text-crwn-text">5. Content and Intellectual Property</h2>
          <p>You retain ownership of all content you upload to CRWN. By uploading content, you grant CRWN a non-exclusive, worldwide, royalty-free license to host, display, stream, distribute, and promote your content on the Platform.</p>
          <p>You are solely responsible for the content you upload and represent that you own or have obtained all necessary rights and permissions.</p>
          <p><strong>DMCA:</strong> If you believe content on CRWN infringes your copyright, submit a DMCA notice to dmca@thecrwn.app.</p>

          <h2 className="text-xl font-semibold text-crwn-text">6. Community Guidelines</h2>
          <p>Treat all users with respect. No harassment, hate speech, threats, spam, scams, impersonation, or illegal content. Artists may moderate their own communities. CRWN reserves the right to remove content or suspend accounts that violate these guidelines.</p>

          <h2 className="text-xl font-semibold text-crwn-text">7. Privacy</h2>
          <p>Your use of CRWN is also governed by our <a href="/privacy" className="text-crwn-gold hover:underline">Privacy Policy</a>.</p>

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

          {/* Required by US carriers for A2P 10DLC campaign registration: the program name,
              what is sent, frequency, cost disclosure, HELP and STOP instructions, and a
              support contact must all appear at the Terms URL submitted to Twilio. */}
          <h2 className="text-xl font-semibold text-crwn-text">13. SMS Messaging Program</h2>
          <p><strong>Program name:</strong> CRWN Alerts, operated by JNW Creative Enterprises, Inc.</p>
          <p><strong>What we send:</strong> two kinds of text message, and nothing else. First, operational account notifications to the CRWN account owner, such as an alert that an artist has asked to be contacted. Second, where an artist has enabled texting and a fan has opted in, updates from that specific artist about new releases, shows, exclusive drops, and event reminders. We never send texts to anyone who has not opted in, and we never sell or share phone numbers with third parties for their own marketing.</p>
          <p><strong>How to opt in:</strong> a fan opts in by texting the artist&apos;s keyword to that artist&apos;s CRWN number. We reply asking them to confirm, and they are only subscribed after they reply <strong>YES</strong>. Account owners receive operational alerts for their own account only, at a number they entered themselves.</p>
          <p><strong>Message frequency:</strong> varies. Artist updates are capped at a maximum of 4 messages per month per fan, and no more than 1 per day. Operational account alerts are sent only when the event they describe actually occurs.</p>
          <p><strong>Cost:</strong> message and data rates may apply. CRWN does not charge you for receiving texts; your mobile carrier&apos;s standard rates apply.</p>
          <p><strong>To stop receiving texts:</strong> reply <strong>STOP</strong> to any message. You may also reply UNSUBSCRIBE, CANCEL, or QUIT. You will receive one confirmation, and then no further texts from that sender.</p>
          <p><strong>For help:</strong> reply <strong>HELP</strong> to any message, or email support@thecrwn.app.</p>
          <p><strong>Carriers:</strong> carriers are not liable for delayed or undelivered messages.</p>
          <p><strong>Privacy:</strong> phone numbers and consent records are handled as described in our <Link href="/privacy" className="text-crwn-gold hover:underline">Privacy Policy</Link>. Consent to SMS is recorded separately from email and is never shared with third parties for marketing.</p>
        </div>

        <div className="mt-12 pt-6 border-t border-crwn-elevated text-center text-xs text-crwn-text-secondary">
          JNW Creative Enterprises, Inc. © 2026. All rights reserved.
        </div>
      </div>
    </div>
  );
}
