'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { HubPage } from '@/components/layout/HubPage';
import { PlatformBilling } from '@/components/onboarding/PlatformBilling';

// The plan-upgrade celebration. Stripe returns to ?upgrade=success, which used to
// land on the dashboard and pop a modal there. The dashboard is Rise Mode now, so
// the celebration moved here with the billing screen it belongs to.
function UpgradeCelebration() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || searchParams.get('upgrade') !== 'success') return null;

  const close = () => {
    setDismissed(true);
    router.replace('/account/billing');
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={close}>
      <div className="neu-modal p-8 text-center max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-5xl mb-4">👑</div>
        <h2 className="text-xl font-bold text-crwn-gold mb-2">Welcome to CRWN!</h2>
        <p className="text-crwn-text-secondary text-sm mb-6">
          Your plan is now active. Time to build your empire.
        </p>
        <button onClick={close} className="neu-button-accent px-8 py-3 rounded-xl font-semibold">
          Let&apos;s Go
        </button>
      </div>
    </div>
  );
}

export default function AccountBillingPage() {
  return (
    <HubPage
      title="Plan and billing"
      subtitle="Your CRWN plan, your platform fee, and your invoices."
      fallback="/studio"
      requireArtist
      artistOnlyMessage="Publish your artist page to pick a plan and see your fee."
    >
      <Suspense fallback={null}>
        <UpgradeCelebration />
      </Suspense>
      <PlatformBilling />
    </HubPage>
  );
}
