import Link from 'next/link';

export const metadata = {
  title: 'Artist Agreement | CRWN',
  description: 'CRWN Artist Agreement',
};

export default function ArtistAgreementPage() {
  return (
    <div className="min-h-screen bg-crwn-bg">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link href="/home" className="text-crwn-gold hover:underline text-sm mb-8 inline-block">
          ← Back to CRWN
        </Link>
        <h1 className="text-3xl font-bold text-crwn-gold mb-2">Artist Agreement</h1>
        <p className="text-crwn-text-secondary mb-8">Effective Date: August 25, 2026</p>

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
              <tr className="border-t border-crwn-elevated"><td className="p-3">Launch</td><td className="p-3">12%</td><td className="p-3">$0</td></tr>
              <tr className="border-t border-crwn-elevated"><td className="p-3">Pro</td><td className="p-3">8%</td><td className="p-3">$49/month</td></tr>
              <tr className="border-t border-crwn-elevated"><td className="p-3">Scale</td><td className="p-3">5%</td><td className="p-3">$199/month</td></tr>
            </tbody>
          </table>
          <p>The platform fee is charged on fan-to-artist transactions (subscriptions and sales). Stripe processing fees (~2.9% + $0.30) are separate and deducted by Stripe before funds reach your account.</p>

          <h2 className="text-xl font-semibold text-crwn-text">5. Platform Plan Billing</h2>
          <p>Paid platform plans (Pro and Scale) are billed through Stripe, monthly or annually, and renew automatically until canceled. Canceling takes effect at the end of the current billing period, at which point your account moves to the Launch plan; no partial refunds are issued for unused time. Plan prices and platform fees may change with at least 30 days notice; continued use after a change takes effect constitutes acceptance. Promotional pricing (for example a partner offer trial) applies only for its stated period and then reverts to standard pricing.</p>

          <h2 className="text-xl font-semibold text-crwn-text">6. Payouts</h2>
          <p>All payouts are processed through Stripe Connect according to Stripe&apos;s standard payout schedule. You are solely responsible for tax obligations. We may issue 1099 forms as required by law.</p>

          <h2 className="text-xl font-semibold text-crwn-text">7. Team Splits</h2>
          <p>Team Splits let you record a revenue-share arrangement with a collaborator. Each Team Split is governed by the in-product Team Split agreement that you and the collaborator both accept when creating it; the accepted version is stored with the deal. A collaborator&apos;s share is funded entirely from your revenue. CRWN is not a party to your arrangement with a collaborator and does not fund any share.</p>

          <h2 className="text-xl font-semibold text-crwn-text">8. Fan Data and Communications</h2>
          <p><strong>What you receive:</strong> For fans who subscribe to you or join your free membership, CRWN shows you their display name, tier, engagement and spend with you, city/state/country, and the email address on their account, so you can recognize and contact your own members. You also keep the contact details of fans you import yourself.</p>
          <p><strong>Your obligations:</strong> You may only import and contact fans who gave you permission to be contacted by you (they joined your list, bought from you, or asked to hear from you), and you confirm this each time you import. Use fan data lawfully and only to operate your own artist business. Do not sell fan data or share it with third parties. Every email you send through CRWN includes an unsubscribe link, and CRWN enforces unsubscribes and suppressions on every send; you may not attempt to contact a fan who has unsubscribed. If you export fan data out of CRWN, you are solely responsible for how you use it, including compliance with applicable privacy and anti-spam law. Abuse of fan communications is grounds for suspension.</p>
          <p>Fan personal data is otherwise managed per our Privacy Policy. You may not extract or scrape fan data except through CRWN-provided features.</p>

          <h2 className="text-xl font-semibold text-crwn-text">9. Content Removal</h2>
          <p><strong>By You:</strong> Remove content anytime. Account deletion removes your profile within 30 days, cancels fan subscriptions, and processes outstanding payouts.</p>
          <p><strong>By CRWN:</strong> We may remove content for Terms violations, valid DMCA notices, confirmed infringement, or fraudulent activity.</p>

          <h2 className="text-xl font-semibold text-crwn-text">10. Disclaimers</h2>
          <p>CRWN is not a record label, publisher, distributor, or manager. We do not guarantee any minimum revenue, subscribers, or exposure, except as expressly stated in a written CRWN offer you have accepted.</p>

          <h2 className="text-xl font-semibold text-crwn-text">11. Contact</h2>
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
