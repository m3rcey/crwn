import Link from 'next/link';
import { LIVE_AGREEMENT_VERSION } from '@/lib/liveAgreement';

export const metadata = {
  title: 'Live-Streaming Agreement | CRWN',
  description: 'CRWN Live-Streaming Agreement',
};

export default function LiveAgreementPage() {
  return (
    <div className="min-h-screen bg-crwn-bg">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link href="/home" className="text-crwn-gold hover:underline text-sm mb-8 inline-block">
          ← Back to CRWN
        </Link>
        <h1 className="text-3xl font-bold text-crwn-gold mb-2">Live-Streaming Agreement</h1>
        <p className="text-crwn-text-secondary mb-1">Version: {LIVE_AGREEMENT_VERSION}</p>
        <p className="text-crwn-text-secondary mb-8">
          This is a supplement to the CRWN{' '}
          <a href="/terms" className="text-crwn-gold hover:underline">Terms of Service</a> and{' '}
          <a href="/artist-agreement" className="text-crwn-gold hover:underline">Artist Agreement</a>.
        </p>

        <div className="prose prose-invert max-w-none space-y-6 text-crwn-text-secondary">
          <p className="text-crwn-text-secondary text-sm italic">
            This document is a plain-language summary of the incremental obligations that live
            broadcasting introduces. It is not legal advice and is subject to change. Where it is
            silent, the CRWN Terms of Service and Artist Agreement control.
          </p>

          <h2 className="text-xl font-semibold text-crwn-text">1. Scope</h2>
          <p>
            This Live-Streaming Agreement (&quot;Live Agreement&quot;) supplements, and does not
            replace, the CRWN Terms of Service and the CRWN Artist Agreement. It applies only when
            you start, host, or broadcast a live session on CRWN. In the event of a direct conflict
            about live broadcasting specifically, this Live Agreement controls; on all other matters
            the Terms of Service and Artist Agreement control. CRWN is operated by JNW Creative
            Enterprises, Inc. (&quot;CRWN,&quot; &quot;we,&quot; &quot;us&quot;).
          </p>

          <h2 className="text-xl font-semibold text-crwn-text">2. Rights Warranty</h2>
          <p>
            You represent and warrant that you own or control everything you broadcast during a live
            session, including any masters, sound recordings, compositions, publishing, samples,
            beats, visuals, and other content shown or played on screen or over audio. You further
            represent that broadcasting this content on CRWN breaches no agreement you are party to,
            including any recording, distribution, publishing, management, or exclusivity deal.
          </p>

          <h2 className="text-xl font-semibold text-crwn-text">3. Indemnification</h2>
          <p>
            You agree to defend, indemnify, and hold harmless CRWN and JNW Creative Enterprises,
            Inc., its officers, and its agents from and against any claims, damages, liabilities,
            losses, and expenses (including reasonable attorneys&apos; fees) arising out of or
            related to the content you broadcast, your live sessions, or your breach of this Live
            Agreement. This supplements, and does not limit, the indemnification obligations in the
            Artist Agreement.
          </p>

          <h2 className="text-xl font-semibold text-crwn-text">4. Content Standards</h2>
          <p>During a live session you agree not to:</p>
          <p>• play or broadcast third-party master recordings you do not own or control;</p>
          <p>• use uncleared samples or interpolations;</p>
          <p>
            • stream audio sourced from digital streaming platforms (e.g. Spotify, Apple Music,
            YouTube) or other services whose terms prohibit rebroadcast; or
          </p>
          <p>• broadcast any content that violates the CRWN Terms of Service or Community Guidelines.</p>
          <p>
            If you bring guests into a live session, you are responsible for obtaining their consent
            to appear and to be recorded before they join, and you warrant that you have done so.
          </p>

          <h2 className="text-xl font-semibold text-crwn-text">5. Recording &amp; VOD Consent</h2>
          <p>
            You understand and agree that your live sessions are recorded and that the recording is
            stored as a downloadable video-on-demand (&quot;VOD&quot;). You retain full ownership of
            your live sessions and their recordings. Solely to operate the feature, you grant CRWN a
            non-exclusive, worldwide, royalty-free license to record, host, store, process, and
            display the VOD on the Platform, and to make it available to you for download and to fans
            in accordance with the access settings you choose. This license is limited to operating
            the live and VOD features and mirrors the content license in the Terms of Service and
            Artist Agreement; it terminates on the same terms.
          </p>

          <h2 className="text-xl font-semibold text-crwn-text">6. DMCA / Takedown Acknowledgment</h2>
          <p>
            Live and recorded content is subject to the CRWN{' '}
            <a href="/dmca" className="text-crwn-gold hover:underline">DMCA Takedown Policy</a>. If we
            receive a valid infringement notice concerning your live session or VOD, we may remove or
            disable access to it and process it under that policy, including counter-notification and
            our repeat-infringer procedures. You acknowledge that a copyright owner may send a
            takedown notice about your broadcast and that the takedown process described in the DMCA
            Policy will apply.
          </p>

          <h2 className="text-xl font-semibold text-crwn-text">7. Enforcement</h2>
          <p>
            We may, at our discretion and without prior notice, end an in-progress live session,
            remove or disable a VOD, and suspend or terminate your access to live broadcasting or to
            CRWN entirely, where we reasonably believe you have breached this Live Agreement, the
            Terms of Service, or the Artist Agreement, or where required to respond to a legal claim.
          </p>

          <h2 className="text-xl font-semibold text-crwn-text">8. Not Legal Advice; Subject to Change</h2>
          <p>
            This Live Agreement is provided for convenience and is not legal advice. We may update it
            from time to time; the version in effect when you go live is the version that applies. A
            new version will re-prompt you for acceptance before your next live session. Your
            continued use of live broadcasting after an update constitutes acceptance of the updated
            Live Agreement.
          </p>

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
