import Link from 'next/link';
import { PRODUCER_SUBMISSION_AGREEMENT_VERSION } from '@/lib/producer/consent';

export const metadata = {
  title: 'Session Submission Agreement | CRWN',
  description: 'CRWN Session Submission Agreement',
};

// The operative Session Submission Agreement (founder-approved 2026-07-24).
// Conservative model: a submission transfers nothing. Version stamp lives in
// src/lib/producer/consent.ts; bump it there when this text materially changes.
export default function SubmissionAgreementPage() {
  return (
    <div className="min-h-screen bg-crwn-bg">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link href="/home" className="text-crwn-gold hover:underline text-sm mb-8 inline-block">
          ← Back to CRWN
        </Link>
        <h1 className="text-3xl font-bold text-crwn-gold mb-2">Session Submission Agreement</h1>
        <p className="text-crwn-text-secondary mb-1">Version: {PRODUCER_SUBMISSION_AGREEMENT_VERSION}</p>
        <p className="text-crwn-text-secondary mb-8">
          This is a supplement to the CRWN{' '}
          <a href="/terms" className="text-crwn-gold hover:underline">Terms of Service</a>. It applies
          when you send material to an artist&apos;s live session.
        </p>

        <div className="prose prose-invert max-w-none space-y-6 text-crwn-text-secondary">
          <p className="text-crwn-text-secondary text-sm italic">
            This document is a plain-language summary of what happens when you submit material to a
            session. It is not legal advice and is subject to change. Where it is silent, the CRWN
            Terms of Service control. CRWN is operated by JNW Creative Enterprises, Inc.
            (&quot;CRWN,&quot; &quot;we,&quot; &quot;us&quot;).
          </p>

          <h2 className="text-xl font-semibold text-crwn-text">1. What this covers</h2>
          <p>
            An artist may open a live session for submissions. &quot;Submission&quot; means anything
            you send in for that session: a beat, a vocal or stem, a written song idea, lyrics, a
            reference link, or a voice note. This agreement covers what you are agreeing to when you
            send one. It applies each time you submit.
          </p>

          <h2 className="text-xl font-semibold text-crwn-text">2. You keep your rights</h2>
          <p>
            You keep full ownership of your submission. Sending it does not transfer it, and it does
            not give the artist or CRWN a license to release, sell, or commercially use it. If an
            artist wants to use your material in a release, that is a separate agreement made between
            you and the artist. Nothing here creates one.
          </p>

          <h2 className="text-xl font-semibold text-crwn-text">3. Your promises about the material</h2>
          <p>
            You represent that the submission is your own original work, or that you have the rights
            to send it, and that sending it breaks no agreement you are party to. You are responsible
            for clearing any samples, interpolations, or third-party material in it. You agree to
            indemnify CRWN and the artist against claims arising from your submission.
          </p>

          <h2 className="text-xl font-semibold text-crwn-text">4. No guarantee of use, credit, or payment</h2>
          <p>
            Submitting does not entitle you to anything. The artist is under no obligation to open,
            review, respond to, use, credit, or pay for your submission, and keeps full creative
            control over their work. If the artist chooses to credit or pay you, that is entirely up
            to them and, again, a separate agreement.
          </p>

          <h2 className="text-xl font-semibold text-crwn-text">5. Your submission may be played on the stream</h2>
          <p>
            You understand and agree that the artist may play, display, and discuss your submission
            during the live session, and that the session may be recorded and made available as a
            replay. You grant CRWN and the artist permission to do this solely to operate the session
            and its replay. This permission is limited to running the session feature and does not let
            anyone release or sell your material.
          </p>

          <h2 className="text-xl font-semibold text-crwn-text">6. Confidentiality of unreleased music</h2>
          <p>
            A session may include unreleased music and works in progress. You agree not to record,
            copy, repost, or share anything you hear or see in the session outside of it. What happens
            in the room stays in the room.
          </p>

          <h2 className="text-xl font-semibold text-crwn-text">7. Prohibited content</h2>
          <p>
            Do not submit anything that infringes someone else&apos;s rights, that you do not have the
            right to send, or that violates the CRWN Terms of Service or Community Guidelines. We may
            remove any submission and may report or act on unlawful content.
          </p>

          <h2 className="text-xl font-semibold text-crwn-text">8. Age</h2>
          <p>You must be at least 18 years old to submit.</p>

          <h2 className="text-xl font-semibold text-crwn-text">9. Removing a submission</h2>
          <p>
            You can ask us to remove a submission by emailing support@thecrwn.app. We will remove the
            stored file from the session. We cannot undo anything an artist already did with it under
            a separate agreement, if any.
          </p>

          <h2 className="text-xl font-semibold text-crwn-text">10. Not legal advice; subject to change</h2>
          <p>
            This agreement is provided for convenience and is not legal advice. We may update it, and
            the version in effect when you submit is the version that applies. Continued use of
            session submissions after an update means you accept the updated agreement.
          </p>

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
