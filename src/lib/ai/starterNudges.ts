import { ArtistDataForAI } from './collectArtistData';
import { AiInsightType, AiInsightPriority } from '@/types';

export interface InsightInput {
  type: AiInsightType;
  priority: AiInsightPriority;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  action_type?: string | null;
  action_url?: string | null;
}

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

export function generateStarterNudges(data: ArtistDataForAI): InsightInput[] {
  const nudges: InsightInput[] = [];
  const now = Date.now();

  // No tracks uploaded yet
  if (data.plays.total === 0 && data.plays.topTracks.length === 0) {
    nudges.push({
      type: 'content_nudge',
      priority: 'normal',
      title: 'Upload your first track',
      body: 'Your fans are waiting. Upload a track to start building your audience and earning revenue.',
      action_type: 'link',
      action_url: '/profile/artist?tab=tracks',
    });
  }

  // No community posts in 14+ days
  if (data.community.lastPostDate) {
    const daysSincePost = now - new Date(data.community.lastPostDate).getTime();
    if (daysSincePost >= FOURTEEN_DAYS_MS) {
      const days = Math.floor(daysSincePost / (24 * 60 * 60 * 1000));
      nudges.push({
        type: 'content_nudge',
        priority: 'normal',
        title: `You haven't posted in ${days} days`,
        body: 'Keep your fans engaged with regular updates. Even a quick behind-the-scenes photo can boost engagement.',
        action_type: 'link',
        action_url: '/community',
      });
    }
  } else if (data.subscribers.active > 0) {
    // Has subscribers but never posted
    nudges.push({
      type: 'content_nudge',
      priority: 'normal',
      title: 'Post to your community',
      body: `You have ${data.subscribers.active} subscriber${data.subscribers.active === 1 ? '' : 's'} waiting to hear from you. Start a conversation in your community.`,
      action_type: 'link',
      action_url: '/community',
    });
  }

  // Revenue spike
  if (data.revenue.thisWeek > 0 && data.revenue.lastWeek === 0) {
    nudges.push({
      type: 'revenue',
      priority: 'normal',
      title: 'You earned revenue this week!',
      body: `You made $${(data.revenue.thisWeek / 100).toFixed(2)} this week. Keep the momentum going by posting new content and engaging with your fans.`,
      data: { amount: data.revenue.thisWeek },
    });
  }

  // Products expiring soon
  data.products.expiringWithin7Days.forEach(product => {
    nudges.push({
      type: 'booking_reminder',
      priority: 'high',
      title: `"${product.title}" expires soon`,
      body: `Your product expires on ${new Date(product.expiresAt).toLocaleDateString()}. Consider promoting it to fill remaining spots.`,
      action_type: 'link',
      action_url: '/profile/artist?tab=shop',
      data: { expiresAt: product.expiresAt },
    });
  });

  // No activity at all — don't spam, just one nudge
  if (!data.hasActivity && nudges.length === 0) {
    nudges.push({
      type: 'content_nudge',
      priority: 'low',
      title: 'Get started on CRWN',
      body: 'Upload tracks, set up subscription tiers, and start earning. Your AI Manager will have more insights once you have activity.',
      action_type: 'link',
      action_url: '/profile/artist?tab=tracks',
    });
  }

  // Cap at 3 nudges max for Starter tier
  return nudges.slice(0, 3);
}
