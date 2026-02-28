export interface Post {
  id: string;
  author_id: string;
  artist_community_id: string;
  content: string;
  post_type: 'text' | 'image' | 'video' | 'audio' | 'poll' | 'link';
  media_urls: string[];
  access_level: 'free' | 'subscriber' | 'purchase';
  pinned: boolean;
  highlighted: boolean;
  poll_options?: string[];
  poll_results?: Record<string, number>;
  link_url?: string;
  created_at: string;
  updated_at: string;
  author?: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    role: 'fan' | 'artist' | 'admin';
  };
  likes_count?: number;
  comments_count?: number;
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
  author?: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  };
  likes_count?: number;
  has_liked?: boolean;
  replies?: Comment[];
}

export interface Like {
  id: string;
  user_id: string;
  likeable_type: 'post' | 'comment';
  likeable_id: string;
  created_at: string;
}
