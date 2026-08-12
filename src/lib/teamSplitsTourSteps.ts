import { DriveStep } from 'driver.js';

// Tour for /studio/team (F-13). Boundaries this copy must hold: Team Splits is an ALLOCATION
// over your existing earnings ledger, not a second payout rail; the basis is your net (after
// the platform fee and any referral/clipper commission); accruals are held before they are
// cashable; and a capped deal stops exactly at the cap.
export const teamSplitsTourSteps: DriveStep[] = [
  {
    element: '[data-tour="team-root"]',
    popover: {
      title: 'A split shares what YOU earned, from a source you name',
      description:
        'A deal gives a collaborator a percentage of the revenue from one tier, product, track, session or booking (or, explicitly, everything). It reads your earnings ledger after CRWN’s fee and any referral cut, so nobody can ever be owed more than you actually received.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    popover: {
      title: 'Held first, cashable later',
      description:
        'Accruals sit in a hold window before they clear, and refunds claw back their share automatically. The cap is exact: a capped deal accrues to the cent you agreed and then completes itself.',
      side: 'top',
      align: 'center',
    },
  },
  {
    popover: {
      title: 'Your payouts do not move',
      description:
        'Stripe still pays you on its own schedule. Splits are settled from the ledger when your collaborator cashes out, so adding a deal never delays or reroutes your own money.',
      side: 'top',
      align: 'center',
    },
  },
];
