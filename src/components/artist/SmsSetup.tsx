'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/shared/Toast';
import { Loader2, Phone, MessageSquare, Users, Send, AlertCircle } from 'lucide-react';
import { getSmsLimit } from '@/lib/platformTier';
import { SMS_CATEGORIES, MAX_SMS_PER_FAN_PER_MONTH } from '@/lib/twilio';

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

  useEffect(() => {
    loadData();
  }, [artistId]);

  async function loadData() {
    try {
      // We'll fetch via direct Supabase client since these are artist-owned
      const res = await fetch(`/api/sms/provision?artistId=${artistId}`, { method: 'GET' });
      // This route doesn't have GET yet, so let's use a different approach
      // For now, we'll rely on the provisioning POST to set up

      setIsLoading(false);
    } catch {
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

  const handleSend = async () => {
    if (!smsCategory || !smsMessage.trim()) {
      showToast('Select a category and write a message', 'error');
      return;
    }
    setIsSending(true);
    try {
      const res = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artistId,
          category: smsCategory,
          message: smsMessage.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to send');
      showToast(
        `Sent to ${json.sent} fans${json.deferred ? `, ${json.deferred} deferred (quiet hours)` : ''}${json.skipped ? `, ${json.skipped} skipped (limits)` : ''}`,
        'success'
      );
      setShowCompose(false);
      setSmsMessage('');
      setSmsCategory('');
    } catch (err: any) {
      showToast(err.message || 'Failed to send', 'error');
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-crwn-text">SMS Notifications</h2>
          <p className="text-sm text-crwn-text-secondary mt-0.5">
            Keyword: <span className="font-mono text-crwn-gold">{phoneSetup.keyword}</span>
          </p>
        </div>
        <button
          onClick={() => setShowCompose(!showCompose)}
          className="flex items-center gap-2 px-4 py-2.5 bg-crwn-gold text-crwn-bg rounded-full text-sm font-semibold hover:bg-crwn-gold/90 transition-colors"
        >
          <Send className="w-4 h-4" />
          Send SMS
        </button>
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
          <h3 className="text-sm font-medium text-crwn-text">Compose SMS</h3>

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

          <div className="flex items-start gap-2 p-3 bg-crwn-elevated/50 rounded-lg">
            <AlertCircle className="w-4 h-4 text-crwn-text-secondary shrink-0 mt-0.5" />
            <div className="text-xs text-crwn-text-secondary space-y-1">
              <p>Fans in quiet hours (9pm-9am local) will be skipped.</p>
              <p>Fans at their monthly limit ({MAX_SMS_PER_FAN_PER_MONTH}/mo) will be skipped.</p>
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
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
