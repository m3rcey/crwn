import Link from 'next/link';

export const metadata = {
  title: 'Artist Agreement | CRWN',
  description: 'CRWN Artist Agreement',
};

export default function ArtistAgreementPage() {
  return (
    <div className="min-h-screen bg-crwn-bg">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link href="/" className="text-crwn-gold hover:underline text-sm mb-8 inline-block">
          ← Back to CRWN
        </Link>
        <h1 className="text-3xl font-bold text-crwn-gold mb-2">Artist Agreement</h1>
        <p className="text-crwn-text-secondary mb-8">Effective Date: March 10, 2026</p>

        <div className="prose prose-invert max-w-none space-y-6 text-crwn-text-secondary">
          <h2 className="text-xl font-semibold text-crwn-text">1. Overview</h2>
          <p>This Artist Agreement supplements the CRWN Terms of Service. By completing artist onboarding and connecting your Stripe account, you agree to be bound by this Agreement.</p>

          <h2 className="text-xl font-semibold text-crwn-text">2. Eligibility</h2>
          <p>You must be at least 18 years of age, provide accurate legal and tax information through Stripe, and have the legal right to distribute all content you upload.</p>

          <h2 className="text-xl font-semibold text-crwn-text">3. Content Rights and Licensing</h2>
          <p><strong>Ownership:</strong> You retain full ownership of all content you upload to CRWN.</p>
          <p><strong>License:</strong> You grant CRWN a non-exclusive, worldwide, royalty-free license to host, stream, display, and promote your content on the Platform. This license terminates within 30 days of content removal, except for content purchased by fans.</p>
          <p><strong>Warranties:</strong> You represent that you own or have all necessary rights, licenses, and clearances for your content, including mechanical licenses, sync rights, and sample clearances. You agree to indemnify CRWN against claims arising from your content.</p>

          <h2 className="text-xl font-semibold text-crwn-text">4. Monetization and Fees</h2>
          <table className="w-full text-sm border border-crwn-elevated rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-crwn-surface">
                <th className="text-left p-3 text-crwn-gold font-semibold">Artist Tier</th>
                <th className="text-left p-3 text-crwn-gold font-semibold">Platform Fee</th>
                <th className="text-left p-3 text-crwn-gold font-semibold">Monthly Cost</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-crwn-elevated"><td className="p-3">Starter</td><td className="p-3">8%</td><td className="p-3">Free</td></tr>
              <tr className="border-t border-crwn-elevated"><td className="p-3">Pro</td><td className="p-3">8%</td><td className="p-3">$49/month</td></tr>
              <tr className="border-t border-crwn-elevated"><td className="p-3">Label</td><td className="p-3">6%</td><td className="p-3">$149/month</td></tr>
              <tr className="border-t border-crwn-elevated"><td className="p-3">Founding Artist</td><td className="p-3">5%</td><td className="p-3">Free (1 year)</td></tr>
            </tbody>
          </table>
          <p>Stripe processing fees (~2.9% + $0.30) are separate and deducted by Stripe before funds reach your account.</p>

          <h2 className="text-xl font-semibold text-crwn-text">5. Payouts</h2>
          <p>All payouts are processed through Stripe Connect according to Stripe&apos;s standard payout schedule. You are solely responsible for tax obligations. We may issue 1099 forms as required by law.</p>

          <h2 className="text-xl font-semibold text-crwn-text">6. Fan Data</h2>
          <p>You receive aggregate analytics about your audience. Fan personal data is owned by the fan and managed per our Privacy Policy. You may not extract or scrape individual fan data except through CRWN-provided features.</p>

          <h2 className="text-xl font-semibold text-crwn-text">7. Content Removal</h2>
          <p><strong>By You:</strong> Remove content anytime. Account deletion removes your profile within 30 days, cancels fan subscriptions, and processes outstanding payouts.</p>
          <p><strong>By CRWN:</strong> We may remove content for Terms violations, valid DMCA notices, confirmed infringement, or fraudulent activity.</p>

          <h2 className="text-xl font-semibold text-crwn-text">8. Disclaimers</h2>
          <p>CRWN is not a record label, publisher, distributor, or manager. We do not guarantee any minimum revenue, subscribers, or exposure.</p>

          <h2 className="text-xl font-semibold text-crwn-text">9. Contact</h2>
          <p><strong>Support:</strong> support@thecrwn.app</p>
          <p><strong>DMCA:</strong> dmca@thecrwn.app</p>
        </div>

        <div className="mt-12 pt-6 border-t border-crwn-elevated text-center text-xs text-crwn-text-secondary">
          JNW Creative Enterprises, Inc. © 2026. All rights reserved.
        </div>
      </div>
    </div>
  );
}
