'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Loader2, Phone, MessageSquare, Users, Send, AlertCircle, ImagePlus, X } from 'lucide-react';
import { getSmsLimit } from '@/lib/platformTier';
import { SMS_CATEGORIES, MAX_SMS_PER_FAN_PER_MONTH, MMS_ALLOWED_TYPES, MMS_MAX_FILE_SIZE } from '@/lib/twilio';

interface SmsSetupProps {
  artistId: string;
  platformTier: string;
}

interface PhoneSetup {
  phone_number: string;
  keyword: string;
  monthly_send_count: number;
  is_active: boolean;
}

interface SmsSubscriber {
  id: string;
  phone_number: string;
  status: string;
  city: string | null;
  state: string | null;
  timezone: string | null;
  monthly_receive_count: number;
  opted_in_at: string | null;
  created_at: string;
}

export function SmsSetup({ artistId, platformTier }: SmsSetupProps) {
  const { showToast } = useToast();
  const smsLimit = getSmsLimit(platformTier);

  const [phoneSetup, setPhoneSetup] = useState<PhoneSetup | null>(null);
  const [subscribers, setSubscribers] = useState<SmsSubscriber[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [isProvisioning, setIsProvisioning] = useState(false);

  // Compose state
  const [showCompose, setShowCompose] = useState(false);
  const [smsCategory, setSmsCategory] = useState('');
  const [smsMessage, setSmsMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  // MMS media state
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    loadData();
  }, [artistId]);

  async function loadData() {
    const supabase = createBrowserSupabaseClient();
    try {
      // Fetch artist phone setup
      const { data: phone } = await supabase
        .from('artist_phone_numbers')
        .select('phone_number, keyword, monthly_send_count, is_active')
        .eq('artist_id', artistId)
        .maybeSingle();

      if (phone) {
        setPhoneSetup(phone);
      }

      // Fetch subscribers
      const { data: subs } = await supabase
        .from('sms_subscribers')
        .select('*')
        .eq('artist_id', artistId)
        .order('created_at', { ascending: false });

      setSubscribers(subs || []);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }

  const handleProvision = async () => {
    if (!keyword.trim()) {
      showToast('Enter a keyword', 'error');
      return;
    }
    setIsProvisioning(true);
    try {
      const res = await fetch('/api/sms/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistId, keyword: keyword.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to set up');
      showToast(`SMS keyword "${json.keyword}" is set up!`, 'success');
      setPhoneSetup({
        phone_number: json.phoneNumber || '',
        keyword: json.keyword,
        monthly_send_count: 0,
        is_active: true,
      });
    } catch (err: any) {
      showToast(err.message || 'Failed to provision', 'error');
    } finally {
      setIsProvisioning(false);
    }
  };

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!MMS_ALLOWED_TYPES.includes(file.type)) {
      showToast('Only JPEG, PNG, GIF, and WebP images are allowed', 'error');
      return;
    }
    if (file.size > MMS_MAX_FILE_SIZE) {
      showToast('Image must be under 5MB', 'error');
      return;
    }

    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  const clearMedia = () => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(null);
    setMediaPreview(null);
  };

  const handleSend = async () => {
    if (!smsCategory || !smsMessage.trim()) {
      showToast('Select a category and write a message', 'error');
      return;
    }
    setIsSending(true);
    try {
      // Upload media first if attached
      let mediaUrl: string | undefined;
      if (mediaFile) {
        setIsUploading(true);
        const form = new FormData();
        form.append('file', mediaFile);
        form.append('artistId', artistId);
        const uploadRes = await fetch('/api/sms/upload', { method: 'POST', body: form });
        const uploadJson = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadJson.error || 'Image upload failed');
        mediaUrl = uploadJson.url;
        setIsUploading(false);
      }

      const res = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artistId,
          category: smsCategory,
          message: smsMessage.trim(),
          mediaUrl,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to send');
      showToast(
        `${mediaUrl ? 'MMS' : 'SMS'} sent to ${json.sent} fans${json.deferred ? `, ${json.deferred} deferred (quiet hours)` : ''}${json.skipped ? `, ${json.skipped} skipped (limits)` : ''}`,
        'success'
      );
      setShowCompose(false);
      setSmsMessage('');
      setSmsCategory('');
      clearMedia();
    } catch (err: any) {
      showToast(err.message || 'Failed to send', 'error');
      setIsUploading(false);
    } finally {
      setIsSending(false);
    }
  };

  if (smsLimit === 0) {
    return (
      <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-8 text-center">
        <Phone className="w-10 h-10 text-crwn-text-secondary mx-auto mb-3" />
        <p className="text-crwn-text font-medium mb-1">SMS requires Pro or higher</p>
        <p className="text-sm text-crwn-text-secondary mb-4">
          Upgrade your plan to send SMS notifications to your fans.
        </p>
      </div>
    );
  }

  // Not set up yet
  if (!phoneSetup) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-crwn-text">SMS Notifications</h2>
          <p className="text-sm text-crwn-text-secondary mt-0.5">
            Send targeted texts to opted-in fans about shows, releases, and exclusive drops.
          </p>
        </div>

        <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-6 space-y-4">
          <h3 className="text-sm font-medium text-crwn-text">Set Up Your Keyword</h3>
          <p className="text-xs text-crwn-text-secondary">
            Fans text this keyword to your number to opt in. Choose something memorable — your artist name works great.
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              value={keyword}
              onChange={e => setKeyword(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="e.g. M3RCEY"
              maxLength={20}
              className="flex-1 px-4 py-2.5 bg-crwn-elevated border border-crwn-elevated rounded-xl text-sm text-crwn-text font-mono placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
            />
            <button
              onClick={handleProvision}
              disabled={isProvisioning || keyword.length < 3}
              className="px-4 py-2.5 bg-crwn-gold text-crwn-bg rounded-full text-sm font-semibold hover:bg-crwn-gold/90 disabled:opacity-40 transition-colors"
            >
              {isProvisioning ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Set Up'}
            </button>
          </div>
          <p className="text-xs text-crwn-text-secondary">3-20 characters, letters and numbers only</p>
        </div>

        <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-6">
          <h3 className="text-sm font-medium text-crwn-text mb-3">How it works</h3>
          <ol className="space-y-2 text-xs text-crwn-text-secondary list-decimal list-inside">
            <li>You set a keyword (e.g. "M3RCEY")</li>
            <li>Fans text your keyword to opt in (double opt-in required)</li>
            <li>You send targeted messages — only allowed categories, frequency-limited</li>
            <li>Fans can reply STOP anytime to unsubscribe</li>
          </ol>
        </div>

        <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-6">
          <h3 className="text-sm font-medium text-crwn-text mb-3">Your Plan</h3>
          <div className="flex items-center justify-between text-sm">
            <span className="text-crwn-text-secondary">Monthly SMS limit</span>
            <span className="text-crwn-text font-medium">{smsLimit.toLocaleString()} messages</span>
          </div>
          <div className="flex items-center justify-between text-sm mt-2">
            <span className="text-crwn-text-secondary">Per-fan limit</span>
            <span className="text-crwn-text font-medium">{MAX_SMS_PER_FAN_PER_MONTH}/month</span>
          </div>
        </div>
      </div>
    );
  }

  // SMS is set up — show dashboard
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-crwn-text">SMS Campaigns</h2>
            <p className="text-sm text-crwn-text-secondary mt-1">
              Send targeted texts to opted-in fans.
            </p>
          </div>
          <button
            onClick={() => setShowCompose(!showCompose)}
            className="flex items-center gap-2 px-4 py-2.5 bg-crwn-gold text-crwn-bg rounded-full text-sm font-semibold hover:bg-crwn-gold/90 transition-colors shrink-0"
          >
            <Send className="w-4 h-4" />
            New SMS
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-crwn-text-secondary">Keyword:</span>
          <span className="font-mono text-xs text-crwn-gold bg-crwn-gold/10 px-2 py-1 rounded-md">{phoneSetup.keyword}</span>
          <button
            onClick={() => { setPhoneSetup(null); setKeyword(phoneSetup.keyword); }}
            className="text-xs text-crwn-text-secondary hover:text-crwn-text transition-colors"
          >
            Change
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-crwn-gold" />
            <span className="text-xs text-crwn-text-secondary">Subscribers</span>
          </div>
          <p className="text-xl font-bold text-crwn-text">{subscribers.filter(s => s.status === 'active').length}</p>
        </div>
        <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-4">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-crwn-text-secondary">Sent This Month</span>
          </div>
          <p className="text-xl font-bold text-crwn-text">{phoneSetup.monthly_send_count}</p>
        </div>
        <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-4">
          <div className="flex items-center gap-2 mb-1">
            <Phone className="w-4 h-4 text-green-400" />
            <span className="text-xs text-crwn-text-secondary">Remaining</span>
          </div>
          <p className="text-xl font-bold text-crwn-text">{smsLimit - phoneSetup.monthly_send_count}</p>
        </div>
      </div>

      {/* Compose */}
      {showCompose && (
        <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-5 space-y-4">
          <h3 className="text-sm font-medium text-crwn-text">New SMS Campaign</h3>

          <div>
            <label className="block text-xs text-crwn-text-secondary mb-1.5">Category (required)</label>
            <select
              value={smsCategory}
              onChange={e => setSmsCategory(e.target.value)}
              className="w-full px-3 py-2 bg-crwn-elevated border border-crwn-elevated rounded-lg text-sm text-crwn-text focus:outline-none focus:border-crwn-gold/50"
            >
              <option value="">Select category...</option>
              {SMS_CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label} — {c.description}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-crwn-text-secondary mb-1.5">Message</label>
            <textarea
              value={smsMessage}
              onChange={e => setSmsMessage(e.target.value)}
              rows={3}
              maxLength={480}
              placeholder="Write your message (supports {{artist_name}}, {{city}}, {{state}})"
              className="w-full px-3 py-2 bg-crwn-elevated border border-crwn-elevated rounded-lg text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50 resize-y"
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-crwn-text-secondary">
                {smsMessage.length}/480 chars ({Math.ceil((smsMessage.length + 25) / 160)} segment{Math.ceil((smsMessage.length + 25) / 160) !== 1 ? 's' : ''})
              </span>
              <span className="text-xs text-crwn-text-secondary">
                +25 chars for "Reply STOP to opt out"
              </span>
            </div>
          </div>

          {/* MMS Image Attachment */}
          <div>
            <label className="block text-xs text-crwn-text-secondary mb-1.5">Attach Image (sends as MMS)</label>
            {mediaPreview ? (
              <div className="relative inline-block">
                <img
                  src={mediaPreview}
                  alt="MMS preview"
                  className="w-24 h-24 object-cover rounded-lg border border-crwn-elevated"
                />
                <button
                  onClick={clearMedia}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-400 transition-colors"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 px-3 py-2 bg-crwn-elevated border border-crwn-elevated rounded-lg cursor-pointer hover:border-crwn-gold/30 transition-colors w-fit">
                <ImagePlus className="w-4 h-4 text-crwn-text-secondary" />
                <span className="text-sm text-crwn-text-secondary">Add image</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleMediaSelect}
                  className="hidden"
                />
              </label>
            )}
            <p className="text-xs text-crwn-text-secondary mt-1">JPEG, PNG, GIF, or WebP. Max 5MB.</p>
          </div>

          <div className="flex items-start gap-2 p-3 bg-crwn-elevated/50 rounded-lg">
            <AlertCircle className="w-4 h-4 text-crwn-text-secondary shrink-0 mt-0.5" />
            <div className="text-xs text-crwn-text-secondary space-y-1">
              <p>Fans in quiet hours (9pm-9am local) will be skipped.</p>
              <p>Fans at their monthly limit ({MAX_SMS_PER_FAN_PER_MONTH}/mo) will be skipped.</p>
              {mediaFile && <p>MMS messages cost more than SMS — each counts as 1 message toward your quota.</p>}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowCompose(false)}
              className="px-4 py-2 rounded-full text-sm font-medium text-crwn-text-secondary hover:text-crwn-text transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={isSending || !smsCategory || !smsMessage.trim()}
              className="flex items-center gap-2 px-4 py-2.5 bg-crwn-gold text-crwn-bg rounded-full text-sm font-semibold hover:bg-crwn-gold/90 disabled:opacity-40 transition-colors"
            >
              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {isUploading ? 'Uploading...' : mediaFile ? 'Send MMS' : 'Send'}
            </button>
          </div>
        </div>
      )}

      {/* Subscriber List */}
      {subscribers.length > 0 && (
        <div className="bg-crwn-card rounded-xl border border-crwn-elevated overflow-hidden">
          <div className="px-4 py-3 border-b border-crwn-elevated">
            <h3 className="text-sm font-medium text-crwn-text">SMS Subscribers ({subscribers.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-crwn-elevated">
                  <th className="px-4 py-2 text-left text-xs font-medium text-crwn-text-secondary">Phone</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-crwn-text-secondary">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-crwn-text-secondary">Location</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-crwn-text-secondary">This Month</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-crwn-text-secondary">Opted In</th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map(sub => (
                  <tr key={sub.id} className="border-b border-crwn-elevated/50">
                    <td className="px-4 py-2 text-sm text-crwn-text font-mono">{sub.phone_number}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        sub.status === 'active' ? 'bg-green-500/10 text-green-400' :
                        sub.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400' :
                        'bg-red-500/10 text-red-400'
                      }`}>
                        {sub.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm text-crwn-text-secondary">
                      {[sub.city, sub.state].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-2 text-sm text-crwn-text">
                      {sub.monthly_receive_count}/{MAX_SMS_PER_FAN_PER_MONTH}
                    </td>
                    <td className="px-4 py-2 text-sm text-crwn-text-secondary whitespace-nowrap">
                      {sub.opted_in_at ? new Date(sub.opted_in_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
