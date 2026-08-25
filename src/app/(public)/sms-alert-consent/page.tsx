import Link from 'next/link';
import { AlertConsentForm } from '@/components/sms/AlertConsentForm';
import {
  ALERT_CONSENT_BRAND,
  ALERT_CONSENT_PROGRAM,
  ALERT_CONSENT_PURPOSE,
} from '@/lib/sms/alertConsent';

export const metadata = {
  title: 'Internal SMS Alert Consent | CRWN',
  description:
    'Consent form for authorized personnel of JNW Creative Enterprises, Inc. to receive internal CRWN operational lead alerts by SMS.',
};

// PUBLIC and unauthenticated on purpose. Twilio asked to SEE the opt-in experience rather than
// accept a description of a paper form, and a reviewer has no CRWN account. Middleware guards an
// explicit allowlist of paths and this is not one of them, so it is reachable anonymously.
//
// Written for a compliance reviewer first: who sends, who receives, what is sent, how often, what
// it costs, and how to stop. No marketing copy, no navigation into the funnel, no signup.
export default function SmsAlertConsentPage() {
  return (
    <div className="min-h-screen bg-crwn-bg">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <p className="text-xs uppercase tracking-widest text-crwn-text-secondary mb-2">
          {ALERT_CONSENT_BRAND}
        </p>
        <h1 className="text-3xl font-bold text-crwn-gold mb-2">Internal SMS Alert Consent</h1>
        <p className="text-crwn-text-secondary mb-8">
          For authorized personnel only. Effective Date: August 25, 2026
        </p>

        <div className="space-y-6 text-crwn-text-secondary leading-relaxed">
          <p>{ALERT_CONSENT_PURPOSE}</p>

          <div className="rounded-2xl bg-crwn-surface border border-crwn-elevated p-5 space-y-3">
            <h2 className="text-lg font-semibold text-crwn-text">What you are opting into</h2>
            <p className="text-sm">{ALERT_CONSENT_PROGRAM}</p>
            <dl className="text-sm space-y-2 pt-1">
              <div>
                <dt className="inline font-semibold text-crwn-text">Sender: </dt>
                <dd className="inline">
                  JNW Creative Enterprises, Inc., operating the CRWN platform (thecrwn.app).
                </dd>
              </div>
              <div>
                <dt className="inline font-semibold text-crwn-text">Recipients: </dt>
                <dd className="inline">
                  Authorized personnel of JNW Creative Enterprises, Inc. only. Artists, fans,
                  prospects, and customers are not recipients of this program.
                </dd>
              </div>
              <div>
                <dt className="inline font-semibold text-crwn-text">Message type: </dt>
                <dd className="inline">
                  Internal operational lead alerts. No marketing, no promotions.
                </dd>
              </div>
              <div>
                <dt className="inline font-semibold text-crwn-text">Message frequency: </dt>
                <dd className="inline">
                  Message frequency varies. This is a low volume program.
                </dd>
              </div>
              <div>
                <dt className="inline font-semibold text-crwn-text">Cost: </dt>
                <dd className="inline">Message and data rates may apply.</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-crwn-text">Opting out: </dt>
                <dd className="inline">
                  Reply STOP to any message to stop receiving them. Reply HELP for help.
                </dd>
              </div>
            </dl>
          </div>

          <AlertConsentForm />

          <p className="text-xs">
            We do not share, sell, or provide your mobile phone number or messaging consent data to
            third parties or affiliates for marketing or promotional purposes. Full detail is in
            section 8 of our{' '}
            <Link href="/privacy" className="text-crwn-gold hover:underline">
              Privacy Policy
            </Link>{' '}
            and section 13 of our{' '}
            <Link href="/terms" className="text-crwn-gold hover:underline">
              Terms of Service
            </Link>
            .
          </p>

          <p className="text-xs">
            Questions about this form: <span className="text-crwn-text">support@thecrwn.app</span>
          </p>
        </div>

        <div className="mt-12 pt-6 border-t border-crwn-elevated text-center text-xs text-crwn-text-secondary">
          JNW Creative Enterprises, Inc. © 2026. All rights reserved.
        </div>
      </div>
    </div>
  );
}
