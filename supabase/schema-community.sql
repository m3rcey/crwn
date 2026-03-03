-- Community Feature Phase 1: Username + DB Tables
-- Run this migration to enable community features

-- 1. Add username to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username) WHERE username IS NOT NULL;

-- 2. Community posts table
CREATE TABLE IF NOT EXISTS community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  media_urls JSONB DEFAULT '[]'::jsonb,
  media_types JSONB DEFAULT '[]'::jsonb,
  is_artist_post BOOLEAN DEFAULT false,
  is_free BOOLEAN DEFAULT true,
  allowed_tier_ids JSONB DEFAULT '[]'::jsonb,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Post likes table
CREATE TABLE IF NOT EXISTS community_post_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- 4. Comments table
CREATE TABLE IF NOT EXISTS community_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  likes_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Comment likes table
CREATE TABLE IF NOT EXISTS community_comment_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES community_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(comment_id, user_id)
);

-- Enable RLS on all tables
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_comment_likes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for community_posts
-- Anyone can read active posts
DROP POLICY IF EXISTS "Anyone can read active community posts" ON community_posts;
CREATE POLICY "Anyone can read active community posts" ON community_posts FOR SELECT USING (is_active = true);

-- Authenticated users can create posts
DROP POLICY IF EXISTS "Authenticated users can create community posts" ON community_posts;
CREATE POLICY "Authenticated users can create community posts" ON community_posts FOR INSERT WITH CHECK (auth.uid() = author_id);

-- Post authors can update their posts
DROP POLICY IF EXISTS "Authors can update own community posts" ON community_posts;
CREATE POLICY "Authors can update own community posts" ON community_posts FOR UPDATE USING (auth.uid() = author_id);

-- Post authors and artists can delete their posts
DROP POLICY IF EXISTS "Authors can delete own community posts" ON community_posts;
CREATE POLICY "Authors can delete own community posts" ON community_posts FOR DELETE USING (auth.uid() = author_id);

-- Artists can delete any post in their community
DROP POLICY IF EXISTS "Artists can delete any post in their community" ON community_posts;
CREATE POLICY "Artists can delete any post in their community" ON community_posts FOR DELETE USING (
  auth.uid() IN (SELECT user_id FROM artist_profiles WHERE id = artist_id)
);

-- RLS Policies for community_post_likes
-- Anyone can read likes
DROP POLICY IF EXISTS "Anyone can read post likes" ON community_post_likes;
CREATE POLICY "Anyone can read post likes" ON community_post_likes FOR SELECT USING (true);

-- Authenticated users can like/unlike posts
DROP POLICY IF EXISTS "Authenticated users can like posts" ON community_post_likes;
CREATE POLICY "Authenticated users can like posts" ON community_post_likes FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for community_comments
-- Anyone can read active comments
DROP POLICY IF EXISTS "Anyone can read active comments" ON community_comments;
CREATE POLICY "Anyone can read active comments" ON community_comments FOR SELECT USING (is_active = true);

-- Authenticated users can create comments
DROP POLICY IF EXISTS "Authenticated users can create comments" ON community_comments;
CREATE POLICY "Authenticated users can create comments" ON community_comments FOR INSERT WITH CHECK (auth.uid() = author_id);

-- Comment authors can update their comments
DROP POLICY IF EXISTS "Authors can update own comments" ON community_comments;
CREATE POLICY "Authors can update own comments" ON community_comments FOR UPDATE USING (auth.uid() = author_id);

-- Comment authors can delete their comments
DROP POLICY IF EXISTS "Authors can delete own comments" ON community_comments;
CREATE POLICY "Authors can delete own comments" ON community_comments FOR DELETE USING (auth.uid() = author_id);

-- RLS Policies for community_comment_likes
-- Anyone can read comment likes
DROP POLICY IF EXISTS "Anyone can read comment likes" ON community_comment_likes;
CREATE POLICY "Anyone can read comment likes" ON community_comment_likes FOR SELECT USING (true);

-- Authenticated users can like/unlike comments
DROP POLICY IF EXISTS "Authenticated users can like comments" ON community_comment_likes;
CREATE POLICY "Authenticated users can like comments" ON community_comment_likes FOR ALL USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_community_posts_artist ON community_posts(artist_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_author ON community_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_community_comments_post ON community_comments(post_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_community_post_likes_post ON community_post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_community_comment_likes_comment ON community_comment_likes(comment_id);
