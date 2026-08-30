'use client';

// Fan Automations: turn comments on your posts into fans on your list, automatically.
// Hub-only destination (indexed in AccountHub's Grow group, not a Studio tile: the
// five-tile Studio grid is a standing founder decision).

import { HubPage } from '@/components/layout/HubPage';
import { FanAutomationsHome } from '@/components/artist/automations/FanAutomationsHome';

export default function FanAutomationsPage() {
  return (
    <HubPage
      title="Fan Automations"
      subtitle="A fan comments. CRWN DMs your drop, captures the email, and makes the offer."
      requireArtist
      artistOnlyMessage="Publish your artist page and CRWN can start turning your comments into members."
    >
      {(ctx) => <FanAutomationsHome ctx={ctx} />}
    </HubPage>
  );
}
