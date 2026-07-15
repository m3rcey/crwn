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
        <p className="text-crwn-text-secondary mb-8">Effective Date: July 15, 2026</p>

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
          <p>We do not sell your personal information. We share with: Stripe (payments), Supabase (database/auth), Vercel (hosting), Resend (email delivery), ManyChat (Instagram and social messaging), Anthropic (AI processing of lead conversations), Twilio (SMS, where enabled), and as required by law or in business transfers.</p>

          <h2 className="text-xl font-semibold text-crwn-text">6. Data Retention</h2>
          <p>Account data retained while active. Content retained until removed. Payment records retained up to 7 years. Log data retained up to 90 days. After account deletion, personal data removed within 30-45 days except legally required records.</p>

          <h2 className="text-xl font-semibold text-crwn-text">7. Instagram and Social Media Lead Generation</h2>
          <p>If you comment a keyword on one of our Instagram posts or reels, or send us a direct message, you start an automated conversation with CRWN delivered through ManyChat, a third-party messaging platform. The following applies to that conversation:</p>
          <p><strong>What we collect:</strong> your Instagram user id, username, and public profile name; your ManyChat contact id; the answers you type in the conversation; the conversation transcript; and any email address or phone number you choose to provide. If you provide an email address, we use it to send you the material you requested and related follow-up messages, and every such email includes a one-click unsubscribe link.</p>
          <p><strong>Automated processing:</strong> the answers you type are processed by a third-party AI provider (Anthropic) to extract structured information, such as an estimate of your audience size or your stated goal. From that information we calculate a personalized estimate and derive a lead score and segment, which we use to prioritize and tailor our follow-up. This automated processing does not produce any legal or similarly significant effect on you.</p>
          <p><strong>Consent:</strong> we ask for your consent before asking any questions, and we record that consent along with its source and the time it was given. Consent to Instagram messages, to email, and to SMS are recorded separately. You can stop the conversation at any time, and you can unsubscribe from emails using the link in any message we send.</p>
          <p><strong>Retention:</strong> we retain a record of the conversation so we can continue it and improve our service. The verbatim text of the messages is deleted after 90 days; a minimal record that a message occurred (when, and in which direction) may be kept for analytics. We may retain your Instagram identity and the information derived from the conversation even if you never create a CRWN account.</p>
          <p><strong>Deletion:</strong> to request deletion of the information collected through this conversation, contact privacy@thecrwn.app. Deleting a CRWN account does not automatically delete a separate lead record created this way, so please mention the Instagram conversation in your request.</p>
          <p>ManyChat and Anthropic act as our service providers (processors) for this flow. We do not sell this information.</p>

          <h2 className="text-xl font-semibold text-crwn-text">8. Data Security</h2>
          <p>We use TLS/SSL encryption, access controls, row-level security, hashed passwords, and service role separation. No system is 100% secure.</p>

          <h2 className="text-xl font-semibold text-crwn-text">9. Your Rights</h2>
          <p><strong>All Users:</strong> Access, correction, deletion (contact privacy@thecrwn.app), notification preferences, cookie controls.</p>
          <p><strong>California Residents (CCPA):</strong> Rights to know, delete, opt out of sale (we do not sell data), and non-discrimination.</p>
          <p><strong>European Users (GDPR):</strong> Rights to access, rectify, erase, restrict, port data, withdraw consent, and lodge complaints.</p>

          <h2 className="text-xl font-semibold text-crwn-text">10. Children&apos;s Privacy</h2>
          <p>CRWN is intended only for individuals 18 years of age or older. We do not knowingly collect information from minors.</p>

          <h2 className="text-xl font-semibold text-crwn-text">11. Contact</h2>
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
