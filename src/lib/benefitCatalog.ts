export type BenefitType =
  | 'exclusive_tracks'
  | 'exclusive_albums'
  | 'exclusive_posts'
  | 'early_access'
  | 'community_badge'
  | 'shop_discount'
  | 'supporter_wall'
  | 'priority_replies'
  | 'direct_messaging'
  | 'one_on_one_call'
  | 'group_live_qa'
  | 'custom_song_request'
  | 'custom_experience'
  | 'monthly_merch'
  | 'credits_on_releases'
  | 'shoutout';

export interface BenefitDefinition {
  type: BenefitType;
  label: string;
  description: string;
  icon: string;
  category: 'music' | 'community' | 'shop' | 'experiences' | 'recognition';
  available: boolean;
  configFields?: ConfigField[];
}

export interface ConfigField {
  key: string;
  label: string;
  type: 'select' | 'number' | 'text';
  options?: { value: string | number; label: string }[];
  min?: number;
  max?: number;
  maxLength?: number;
  default: string | number;
}

export const BENEFIT_CATALOG: BenefitDefinition[] = [
  // --- MUSIC ACCESS ---
  {
    type: 'exclusive_tracks',
    label: 'Exclusive Tracks',
    description: 'Subscribers get access to tier-gated tracks',
    icon: '🎵',
    category: 'music',
    available: true,
  },
  {
    type: 'exclusive_albums',
    label: 'Exclusive Albums',
    description: 'Subscribers get access to tier-gated albums',
    icon: '💿',
    category: 'music',
    available: true,
  },
  {
    type: 'early_access',
    label: 'Early Access to New Music',
    description: 'Subscribers hear new releases before everyone else',
    icon: '⏰',
    category: 'music',
    available: true,
    configFields: [
      {
        key: 'days_early',
        label: 'How many days early?',
        type: 'select',
        options: [
          { value: 1, label: '1 day' },
          { value: 3, label: '3 days' },
          { value: 7, label: '1 week' },
          { value: 14, label: '2 weeks' },
        ],
        default: 7,
      },
    ],
  },

  // --- COMMUNITY ---
  {
    type: 'exclusive_posts',
    label: 'Exclusive Community Posts',
    description: 'Access to tier-gated posts, photos, and videos',
    icon: '💬',
    category: 'community',
    available: true,
  },
  {
    type: 'community_badge',
    label: 'Community Badge',
    description: 'Custom badge next to their name in your community',
    icon: '🏅',
    category: 'community',
    available: true,
    configFields: [
      {
        key: 'badge_text',
        label: 'Badge text',
        type: 'text',
        maxLength: 20,
        default: '',
      },
    ],
  },
  {
    type: 'priority_replies',
    label: 'Priority Replies',
    description: 'Their comments are highlighted in your community',
    icon: '⭐',
    category: 'community',
    available: false,
  },
  {
    type: 'direct_messaging',
    label: 'Direct Messages',
    description: 'Subscribers on this tier can message you 1-on-1, and you can reply',
    icon: '✉️',
    category: 'community',
    available: true,
  },

  // --- SHOP ---
  {
    type: 'shop_discount',
    label: 'Shop Discount',
    description: 'Automatic discount on all shop purchases',
    icon: '🏷️',
    category: 'shop',
    available: true,
    configFields: [
      {
        key: 'discount_percent',
        label: 'Discount %',
        type: 'number',
        min: 5,
        max: 50,
        default: 10,
      },
    ],
  },

  // --- RECOGNITION ---
  {
    type: 'supporter_wall',
    label: 'Name on Supporter Wall',
    description: 'Fan name displayed on your artist profile',
    icon: '🏆',
    category: 'recognition',
    available: true,
  },

  // --- EXPERIENCES ---
  // Tier perks describing what the fan gets. Fulfillment (scheduling the call,
  // running the Q&A, delivering the song/experience) is handled by the artist,
  // optionally via the Bookings tab.
  {
    type: 'one_on_one_call',
    label: '1-on-1 Video Call',
    description: 'Private video call with the artist',
    icon: '📹',
    category: 'experiences',
    available: true,
    configFields: [
      {
        key: 'frequency',
        label: 'How often?',
        type: 'select',
        options: [
          { value: 'monthly', label: 'Monthly' },
          { value: 'quarterly', label: 'Quarterly' },
          { value: 'one_time', label: 'One-time' },
        ],
        default: 'monthly',
      },
    ],
  },
  {
    type: 'group_live_qa',
    label: 'Group Live Q&A Access',
    description: 'Join exclusive live Q&A sessions',
    icon: '🎤',
    category: 'experiences',
    available: true,
    configFields: [
      {
        key: 'frequency',
        label: 'How often?',
        type: 'select',
        options: [
          { value: 'weekly', label: 'Weekly' },
          { value: 'monthly', label: 'Monthly' },
          { value: 'quarterly', label: 'Quarterly' },
        ],
        default: 'monthly',
      },
    ],
  },
  {
    type: 'custom_song_request',
    label: 'Custom Song Request',
    description: 'Request a personalized song from the artist',
    icon: '🎶',
    category: 'experiences',
    available: true,
  },
  {
    type: 'custom_experience',
    label: 'Custom Experience',
    description: 'Define your own perk or experience for this tier (you fulfill it)',
    icon: '✨',
    category: 'experiences',
    available: true,
    configFields: [
      {
        key: 'experience_text',
        label: 'Describe the experience',
        type: 'text',
        maxLength: 60,
        default: '',
      },
    ],
  },
  // --- COMING SOON ---
  {
    type: 'monthly_merch',
    label: 'Monthly Merch Drop',
    description: 'Receive exclusive merch every month',
    icon: '📦',
    category: 'shop',
    available: false,
  },
  {
    type: 'credits_on_releases',
    label: 'Credits on Releases',
    description: 'Your name in the credits of new releases',
    icon: '📝',
    category: 'recognition',
    available: false,
  },
  {
    type: 'shoutout',
    label: 'Community Shoutout',
    description: 'Artist shouts you out in a community post',
    icon: '📣',
    category: 'recognition',
    available: false,
  },
];

export const BENEFIT_CATEGORIES = [
  { key: 'music', label: 'Music Access' },
  { key: 'community', label: 'Community' },
  { key: 'shop', label: 'Shop & Merch' },
  { key: 'experiences', label: 'Experiences' },
  { key: 'recognition', label: 'Recognition' },
] as const;

export function getBenefitDefinition(type: BenefitType): BenefitDefinition | undefined {
  return BENEFIT_CATALOG.find(b => b.type === type);
}

export function getBenefitDisplayText(type: string, config: Record<string, any> = {}): string {
  const def = BENEFIT_CATALOG.find(b => b.type === type);
  if (!def) return type;

  switch (type) {
    case 'early_access':
      const days = config.days_early || 7;
      return `${days}-day early access to new music`;
    case 'community_badge':
      return config.badge_text ? `"${config.badge_text}" community badge` : 'Community badge';
    case 'shop_discount':
      return `${config.discount_percent || 10}% shop discount`;
    case 'one_on_one_call': {
      const labels: Record<string, string> = { monthly: 'Monthly ', quarterly: 'Quarterly ', one_time: '' };
      return `${labels[config.frequency] ?? ''}1-on-1 video call`;
    }
    case 'group_live_qa': {
      const labels: Record<string, string> = { weekly: 'Weekly ', monthly: 'Monthly ', quarterly: 'Quarterly ' };
      return `${labels[config.frequency] ?? ''}group live Q&A`;
    }
    case 'custom_experience':
      return config.experience_text?.trim() || 'Custom experience';
    default:
      return def.label;
  }
}
