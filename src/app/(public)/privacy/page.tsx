import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy | CRWN',
  description: 'CRWN Privacy Policy',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-crwn-bg">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link href="/home" className="text-crwn-gold hover:underline text-sm mb-8 inline-block">
          ← Back to CRWN
        </Link>
        <h1 className="text-3xl font-bold text-crwn-gold mb-2">Privacy Policy</h1>
        <p className="text-crwn-text-secondary mb-8">Effective Date: March 10, 2026</p>

        <div className="prose prose-invert max-w-none space-y-6 text-crwn-text-secondary">
          <h2 className="text-xl font-semibold text-crwn-text">1. Introduction</h2>
          <p>CRWN ("the Platform"), accessible at thecrwn.app, is operated by JNW Creative Enterprises, Inc. This Privacy Policy explains how we collect, use, share, retain, and protect personal information.</p>

          <h2 className="text-xl font-semibold text-crwn-text">2. Information We Collect</h2>
          <p><strong>Information You Provide:</strong> Email address, display name, authentication credentials, profile information, content you upload, and payment information processed by Stripe.</p>
          <p><strong>Collected Automatically:</strong> Usage data, listening data (tracks played, duration, completion), device information, log data, and approximate location from IP address.</p>
          <p><strong>Cookies:</strong> We use cookies and local storage for login sessions, preferences, and security. No third-party advertising cookies.</p>

          <h2 className="text-xl font-semibold text-crwn-text">3. How We Use Your Information</h2>
          <p>To operate the Platform, personalize your experience, provide analytics to artists, improve the Platform, communicate with you, enforce our policies, and comply with legal obligations.</p>

          <h2 className="text-xl font-semibold text-crwn-text">4. What Artists Can See</h2>
          <p><strong>Artists CAN see:</strong> Aggregate audience metrics, geographic distribution, revenue breakdowns, top tracks, individual earning events with city/state/country, fan display names in communities, and fan subscription tier.</p>
          <p><strong>Artists CANNOT see:</strong> Your email address (unless you share it), payment details, listening history on other artists, purchases from other artists, IP address, or activity outside that artist&apos;s content.</p>

          <h2 className="text-xl font-semibold text-crwn-text">5. How We Share Your Information</h2>
          <p>We do not sell your personal information. We share with: Stripe (payments), Supabase (database/auth), Vercel (hosting), and as required by law or in business transfers.</p>

          <h2 className="text-xl font-semibold text-crwn-text">6. Data Retention</h2>
          <p>Account data retained while active. Content retained until removed. Payment records retained up to 7 years. Log data retained up to 90 days. After account deletion, personal data removed within 30-45 days except legally required records.</p>

          <h2 className="text-xl font-semibold text-crwn-text">7. Data Security</h2>
          <p>We use TLS/SSL encryption, access controls, row-level security, hashed passwords, and service role separation. No system is 100% secure.</p>

          <h2 className="text-xl font-semibold text-crwn-text">8. Your Rights</h2>
          <p><strong>All Users:</strong> Access, correction, deletion (contact privacy@thecrwn.app), notification preferences, cookie controls.</p>
          <p><strong>California Residents (CCPA):</strong> Rights to know, delete, opt out of sale (we do not sell data), and non-discrimination.</p>
          <p><strong>European Users (GDPR):</strong> Rights to access, rectify, erase, restrict, port data, withdraw consent, and lodge complaints.</p>

          <h2 className="text-xl font-semibold text-crwn-text">9. Children&apos;s Privacy</h2>
          <p>CRWN is intended only for individuals 18 years of age or older. We do not knowingly collect information from minors.</p>

          <h2 className="text-xl font-semibold text-crwn-text">10. Contact</h2>
          <p><strong>Privacy:</strong> privacy@thecrwn.app</p>
          <p><strong>Support:</strong> support@thecrwn.app</p>
          <p><strong>Entity:</strong> JNW Creative Enterprises, Inc.</p>
        </div>

        <div className="mt-12 pt-6 border-t border-crwn-elevated text-center text-xs text-crwn-text-secondary">
          JNW Creative Enterprises, Inc. © 2026. All rights reserved.
        </div>
      </div>
    </div>
  );
}
