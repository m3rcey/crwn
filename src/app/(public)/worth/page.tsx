import { WorthExperience } from './WorthExperience';
import { shareMetadata } from '@/lib/shareMetadata';

// /worth — the clean, nav-less calculator used for cold outreach and prefilled links.
export const metadata = shareMetadata({
  title: 'What your fanbase is worth',
  description: 'Answer a few questions and see the money your current audience is already worth.',
  path: '/worth',
});

export default function WorthPage() {
  return <WorthExperience />;
}
