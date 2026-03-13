import Link from 'next/link';

export const metadata = {
  title: 'DMCA Policy | CRWN',
  description: 'CRWN DMCA Takedown Policy',
};

export default function DMCAPage() {
  return (
    <div className="min-h-screen bg-crwn-bg">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link href="/home" className="text-crwn-gold hover:underline text-sm mb-8 inline-block">
          ← Back to CRWN
        </Link>
        <h1 className="text-3xl font-bold text-crwn-gold mb-2">DMCA Takedown Policy</h1>
        <p className="text-crwn-text-secondary mb-8">Effective Date: March 10, 2026</p>

        <div className="prose prose-invert max-w-none space-y-6 text-crwn-text-secondary">
          <h2 className="text-xl font-semibold text-crwn-text">Reporting Copyright Infringement</h2>
          <p>CRWN respects the intellectual property rights of others. If you believe that content on CRWN infringes your copyright, you may submit a DMCA takedown notice to our designated agent.</p>

          <h2 className="text-xl font-semibold text-crwn-text">DMCA Designated Agent</h2>
          <p><strong>Email:</strong> dmca@thecrwn.app</p>
          <p><strong>Entity:</strong> JNW Creative Enterprises, Inc.</p>

          <h2 className="text-xl font-semibold text-crwn-text">Required Information</h2>
          <p>Your DMCA notice must include:</p>
          <p>1. A physical or electronic signature of the copyright owner or authorized agent.</p>
          <p>2. Identification of the copyrighted work claimed to be infringed.</p>
          <p>3. Identification of the material on CRWN that is claimed to be infringing, with enough detail for us to locate it.</p>
          <p>4. Your contact information (name, address, phone number, email).</p>
          <p>5. A statement that you have a good faith belief that the use of the material is not authorized by the copyright owner, its agent, or the law.</p>
          <p>6. A statement, under penalty of perjury, that the information in the notice is accurate and that you are authorized to act on behalf of the copyright owner.</p>

          <h2 className="text-xl font-semibold text-crwn-text">Counter-Notification</h2>
          <p>If you believe your content was removed by mistake or misidentification, you may submit a counter-notification to dmca@thecrwn.app with: your physical or electronic signature, identification of the removed material, a statement under penalty of perjury that you believe the material was removed by mistake, and your consent to the jurisdiction of federal court in Missouri.</p>

          <h2 className="text-xl font-semibold text-crwn-text">Repeat Infringers</h2>
          <p>CRWN will terminate the accounts of users who are repeat copyright infringers.</p>
        </div>

        <div className="mt-12 pt-6 border-t border-crwn-elevated text-center text-xs text-crwn-text-secondary">
          JNW Creative Enterprises, Inc. © 2026. All rights reserved.
        </div>
      </div>
    </div>
  );
}
