import { User, AuthError } from '@supabase/supabase-js';

export type UserRole = 'fan' | 'artist' | 'admin';

export interface Profile {
  id: string;
  role: UserRole;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  social_links: Record<string, string> | null;
  created_at: string;
  updated_at: string;
}

export interface ArtistProfile {
  id: string;
  user_id: string;
  slug: string;
  banner_url: string | null;
  tagline: string | null;
  stripe_connect_id: string | null;
  tier_config: TierConfig[];
  is_verified: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  profile?: Profile;
}

export interface TierConfig {
  id: string;
  name: string;
  price: number;
  description: string;
  benefits: string[];
}

export type AccessLevel = 'free' | 'subscriber' | 'purchase';

export interface Track {
  id: string;
  artist_id: string;
  title: string;
  audio_url_128: string | null;
  audio_url_320: string | null;
  duration: number | null;
  access_level: AccessLevel;
  price: number | null;
  album_art_url: string | null;
  release_date: string;
  play_count: number;
  created_at: string;
  updated_at: string;
  // Joined fields
  artist?: ArtistProfile;
}

export interface Playlist {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  tracks?: Track[];
  track_count?: number;
}

export interface Album {
  id: string;
  artist_id: string;
  title: string;
  description: string | null;
  album_art_url: string | null;
  release_date: string;
  access_level: AccessLevel;
  is_free: boolean;
  allowed_tier_ids: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  artist?: ArtistProfile;
  tracks?: Track[];
  track_count?: number;
}

export interface AlbumTrack {
  id: string;
  album_id: string;
  track_id: string;
  track_number: number;
  created_at: string;
  // Joined
  track?: Track;
}

export interface PlaylistTrack {
  id: string;
  playlist_id: string;
  track_id: string;
  position: number;
  added_at: string;
  // Joined
  track?: Track;
}

export type ProductType = 'digital' | 'experience' | 'bundle';
export type DeliveryType = 'instant' | 'scheduled' | 'custom';
export type PurchaseStatus = 'pending' | 'completed' | 'refunded';

export interface Product {
  id: string;
  artist_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  type: ProductType;
  price: number;
  access_level: AccessLevel;
  delivery_type: DeliveryType;
  file_url: string | null;
  duration_minutes: number | null;
  max_quantity: number | null;
  quantity_sold: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  artist?: ArtistProfile;
  bundle_items?: Product[];
}

export interface BundleItem {
  id: string;
  bundle_id: string;
  product_id: string;
  created_at: string;
  product?: Product;
}

export interface Purchase {
  id: string;
  fan_id: string;
  product_id: string;
  artist_id: string;
  stripe_payment_intent_id: string | null;
  amount: number;
  status: PurchaseStatus;
  purchased_at: string;
  notes: string | null;
  // Joined
  product?: Product;
}

export interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signInWithMagicLink: (email: string) => Promise<{ error: AuthError | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  signInWithApple: () => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<{ error: AuthError | null }>;
  isArtist: () => boolean;
  isAdmin: () => boolean;
}

// Community Types
export type PostType = 'text' | 'image' | 'video' | 'audio' | 'poll' | 'link';

export interface Post {
  id: string;
  author_id: string;
  artist_community_id: string;
  content: string;
  post_type: PostType;
  media_urls: string[];
  access_level: AccessLevel;
  pinned: boolean;
  highlighted: boolean;
  poll_options?: string[];
  poll_results?: Record<string, number>;
  link_url?: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  author?: Profile;
  artist?: ArtistProfile;
  like_count?: number;
  comment_count?: number;
  has_liked?: boolean;
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  parent_comment_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  author?: Profile;
  replies?: Comment[];
  like_count?: number;
  has_liked?: boolean;
}

export interface Like {
  id: string;
  user_id: string;
  likeable_type: 'post' | 'comment';
  likeable_id: string;
  created_at: string;
}
