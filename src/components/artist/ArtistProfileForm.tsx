'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import Image from 'next/image';
import { ArtistProfile } from '@/types';

interface ArtistFormData {
  display_name: string;
  slug: string;
  tagline: string;
  bio: string;
  avatar_url: string;
  banner_url: string;
  social_links: Record<string, string>;
}

export function ArtistProfileForm() {
  const { user, profile } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [artistProfile, setArtistProfile] = useState<ArtistProfile | null>(null);
  const [formData, setFormData] = useState<ArtistFormData>({
    display_name: profile?.display_name || '',
    slug: '',
    tagline: '',
    bio: profile?.bio || '',
    avatar_url: profile?.avatar_url || '',
    banner_url: '',
    social_links: profile?.social_links || {},
  });

  const fetchArtistProfile = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    // Fetch both artist profile and user profile
    const [artistResult, profileResult] = await Promise.all([
      supabase
        .from('artist_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('display_name, bio, avatar_url, social_links')
        .eq('id', user.id)
        .maybeSingle()
    ]);

    const data = artistResult.data;
    const profile = profileResult.data;

    if (data) {
      setArtistProfile(data as ArtistProfile);
    }
    
    // Set form data from both tables
    setFormData(prev => ({
      ...prev,
      display_name: profile?.display_name || prev.display_name || '',
      slug: data?.slug || '',
      tagline: data?.tagline || '',
      bio: profile?.bio || prev.bio || '',
      avatar_url: profile?.avatar_url || prev.avatar_url || '',
      banner_url: data?.banner_url || '',
      social_links: profile?.social_links || prev.social_links || {},
    }));
    
    setIsLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    if (user) {
      fetchArtistProfile();
    }
  }, [user, fetchArtistProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      console.log('Saving profile with display_name:', formData.display_name);
      
      // Update profile - save display_name and avatar_url
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          display_name: formData.display_name,
          bio: formData.bio,
          avatar_url: formData.avatar_url,
          social_links: formData.social_links,
        })
        .eq('id', user?.id);

      if (profileError) {
        console.error('Profile update error:', profileError);
        alert(`Failed to save profile: ${profileError.message}`);
        setIsSaving(false);
        return;
      }
      
      console.log('Profile saved successfully');

      // Update or create artist profile
      if (artistProfile) {
        await supabase
          .from('artist_profiles')
          .update({
            slug: formData.slug,
            tagline: formData.tagline,
            banner_url: formData.banner_url,
          })
          .eq('id', artistProfile.id);
      } else {
        const { data } = await supabase
          .from('artist_profiles')
          .insert({
            user_id: user?.id,
            slug: formData.slug,
            tagline: formData.tagline,
            banner_url: formData.banner_url,
          })
          .select()
          .single();
        
        if (data) {
          setArtistProfile(data);
          // Update user role to artist
          await supabase
            .from('profiles')
            .update({ role: 'artist' })
            .eq('id', user?.id);
        }
      }

      alert('Profile saved successfully!');
    } catch (error) {
      console.error('Error saving profile:', error);
      alert('Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileUpload = async (file: File, type: 'avatar' | 'banner') => {
    if (!user) return;
    
    try {
      console.log('Uploading file:', type, file.name);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${type}/${fileName}`;
      
      // Upload to Supabase Storage
      const { error: uploadError, data } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);
      
      if (uploadError) {
        console.error('Upload error:', uploadError);
        alert(`Failed to upload ${type}: ${uploadError.message}`);
        return;
      }
      
      console.log('Upload success:', data);
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);
      
      console.log('Public URL:', urlData.publicUrl);
      
      if (type === 'avatar') {
        setFormData(prev => ({ ...prev, avatar_url: urlData.publicUrl }));
      } else {
        setFormData(prev => ({ ...prev, banner_url: urlData.publicUrl }));
      }
    } catch (error) {
      console.error('File upload error:', error);
      alert(`Failed to upload ${type}. Please try again.`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-crwn-gold" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      {/* Banner Preview */}
      <div>
        <label className="block text-sm font-medium text-crwn-text-secondary mb-2">
          Banner Image
        </label>
        <div className="relative h-32 bg-crwn-surface rounded-lg overflow-hidden">
          {formData.banner_url ? (
            <Image
              src={formData.banner_url}
              alt="Banner"
              fill
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-crwn-text-secondary">
              No banner
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'banner')}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </div>
        <p className="text-xs text-crwn-text-secondary mt-1">Click to upload (recommended: 1500x500)</p>
      </div>

      {/* Avatar */}
      <div>
        <label className="block text-sm font-medium text-crwn-text-secondary mb-2">
          Avatar
        </label>
        <div className="relative w-24 h-24 rounded-full bg-crwn-surface overflow-hidden">
          {formData.avatar_url ? (
            <Image
              src={formData.avatar_url}
              alt="Avatar"
              fill
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl text-crwn-text-secondary">
              🎵
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'avatar')}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </div>
      </div>

      {/* Display Name */}
      <div>
        <label className="block text-sm font-medium text-crwn-text-secondary mb-2">
          Display Name
        </label>
        <input
          type="text"
          value={formData.display_name}
          onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
          placeholder="Your artist name"
          className="w-full bg-crwn-surface border border-crwn-elevated rounded-lg px-4 py-3 text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold"
          required
        />
      </div>

      {/* Slug */}
      <div>
        <label className="block text-sm font-medium text-crwn-text-secondary mb-2">
          Artist URL
        </label>
        <div className="flex items-center bg-crwn-surface rounded-lg px-4 py-3">
          <span className="text-crwn-text-secondary">crwn.app/artist/</span>
          <input
            type="text"
            value={formData.slug}
            onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
            placeholder="your-name"
            className="bg-transparent flex-1 outline-none text-crwn-text"
            required
          />
        </div>
      </div>

      {/* Tagline */}
      <div>
        <label className="block text-sm font-medium text-crwn-text-secondary mb-2">
          Tagline
        </label>
        <input
          type="text"
          value={formData.tagline}
          onChange={(e) => setFormData(prev => ({ ...prev, tagline: e.target.value }))}
          placeholder="Short description of your music"
          className="w-full bg-crwn-surface border border-crwn-elevated rounded-lg px-4 py-3 text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold"
          maxLength={100}
        />
      </div>

      {/* Bio */}
      <div>
        <label className="block text-sm font-medium text-crwn-text-secondary mb-2">
          Bio
        </label>
        <textarea
          value={formData.bio}
          onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
          placeholder="Tell your story..."
          rows={4}
          className="w-full bg-crwn-surface border border-crwn-elevated rounded-lg px-4 py-3 text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold resize-none"
        />
      </div>

      {/* Social Links */}
      <div>
        <label className="block text-sm font-medium text-crwn-text-secondary mb-2">
          Social Links
        </label>
        <div className="space-y-2">
          {['instagram', 'twitter', 'youtube', 'spotify'].map((platform) => (
            <div key={platform} className="flex items-center gap-2">
              <span className="text-crwn-text-secondary w-20 capitalize">{platform}</span>
              <input
                type="url"
                value={formData.social_links[platform] || ''}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  social_links: { ...prev.social_links, [platform]: e.target.value }
                }))}
                placeholder={`https://${platform}.com/...`}
                className="flex-1 bg-crwn-surface border border-crwn-elevated rounded-lg px-4 py-2 text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold text-sm"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isSaving}
        className="bg-crwn-gold text-crwn-bg font-semibold px-6 py-3 rounded-lg hover:bg-crwn-gold-hover transition-colors disabled:opacity-50"
      >
        {isSaving ? 'Saving...' : 'Save Profile'}
      </button>
    </form>
  );
}
