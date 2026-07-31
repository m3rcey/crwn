'use client';

import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { ArrowLeft, Send, Save, Loader2, Plus, Bookmark } from 'lucide-react';

interface SavedSegment {
  id: string;
  name: string;
  filters: Record<string, string>;
  fan_count: number;
}

const TOKENS = [
  { key: '{{first_name}}', label: 'First Name' },
  { key: '{{full_name}}', label: 'Full Name' },
  { key: '{{tier_name}}', label: 'Tier' },
  { key: '{{artist_name}}', label: 'Artist Name' },
  { key: '{{city}}', label: 'City' },
  { key: '{{state}}', label: 'State' },
  { key: '{{sub_date}}', label: 'Sub Date' },
  { key: '{{days_subscribed}}', label: 'Days Subscribed' },
  { key: '{{total_spent}}', label: 'Total Spent' },
  { key: '{{referral_count}}', label: 'Referrals' },
  { key: '{{latest_release}}', label: 'Latest Release' },
];

interface CampaignComposerProps {
  artistId: string;
  campaignId: string | null;
  tiers: { id: string; name: string }[];
  onBack: () => void;
  onSent: () => void;
}

export function CampaignComposer({ artistId, campaignId, tiers, onBack, onSent }: CampaignComposerProps) {
  const { showToast } = useToast();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [subscribersOnly, setSubscribersOnly] = useState(false);
  const [locationFilter, setLocationFilter] = useState('');
  // 'fans' = platform fans (subscribers/purchasers). 'contacts' = imported fan contacts the
  // artist attested permission for. A new composer opened with ?audience=contacts (the launch
  // flow's "invite your imported fans") starts on contacts.
  const [audienceType, setAudienceType] = useState<'fans' | 'contacts'>(() => {
    if (typeof window === 'undefined' || campaignId) return 'fans';
    return new URLSearchParams(window.location.search).get('audience') === 'contacts' ? 'contacts' : 'fans';
  });
  const [testCount, setTestCount] = useState('');
  // Contact segments: the tags imports attach (patreon, patreon-tier:X, ...).
  // '' = all attested contacts. Counts shown so the artist knows the reach.
  const [contactTag, setContactTag] = useState('');
  const [contactTags, setContactTags] = useState<{ tag: string; count: number }[]>([]);

  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingCampaign, setIsLoadingCampaign] = useState(!!campaignId);
  const [savedId, setSavedId] = useState<string | null>(campaignId);
  const [segments, setSegments] = useState<SavedSegment[]>([]);

  // Distinct contact tags with counts, for the imported-contacts segment picker.
  useEffect(() => {
    if (audienceType !== 'contacts' || contactTags.length > 0) return;
    const supabase = createBrowserSupabaseClient();
    supabase
      .from('fan_contacts')
      .select('tags')
      .eq('artist_id', artistId)
      .eq('is_subscribed_email', true)
      .limit(5000)
      .then(({ data }) => {
        const counts = new Map<string, number>();
        for (const row of data ?? []) {
          const tags = Array.isArray(row.tags) ? row.tags : [];
          for (const t of tags) {
            if (typeof t === 'string' && t.trim()) counts.set(t, (counts.get(t) ?? 0) + 1);
          }
        }
        setContactTags([...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count));
      });
  }, [audienceType, artistId, contactTags.length]);

  // Load saved segments
  useEffect(() => {
    async function loadSegments() {
      try {
        const res = await fetch('/api/segments');
        const json = await res.json();
        setSegments(json.segments || []);
      } catch { /* silent */ }
    }
    loadSegments();
  }, []);

  // Load existing campaign if editing
  useEffect(() => {
    if (!campaignId) {
      setIsLoadingCampaign(false);
      return;
    }
    async function load() {
      try {
        const res = await fetch(`/api/campaigns?artistId=${artistId}`);
        const json = await res.json();
        const campaign = (json.campaigns || []).find((c: any) => c.id === campaignId);
        if (campaign) {
          setName(campaign.name);
          setSubject(campaign.subject || '');
          setBody(campaign.body);
          setTierFilter(campaign.filters?.tier || '');
          setSubscribersOnly(campaign.filters?.subscribersOnly || false);
          setLocationFilter(campaign.filters?.location || '');
          setAudienceType(campaign.filters?.audience === 'contacts' ? 'contacts' : 'fans');
          setTestCount(campaign.filters?.testCount ? String(campaign.filters.testCount) : '');
          setContactTag(typeof campaign.filters?.contactTag === 'string' ? campaign.filters.contactTag : '');
          setSavedId(campaign.id);
        }
      } catch {
        showToast('Failed to load campaign', 'error');
      } finally {
        setIsLoadingCampaign(false);
      }
    }
    load();
  }, [campaignId, artistId, showToast]);

  const insertToken = (token: string) => {
    const textarea = bodyRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newBody = body.substring(0, start) + token + body.substring(end);
    setBody(newBody);
    // Set cursor after token
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
    }, 0);
  };

  const buildFilters = () => {
    const filters: Record<string, unknown> = {};
    if (audienceType === 'contacts') {
      filters.audience = 'contacts';
      const n = Math.round(Number(testCount));
      if (Number.isFinite(n) && n > 0) filters.testCount = n;
      if (contactTag) filters.contactTag = contactTag;
      return filters; // fan filters do not apply to imported contacts
    }
    if (tierFilter) filters.tier = tierFilter;
    if (subscribersOnly) filters.subscribersOnly = true;
    if (locationFilter) filters.location = locationFilter;
    return filters;
  };

  const handleSave = async () => {
    if (!name.trim() || !body.trim()) {
      showToast('Name and body are required', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: savedId,
          artistId,
          name: name.trim(),
          subject: subject.trim(),
          body: body.trim(),
          filters: buildFilters(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');
      setSavedId(json.campaign.id);
      showToast('Campaign saved as draft', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to save', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSend = async () => {
    if (!name.trim() || !body.trim() || !subject.trim()) {
      showToast('Name, subject, and body are required', 'error');
      return;
    }

    // Save first if not saved
    let campaignIdToSend = savedId;
    if (!campaignIdToSend) {
      setIsSaving(true);
      try {
        const res = await fetch('/api/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            artistId,
            name: name.trim(),
            subject: subject.trim(),
            body: body.trim(),
            filters: buildFilters(),
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to save');
        campaignIdToSend = json.campaign.id;
        setSavedId(json.campaign.id);
      } catch (err: any) {
        showToast(err.message || 'Failed to save campaign', 'error');
        setIsSaving(false);
        return;
      } finally {
        setIsSaving(false);
      }
    } else {
      // Update before sending
      await handleSave();
    }

    setIsSending(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignIdToSend}/send`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to send');
      showToast(`Campaign sent to ${json.sent} fans`, 'success');
      onSent();
    } catch (err: any) {
      showToast(err.message || 'Failed to send', 'error');
    } finally {
      setIsSending(false);
    }
  };

  if (isLoadingCampaign) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-crwn-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg text-crwn-text-secondary hover:text-crwn-text transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-crwn-text">
            {savedId ? 'Edit Campaign' : 'New Campaign'}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={isSaving || isSending}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text disabled:opacity-40 transition-colors"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Draft
          </button>
          <button
            onClick={handleSend}
            disabled={isSaving || isSending || !name.trim() || !body.trim() || !subject.trim()}
            className="flex items-center gap-2 px-4 py-2.5 bg-crwn-gold text-crwn-bg rounded-full text-sm font-semibold hover:bg-crwn-gold/90 disabled:opacity-40 transition-colors"
          >
            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send Now
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main editor */}
        <div className="lg:col-span-2 space-y-4">
          <div>
            <label className="block text-xs font-medium text-crwn-text-secondary mb-1.5">Campaign Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. March Newsletter"
              className="w-full px-4 py-2.5 bg-crwn-surface border border-crwn-elevated rounded-xl text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-crwn-text-secondary mb-1.5">Subject Line</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="e.g. New music just dropped, {{first_name}}"
              className="w-full px-4 py-2.5 bg-crwn-surface border border-crwn-elevated rounded-xl text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-crwn-text-secondary mb-1.5">Body</label>
            {/* Token buttons */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {TOKENS.map(t => (
                <button
                  key={t.key}
                  onClick={() => insertToken(t.key)}
                  className="px-2.5 py-1 rounded-md text-xs font-medium bg-crwn-elevated text-crwn-text-secondary hover:text-crwn-gold hover:bg-crwn-gold/10 transition-colors"
                >
                  <Plus className="w-3 h-3 inline mr-0.5" />
                  {t.label}
                </button>
              ))}
            </div>
            <textarea
              ref={bodyRef}
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={12}
              placeholder="Write your email content here. Use personalization tokens above to customize for each fan."
              className="w-full px-4 py-3 bg-crwn-surface border border-crwn-elevated rounded-xl text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50 resize-y"
            />
          </div>
        </div>

        {/* Sidebar — audience targeting */}
        <div className="space-y-4">
          <div className="bg-crwn-surface rounded-xl border border-crwn-elevated p-4 space-y-4">
            <h3 className="text-sm font-medium text-crwn-text">Audience</h3>

            {/* Binary toggle: platform fans vs imported contacts. */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setAudienceType('fans')}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  audienceType === 'fans'
                    ? 'bg-crwn-gold/15 text-crwn-gold border border-crwn-gold/40'
                    : 'bg-crwn-elevated text-crwn-text-secondary border border-crwn-elevated'
                }`}
              >
                My CRWN fans
              </button>
              <button
                onClick={() => setAudienceType('contacts')}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  audienceType === 'contacts'
                    ? 'bg-crwn-gold/15 text-crwn-gold border border-crwn-gold/40'
                    : 'bg-crwn-elevated text-crwn-text-secondary border border-crwn-elevated'
                }`}
              >
                Imported contacts
              </button>
            </div>

            {audienceType === 'contacts' && (
              <div className="space-y-3">
                <p className="text-xs text-crwn-text-secondary">
                  Sends to contacts you imported with the permission confirmation, minus anyone
                  who unsubscribed or bounced. Contacts imported before that confirmation existed
                  are skipped until you re-import them.
                </p>
                {contactTags.length > 0 && (
                  <div>
                    <label className="block text-xs text-crwn-text-secondary mb-1">Segment</label>
                    <select
                      value={contactTag}
                      onChange={e => setContactTag(e.target.value)}
                      className="w-full px-3 py-2 bg-crwn-elevated border border-crwn-elevated rounded-lg text-sm text-crwn-text focus:outline-none focus:border-crwn-gold/50"
                    >
                      <option value="">All imported contacts</option>
                      {contactTags.map(t => (
                        <option key={t.tag} value={t.tag}>{t.tag} ({t.count})</option>
                      ))}
                    </select>
                    <p className="text-[11px] text-crwn-text-secondary mt-1">
                      Patreon imports arrive tagged by tier, so you can invite each group with its own message.
                    </p>
                  </div>
                )}
                <div>
                  <label className="block text-xs text-crwn-text-secondary mb-1">
                    Test group size (optional)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={testCount}
                    onChange={e => setTestCount(e.target.value)}
                    placeholder="e.g. 20. Blank sends to all"
                    className="w-full px-3 py-2 bg-crwn-elevated border border-crwn-elevated rounded-lg text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
                  />
                  <p className="text-[11px] text-crwn-text-secondary mt-1">
                    Start small: send to a test group first, read the replies, then send to the
                    rest.
                  </p>
                </div>
              </div>
            )}

            {/* Saved segments quick-pick */}
            {audienceType === 'fans' && segments.length > 0 && (
              <div>
                <label className="block text-xs text-crwn-text-secondary mb-1">
                  <Bookmark className="w-3 h-3 inline mr-1" />
                  Saved Segments
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {segments.map(seg => (
                    <button
                      key={seg.id}
                      onClick={() => {
                        setTierFilter(seg.filters.tier || '');
                        setLocationFilter(seg.filters.location || '');
                        setSubscribersOnly(!!seg.filters.subscribersOnly);
                      }}
                      className="px-2.5 py-1 rounded-md text-xs font-medium bg-crwn-elevated text-crwn-text-secondary hover:text-crwn-gold hover:bg-crwn-gold/10 transition-colors"
                    >
                      {seg.name}
                      <span className="ml-1 opacity-50">({seg.fan_count})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {audienceType === 'fans' && (
              <>
                <div>
                  <label className="block text-xs text-crwn-text-secondary mb-1">Tier</label>
                  <select
                    value={tierFilter}
                    onChange={e => setTierFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-crwn-elevated border border-crwn-elevated rounded-lg text-sm text-crwn-text focus:outline-none focus:border-crwn-gold/50"
                  >
                    <option value="">All fans</option>
                    {tiers.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-crwn-text-secondary mb-1">Location</label>
                  <input
                    type="text"
                    value={locationFilter}
                    onChange={e => setLocationFilter(e.target.value)}
                    placeholder="City or state..."
                    className="w-full px-3 py-2 bg-crwn-elevated border border-crwn-elevated rounded-lg text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
                  />
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={subscribersOnly}
                    onChange={e => setSubscribersOnly(e.target.checked)}
                    className="rounded border-crwn-elevated text-crwn-gold focus:ring-crwn-gold/50"
                  />
                  <span className="text-xs text-crwn-text-secondary">Active subscribers only</span>
                </label>
              </>
            )}
          </div>

          <div className="bg-crwn-surface rounded-xl border border-crwn-elevated p-4">
            <h3 className="text-sm font-medium text-crwn-text mb-2">Personalization Tips</h3>
            <ul className="space-y-1.5 text-xs text-crwn-text-secondary">
              <li>Use <code className="text-crwn-gold">{'{{first_name}}'}</code> in subject for higher open rates</li>
              <li>Add fallbacks: <code className="text-crwn-gold">{'{{city|"your area"}}'}</code></li>
              <li>Include a clear call-to-action link</li>
              <li>Keep it personal and concise</li>
            </ul>
          </div>

          <div className="bg-crwn-surface rounded-xl border border-crwn-elevated p-4">
            <h3 className="text-sm font-medium text-crwn-text mb-2">Limits</h3>
            <ul className="space-y-1 text-xs text-crwn-text-secondary">
              <li>Max 2 campaigns per week</li>
              <li>Max 8 campaigns per month</li>
              <li>Fans who unsubscribed are excluded</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
