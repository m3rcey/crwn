import Link from 'next/link';

export const metadata = {
  title: 'Partner Program Terms | CRWN',
  description: 'CRWN Partner Program Terms',
};

// The terms behind the /partner and /recruit promises. Deliberately carries NO commission
// numbers: rates live on the partner page and in the payout code, and a duplicated rate map
// has already caused a real overpay once. This page defines the rules; the page you saw when
// your referral qualified defines the rate.
export default function PartnerTermsPage() {
  return (
    <div className="min-h-screen bg-crwn-bg">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link href="/home" className="text-crwn-gold hover:underline text-sm mb-8 inline-block">
          ← Back to CRWN
        </Link>
        <h1 className="text-3xl font-bold text-crwn-gold mb-2">Partner Program Terms</h1>
        <p className="text-crwn-text-secondary mb-8">Effective Date: August 25, 2026</p>

        <div className="prose prose-invert max-w-none space-y-6 text-crwn-text-secondary">
          <h2 className="text-xl font-semibold text-crwn-text">1. The Program</h2>
          <p>The CRWN Partner Program (&quot;Program&quot;) is operated by JNW Creative Enterprises, Inc. (&quot;CRWN,&quot; &quot;we,&quot; &quot;us&quot;). These terms apply whenever you share a CRWN partner or recruiter link for compensation. They supplement the CRWN <Link href="/terms" className="text-crwn-gold hover:underline">Terms of Service</Link>, which also apply.</p>

          <h2 className="text-xl font-semibold text-crwn-text">2. Eligibility</h2>
          <p>You must be at least 18 years old, hold a CRWN account in good standing, and be legally able to receive payments through Stripe. Participating in the Program constitutes acceptance of these terms.</p>

          <h2 className="text-xl font-semibold text-crwn-text">3. How a Referral Qualifies</h2>
          <p>A referral is attributed when an artist signs up through your unique partner link. One referrer per artist: the first qualifying link wins, and attribution cannot be reassigned. A referral qualifies for compensation when the referred artist joins a paid CRWN plan and remains an active paying subscriber through the qualifying period stated on the partner page (currently 30 days).</p>
          <p>Referrals of yourself, of accounts you own or control, or of artists who already have a CRWN account do not qualify.</p>

          <h2 className="text-xl font-semibold text-crwn-text">4. Compensation</h2>
          <p>Compensation rates (flat fees per qualified artist, and any percentage of a referred artist&apos;s CRWN revenue for a stated period) are the rates displayed on the partner page at the time your referral qualifies. We may change rates prospectively at any time; a change does not affect referrals that have already qualified. Compensation is calculated by CRWN from its own records, which are authoritative.</p>

          <h2 className="text-xl font-semibold text-crwn-text">5. Payouts</h2>
          <p>Payouts are made through Stripe and require a connected Stripe account, including completing Stripe&apos;s identity verification. You are responsible for any taxes on amounts you receive; we may require tax information and may issue tax forms where the law requires. We may hold, adjust, or reverse compensation to reflect refunds, chargebacks, canceled subscriptions, or suspected fraud.</p>

          <h2 className="text-xl font-semibold text-crwn-text">6. Promotion Rules</h2>
          <p>If you promote CRWN in content (video, posts, streams, messages), you must clearly disclose your material connection to CRWN as required by the FTC&apos;s endorsement guides (for example, &quot;I earn a commission if you join through my link&quot;). You must not: send spam or unsolicited bulk messages; make income guarantees or misleading claims about CRWN or about what artists earn; bid on CRWN trademarks in paid search; or represent yourself as CRWN or as our employee or agent.</p>

          <h2 className="text-xl font-semibold text-crwn-text">7. Fraud</h2>
          <p>Compensation generated through fraud, misrepresentation, self-referral, incentivized fake signups, or artificial activity is void and may be reversed, and we may remove you from the Program and suspend the accounts involved.</p>

          <h2 className="text-xl font-semibold text-crwn-text">8. Term and Termination</h2>
          <p>Either you or CRWN may end your participation at any time. On termination, compensation already earned under these terms remains payable through the normal payout process unless it was obtained through fraud. Pending referrals that have not yet qualified at termination do not qualify afterward.</p>

          <h2 className="text-xl font-semibold text-crwn-text">9. Independent Contractor</h2>
          <p>You participate as an independent contractor. Nothing in the Program creates an employment, agency, joint venture, or partnership relationship between you and JNW Creative Enterprises, Inc.</p>

          <h2 className="text-xl font-semibold text-crwn-text">10. Changes</h2>
          <p>We may update these terms from time to time. The version in effect when a referral qualifies is the version that applies to that referral. Continued participation after an update constitutes acceptance.</p>

          <h2 className="text-xl font-semibold text-crwn-text">11. Contact</h2>
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
