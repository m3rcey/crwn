import type { Metadata } from 'next';
import { LeadMagnetDirectory } from '@/components/lead-magnets/LeadMagnetDirectory';

export const metadata: Metadata = {
  title: 'Free Tools for Independent Artists | CRWN',
  description: 'Free planning tools for independent artists. Build a Vault plan, a demand test, a fan mission, or a clip-to-earn campaign, then bring it into CRWN.',
  openGraph: {
    title: 'Free Tools for Independent Artists | CRWN',
    description: 'Plan your next move with free CRWN artist tools.',
    siteName: 'CRWN',
  },
};

export default function ToolsDirectoryPage() {
  return <LeadMagnetDirectory basePath="/tools" context="public" />;
}
