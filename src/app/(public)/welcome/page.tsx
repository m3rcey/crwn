import { redirect } from 'next/navigation';

// The /welcome onboarding screen was retired on 2026-07-30: signup now lands
// straight in the setup wizard, whose first screens (name + link) do what this
// page did, saved through /api/onboarding/identity. The route stays as a
// redirect because links to thecrwn.app/welcome are already sitting in sent
// onboarding-reminder emails.
export default function WelcomeRedirect() {
  redirect('/setup');
}
