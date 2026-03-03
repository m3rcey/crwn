'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { TierConfig } from '@/types';
import { Loader2, Plus, Pencil, Trash2, GripVertical } from 'lucide-react';

interface BookingSettingsProps {
  artistId: string;
  tiers: TierConfig[];
  initialSettings: {
    calendly_url: string | null;
    booking_enabled: boolean;
    booking_is_free: boolean;
    booking_allowed_tier_ids: string[];
  };
}

export function BookingSettings({ artistId, tiers, initialSettings }: BookingSettingsProps) {
  const supabase = createBrowserSupabaseClient();
  const { user } = useAuth();
  
  const [calendlyUrl, setCalendlyUrl] = useState(initialSettings.calendly_url || '');
  const [bookingEnabled, setBookingEnabled] = useState(initialSettings.booking_enabled);
  const [bookingIsFree, setBookingIsFree] = useState(initialSettings.booking_is_free);
  const [selectedTiers, setSelectedTiers] = useState<string[]>(initialSettings.booking_allowed_tier_ids || []);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const validateCalendlyUrl = (url: string) => {
    if (!url) return true;
    return url.startsWith('https://calendly.com/');
  };

  const handleSave = async () => {
    if (!user) return;
    
    if (calendlyUrl && !validateCalendlyUrl(calendlyUrl)) {
      setSaveMessage('Calendly URL must start with https://calendly.com/');
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const { error } = await supabase
        .from('artist_profiles')
        .update({
          calendly_url: calendlyUrl || null,
          booking_enabled: bookingEnabled,
          booking_is_free: bookingIsFree,
          booking_allowed_tier_ids: bookingIsFree ? [] : selectedTiers,
        })
        .eq('id', artistId);

      if (error) throw error;
      setSaveMessage('Settings saved!');
    } catch (error) {
      console.error('Error saving booking settings:', error);
      setSaveMessage('Error saving settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="neu-raised rounded-2xl p-6">
      <h2 className="text-xl font-bold text-crwn-text mb-6">Booking / Scheduling</h2>
      
      {/* Enable Toggle */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-crwn-text font-medium">Enable Booking</h3>
          <p className="text-crwn-text-dim text-sm">Show Book tab on your profile</p>
        </div>
        <button
          onClick={() => setBookingEnabled(!bookingEnabled)}
          className={`w-14 h-8 rounded-full transition-colors ${
            bookingEnabled ? 'bg-crwn-gold' : 'bg-crwn-surface'
          }`}
        >
          <div
            className={`w-6 h-6 rounded-full bg-white shadow-md transform transition-transform ${
              bookingEnabled ? 'translate-x-7' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {bookingEnabled && (
        <>
          {/* Calendly URL */}
          <div className="mb-6">
            <label className="block text-crwn-text font-medium mb-2">
              Calendly URL
            </label>
            <input
              type="url"
              value={calendlyUrl}
              onChange={(e) => setCalendlyUrl(e.target.value)}
              placeholder="https://calendly.com/your-username"
              className="neu-inset w-full px-4 py-3 text-crwn-text placeholder-crwn-text-secondary focus:outline-none"
            />
            <p className="text-crwn-text-dim text-xs mt-1">
              Paste your full Calendly page or event type URL
            </p>
          </div>

          {/* Tier Access */}
          <div className="mb-6">
            <h3 className="text-crwn-text font-medium mb-3">Subscriber Access</h3>
            
            <label className="flex items-center gap-2 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={bookingIsFree}
                onChange={(e) => {
                  setBookingIsFree(e.target.checked);
                  if (e.target.checked) setSelectedTiers([]);
                }}
                className="w-4 h-4"
              />
              <span className="text-crwn-text">All fans can book for free</span>
            </label>

            {!bookingIsFree && tiers.length > 0 && (
              <div className="space-y-2 ml-6">
                <p className="text-crwn-text-dim text-sm mb-2">Only subscribers can book for free:</p>
                {tiers.map(tier => (
                  <label key={tier.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedTiers.includes(tier.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTiers([...selectedTiers, tier.id]);
                        } else {
                          setSelectedTiers(selectedTiers.filter(id => id !== tier.id));
                        }
                      }}
                      className="w-4 h-4"
                    />
                    <span className="text-crwn-text">{tier.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="neu-button-accent px-6 py-3 rounded-xl font-semibold disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save Settings'}
          </button>
          
          {saveMessage && (
            <p className={`text-sm mt-2 ${saveMessage.includes('Error') ? 'text-crwn-error' : 'text-crwn-gold'}`}>
              {saveMessage}
            </p>
          )}
        </>
      )}
    </div>
  );
}
