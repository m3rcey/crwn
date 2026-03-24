'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Mail, MessageSquare, Loader2, BellOff, Clock, Zap } from 'lucide-react';

interface ArtistPref {
  artist_id: string;
  artist_name: string;
  avatar_url: string | null;
  slug: string;
  email_marketing: boolean;
  sms_marketing: boolean;
  has_sms: boolean;
  digest_only: boolean;
}

export default function NotificationsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [prefs, setPrefs] = useState<ArtistPref[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [unsubAllLoading, setUnsubAllLoading] = useState(false);
  const [unsubAllDone, setUnsubAllDone] = useState(false);

  const loadPrefs = useCallback(async () => {
    if (!user) return;

    // Get all artist relationships via subscriptions + earnings
    const [{ data: subs }, { data: earnings }, { data: smsSubs }] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('artist_id, artist:artist_profiles(slug, profile:profiles(display_name, avatar_url))')
        .eq('fan_id', user.id),
      supabase
        .from('earnings')
        .select('artist_id, artist:artist_profiles(slug, profile:profiles(display_name, avatar_url))')
        .eq('fan_id', user.id),
      supabase
        .from('sms_subscribers')
        .select('artist_id')
        .eq('fan_id', user.id)
        .eq('status', 'active'),
    ]);

    // Deduplicate artists
    const artistMap: Record<string, { name: string; avatar: string | null; slug: string; has_sms: boolean }> = {};
    const smsArtistIds = new Set((smsSubs || []).map((s: { artist_id: string }) => s.artist_id));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const processRecord = (r: any) => {
      if (!r.artist_id || artistMap[r.artist_id]) return;
      artistMap[r.artist_id] = {
        name: r.artist?.profile?.display_name || 'Unknown Artist',
        avatar: r.artist?.profile?.avatar_url || null,
        slug: r.artist?.slug || '',
        has_sms: smsArtistIds.has(r.artist_id),
      };
    };

    (subs || []).forEach(processRecord);
    (earnings || []).forEach(processRecord);

    // Also add artists from SMS that might not be in subs/earnings
    if (smsSubs) {
      for (const s of smsSubs) {
        if (!artistMap[s.artist_id]) {
          const { data: artist } = await supabase
            .from('artist_profiles')
            .select('slug, profile:profiles(display_name, avatar_url)')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .eq('id', s.artist_id as any)
            .single();
          artistMap[s.artist_id] = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            name: (artist as any)?.profile?.display_name || 'Unknown Artist',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            avatar: (artist as any)?.profile?.avatar_url || null,
            slug: artist?.slug || '',
            has_sms: true,
          };
        }
      }
    }

    const artistIds = Object.keys(artistMap);
    if (artistIds.length === 0) {
      setPrefs([]);
      setLoading(false);
      return;
    }

    // Get existing prefs
    const { data: existingPrefs } = await supabase
      .from('fan_communication_prefs')
      .select('artist_id, email_marketing, sms_marketing, digest_only')
      .eq('fan_id', user.id);

    const prefMap: Record<string, { email_marketing: boolean; sms_marketing: boolean; digest_only: boolean }> = {};
    (existingPrefs || []).forEach((p: { artist_id: string; email_marketing: boolean; sms_marketing: boolean; digest_only?: boolean }) => {
      prefMap[p.artist_id] = { email_marketing: p.email_marketing, sms_marketing: p.sms_marketing, digest_only: p.digest_only ?? false };
    });

    const result: ArtistPref[] = artistIds.map(id => ({
      artist_id: id,
      artist_name: artistMap[id].name,
      avatar_url: artistMap[id].avatar,
      slug: artistMap[id].slug,
      email_marketing: prefMap[id]?.email_marketing ?? true,
      sms_marketing: prefMap[id]?.sms_marketing ?? true,
      has_sms: artistMap[id].has_sms,
      digest_only: prefMap[id]?.digest_only ?? false,
    }));

    result.sort((a, b) => a.artist_name.localeCompare(b.artist_name));
    setPrefs(result);
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    if (user) loadPrefs();
  }, [user, loadPrefs]);

  const togglePref = async (artistId: string, field: 'email_marketing' | 'sms_marketing', value: boolean) => {
    if (!user) return;
    setUpdating(`${artistId}-${field}`);

    const existing = prefs.find(p => p.artist_id === artistId);
    if (!existing) return;

    await supabase
      .from('fan_communication_prefs')
      .upsert(
        {
          fan_id: user.id,
          artist_id: artistId,
          email_marketing: field === 'email_marketing' ? value : existing.email_marketing,
          sms_marketing: field === 'sms_marketing' ? value : existing.sms_marketing,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'fan_id,artist_id' }
      );

    setPrefs(prev =>
      prev.map(p =>
        p.artist_id === artistId ? { ...p, [field]: value } : p
      )
    );
    setUpdating(null);
  };

  const handleUnsubscribeAll = async () => {
    if (!confirm('This will unsubscribe you from all marketing emails and SMS from every artist. Are you sure?')) return;
    setUnsubAllLoading(true);

    const res = await fetch('/api/fan/unsubscribe-all', { method: 'POST' });
    if (res.ok) {
      setPrefs(prev => prev.map(p => ({ ...p, email_marketing: false, sms_marketing: false })));
      setUnsubAllDone(true);
    }

    setUnsubAllLoading(false);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-crwn-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 stagger-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/profile" className="p-2 rounded-lg hover:bg-crwn-surface transition-colors">
          <ArrowLeft className="w-5 h-5 text-crwn-text-secondary" />
        </Link>
        <h1 className="text-2xl font-bold text-crwn-text">Communication Preferences</h1>
      </div>

      <p className="text-crwn-text-secondary text-sm">
        Manage marketing emails and SMS from artists you follow. Transactional emails (receipts, subscription confirmations) are not affected.
      </p>

      {/* Notification Frequency — overwhelm guard */}
      {prefs.length > 0 && (
        <div className="bg-crwn-surface rounded-xl p-6">
          <h2 className="text-sm font-semibold text-crwn-text mb-1">Email Frequency</h2>
          <p className="text-xs text-crwn-text-secondary mb-4">
            Feeling overwhelmed? Switch to a weekly digest — one email every Sunday with everything you missed.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={async () => {
                if (!user) return;
                // Set all prefs to digest_only = false
                for (const p of prefs) {
                  await supabase
                    .from('fan_communication_prefs')
                    .upsert({
                      fan_id: user.id,
                      artist_id: p.artist_id,
                      email_marketing: p.email_marketing,
                      sms_marketing: p.sms_marketing,
                      digest_only: false,
                      updated_at: new Date().toISOString(),
                    }, { onConflict: 'fan_id,artist_id' });
                }
                setPrefs(prev => prev.map(p => ({ ...p, digest_only: false })));
              }}
              className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-colors ${
                !prefs.some(p => p.digest_only)
                  ? 'border-crwn-gold/50 bg-crwn-gold/10'
                  : 'border-crwn-elevated hover:border-[#444]'
              }`}
            >
              <Zap className={`w-4 h-4 flex-shrink-0 ${!prefs.some(p => p.digest_only) ? 'text-crwn-gold' : 'text-crwn-text-secondary'}`} />
              <div>
                <p className="text-sm font-medium text-crwn-text">Real-time</p>
                <p className="text-xs text-crwn-text-secondary">Get emails as artists send them</p>
              </div>
            </button>
            <button
              onClick={async () => {
                if (!user) return;
                // Set all prefs to digest_only = true
                for (const p of prefs) {
                  await supabase
                    .from('fan_communication_prefs')
                    .upsert({
                      fan_id: user.id,
                      artist_id: p.artist_id,
                      email_marketing: p.email_marketing,
                      sms_marketing: p.sms_marketing,
                      digest_only: true,
                      updated_at: new Date().toISOString(),
                    }, { onConflict: 'fan_id,artist_id' });
                }
                setPrefs(prev => prev.map(p => ({ ...p, digest_only: true })));
              }}
              className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-colors ${
                prefs.some(p => p.digest_only)
                  ? 'border-crwn-gold/50 bg-crwn-gold/10'
                  : 'border-crwn-elevated hover:border-[#444]'
              }`}
            >
              <Clock className={`w-4 h-4 flex-shrink-0 ${prefs.some(p => p.digest_only) ? 'text-crwn-gold' : 'text-crwn-text-secondary'}`} />
              <div>
                <p className="text-sm font-medium text-crwn-text">Weekly Digest</p>
                <p className="text-xs text-crwn-text-secondary">One summary email per week</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {prefs.length === 0 ? (
        <div className="bg-crwn-surface rounded-xl p-8 text-center">
          <p className="text-crwn-text-secondary">No artist relationships yet. Subscribe to an artist to manage preferences.</p>
        </div>
      ) : (
        <>
          {/* Artist list */}
          <div className="bg-crwn-surface rounded-xl p-6">
            <div className="space-y-1">
              {prefs.map((pref) => (
                <div key={pref.artist_id} className="flex items-center justify-between py-3 border-b border-crwn-elevated last:border-0">
                  <Link href={`/${pref.slug}`} className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-full bg-crwn-elevated overflow-hidden flex-shrink-0">
                      {pref.avatar_url ? (
                        <Image src={pref.avatar_url} alt="" width={40} height={40} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-crwn-text-secondary text-sm font-semibold">
                          {pref.artist_name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <p className="text-crwn-text font-medium text-sm truncate">{pref.artist_name}</p>
                  </Link>

                  <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                    {/* Email toggle */}
                    <button
                      onClick={() => togglePref(pref.artist_id, 'email_marketing', !pref.email_marketing)}
                      disabled={updating === `${pref.artist_id}-email_marketing`}
                      className="flex items-center gap-1.5 group"
                      title={pref.email_marketing ? 'Email marketing on' : 'Email marketing off'}
                    >
                      <Mail className={`w-4 h-4 ${pref.email_marketing ? 'text-crwn-gold' : 'text-crwn-text-secondary/40'}`} />
                      <div className={`w-8 h-4.5 rounded-full relative transition-colors ${pref.email_marketing ? 'bg-crwn-gold' : 'bg-crwn-elevated'}`}>
                        <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all ${pref.email_marketing ? 'left-4' : 'left-0.5'}`} />
                      </div>
                    </button>

                    {/* SMS toggle — only show if fan has SMS with this artist */}
                    {pref.has_sms && (
                      <button
                        onClick={() => togglePref(pref.artist_id, 'sms_marketing', !pref.sms_marketing)}
                        disabled={updating === `${pref.artist_id}-sms_marketing`}
                        className="flex items-center gap-1.5 group"
                        title={pref.sms_marketing ? 'SMS marketing on' : 'SMS marketing off'}
                      >
                        <MessageSquare className={`w-4 h-4 ${pref.sms_marketing ? 'text-crwn-gold' : 'text-crwn-text-secondary/40'}`} />
                        <div className={`w-8 h-4.5 rounded-full relative transition-colors ${pref.sms_marketing ? 'bg-crwn-gold' : 'bg-crwn-elevated'}`}>
                          <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all ${pref.sms_marketing ? 'left-4' : 'left-0.5'}`} />
                        </div>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 mt-4 text-xs text-crwn-text-secondary">
              <Mail className="w-3.5 h-3.5" /> Email
              <span className="mx-1">·</span>
              <MessageSquare className="w-3.5 h-3.5" /> SMS
            </div>
          </div>

          {/* Unsubscribe from all */}
          <div className="bg-crwn-surface rounded-xl p-6">
            <button
              onClick={handleUnsubscribeAll}
              disabled={unsubAllLoading || unsubAllDone}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-crwn-text-secondary hover:text-crwn-error hover:bg-crwn-error/10 rounded-lg transition-colors disabled:opacity-50"
            >
              {unsubAllLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <BellOff className="w-4 h-4" />
              )}
              {unsubAllDone ? 'Unsubscribed from all marketing' : 'Unsubscribe from all artists'}
            </button>
            <p className="text-center text-xs text-crwn-text-secondary/60 mt-2">
              This stops all marketing emails and SMS from every artist on CRWN.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
