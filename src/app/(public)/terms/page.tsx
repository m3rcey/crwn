import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service | CRWN',
  description: 'CRWN Terms of Service',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-crwn-bg">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link href="/" className="text-crwn-gold hover:underline text-sm mb-8 inline-block">
          ← Back to CRWN
        </Link>
        <h1 className="text-3xl font-bold text-crwn-gold mb-2">Terms of Service</h1>
        <p className="text-crwn-text-secondary mb-8">Effective Date: March 10, 2026</p>

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
          <p><strong>Platform Fees:</strong> CRWN charges a platform fee on all fan-to-artist transactions. The standard fee is 8%, reduced to 6% for Label tier artists and 5% for Founding Artists. Stripe processing fees are separate.</p>

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
        </div>

        <div className="mt-12 pt-6 border-t border-crwn-elevated text-center text-xs text-crwn-text-secondary">
          JNW Creative Enterprises, Inc. © 2026. All rights reserved.
        </div>
      </div>
    </div>
  );
}
