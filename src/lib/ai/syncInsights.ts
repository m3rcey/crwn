import { ArtistDataForAI } from './collectArtistData';
import { InsightInput } from './starterNudges';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function formatPrice(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function generateSyncInsights(data: ArtistDataForAI): InsightInput[] {
  const insights: InsightInput[] = [];
  const now = Date.now();

  const { genreMatches, locationMatches } = data.syncOpportunities;

  // Urgent: genre-matched opps with deadline in 3 days or less
  const urgentOpps = genreMatches.filter(opp => {
    if (!opp.deadline) return false;
    const timeLeft = new Date(opp.deadline).getTime() - now;
    return timeLeft > 0 && timeLeft <= THREE_DAYS_MS;
  });

  for (const opp of urgentOpps.slice(0, 2)) {
    const daysLeft = Math.ceil((new Date(opp.deadline!).getTime() - now) / (24 * 60 * 60 * 1000));
    const priceRange = opp.priceMax > 0
      ? ` — pays ${formatPrice(opp.priceMin)}-${formatPrice(opp.priceMax)}`
      : '';

    insights.push({
      type: 'sync_match',
      priority: 'urgent',
      title: `Sync deadline in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}: "${opp.title}"`,
      body: `This ${opp.type} matches your genre and closes soon${priceRange}. These fill up fast — submit now before it's gone.`,
      data: { syncId: opp.id, deadline: opp.deadline },
      action_type: 'link',
      action_url: '/profile/artist?tab=sync',
    });
  }

  // High: genre-matched opps with deadline within 7 days
  if (insights.length === 0) {
    const soonOpps = genreMatches.filter(opp => {
      if (!opp.deadline) return false;
      const timeLeft = new Date(opp.deadline).getTime() - now;
      return timeLeft > THREE_DAYS_MS && timeLeft <= SEVEN_DAYS_MS;
    });

    for (const opp of soonOpps.slice(0, 1)) {
      const daysLeft = Math.ceil((new Date(opp.deadline!).getTime() - now) / (24 * 60 * 60 * 1000));
      const priceRange = opp.priceMax > 0
        ? ` — pays ${formatPrice(opp.priceMin)}-${formatPrice(opp.priceMax)}`
        : '';

      insights.push({
        type: 'sync_match',
        priority: 'high',
        title: `Sync opportunity closing in ${daysLeft} days`,
        body: `"${opp.title}" matches your genre${priceRange}. Don't miss out.`,
        data: { syncId: opp.id, deadline: opp.deadline },
        action_type: 'link',
        action_url: '/profile/artist?tab=sync',
      });
    }
  }

  // Normal: new genre matches available (no specific deadline urgency)
  if (insights.length === 0 && genreMatches.length > 0) {
    const count = genreMatches.length;
    const topOpp = genreMatches[0];
    const priceRange = topOpp.priceMax > 0
      ? ` Top one pays ${formatPrice(topOpp.priceMin)}-${formatPrice(topOpp.priceMax)}.`
      : '';

    insights.push({
      type: 'sync_match',
      priority: 'normal',
      title: `${count} sync opportunit${count === 1 ? 'y' : 'ies'} match your genre`,
      body: `"${topOpp.title}" and ${count > 1 ? `${count - 1} more` : 'others'} are looking for your sound.${priceRange} Check them out before they fill up.`,
      data: { count, topSyncId: topOpp.id },
      action_type: 'link',
      action_url: '/profile/artist?tab=sync',
    });
  }

  return insights;
}
