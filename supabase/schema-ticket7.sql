-- CRWN Database Schema - Ticket 7 Update
-- Add posts, comments, likes tables for community feed

-- Posts table
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  artist_community_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  post_type TEXT NOT NULL DEFAULT 'text' CHECK (post_type IN ('text', 'image', 'video', 'audio', 'poll', 'link')),
  media_urls JSONB DEFAULT '[]',
  access_level TEXT NOT NULL DEFAULT 'free' CHECK (access_level IN ('free', 'subscriber', 'purchase')),
  pinned BOOLEAN DEFAULT false,
  highlighted BOOLEAN DEFAULT false,
  poll_options JSONB DEFAULT NULL,
  poll_results JSONB DEFAULT NULL,
  link_url TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on posts
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for posts
CREATE POLICY "Posts are viewable by everyone" 
  ON posts FOR SELECT 
  USING (true);

CREATE POLICY "Authenticated users can create posts" 
  ON posts FOR INSERT 
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update own posts" 
  ON posts FOR UPDATE 
  USING (auth.uid() = author_id);

CREATE POLICY "Users can delete own posts" 
  ON posts FOR DELETE 
  USING (auth.uid() = author_id);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on comments
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for comments
CREATE POLICY "Comments are viewable by everyone" 
  ON comments FOR SELECT 
  USING (true);

CREATE POLICY "Authenticated users can create comments" 
  ON comments FOR INSERT 
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update own comments" 
  ON comments FOR UPDATE 
  USING (auth.uid() = author_id);

CREATE POLICY "Users can delete own comments" 
  ON comments FOR DELETE 
  USING (auth.uid() = author_id);

-- Likes table
CREATE TABLE IF NOT EXISTS likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  likeable_type TEXT NOT NULL CHECK (likeable_type IN ('post', 'comment')),
  likeable_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, likeable_type, likeable_id)
);

-- Enable RLS on likes
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for likes
CREATE POLICY "Likes are viewable by everyone" 
  ON likes FOR SELECT 
  USING (true);

CREATE POLICY "Users can manage own likes" 
  ON likes FOR ALL 
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX idx_posts_artist_community_id ON posts(artist_community_id);
CREATE INDEX idx_posts_author_id ON posts(author_id);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_posts_pinned ON posts(pinned) WHERE pinned = true;
CREATE INDEX idx_posts_highlighted ON posts(highlighted) WHERE highlighted = true;
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_comments_author_id ON comments(author_id);
CREATE INDEX idx_comments_parent_comment_id ON comments(parent_comment_id);
CREATE INDEX idx_likes_user_id ON likes(user_id);
CREATE INDEX idx_likes_likeable ON likes(likeable_type, likeable_id);

-- Function to toggle like
CREATE OR REPLACE FUNCTION toggle_like(
  p_user_id UUID,
  p_likeable_type TEXT,
  p_likeable_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM likes 
    WHERE user_id = p_user_id 
    AND likeable_type = p_likeable_type 
    AND likeable_id = p_likeable_id
  ) INTO v_exists;
  
  IF v_exists THEN
    DELETE FROM likes 
    WHERE user_id = p_user_id 
    AND likeable_type = p_likeable_type 
    AND likeable_id = p_likeable_id;
    RETURN false;
  ELSE
    INSERT INTO likes (user_id, likeable_type, likeable_id)
    VALUES (p_user_id, p_likeable_type, p_likeable_id);
    RETURN true;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get like count
CREATE OR REPLACE FUNCTION get_like_count(p_likeable_type TEXT, p_likeable_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER 
    FROM likes 
    WHERE likeable_type = p_likeable_type 
    AND likeable_id = p_likeable_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user liked
CREATE OR REPLACE FUNCTION has_user_liked(p_user_id UUID, p_likeable_type TEXT, p_likeable_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM likes 
    WHERE user_id = p_user_id 
    AND likeable_type = p_likeable_type 
    AND likeable_id = p_likeable_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers for updated_at
CREATE TRIGGER update_posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comments_updated_at
  BEFORE UPDATE ON comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
