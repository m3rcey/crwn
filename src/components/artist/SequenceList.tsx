'use client';

import { useState, useEffect } from 'react';
import { Plus, Zap, Loader2, Users, CheckCircle, Power, PowerOff, Sparkles } from 'lucide-react';
import { useToast } from '@/components/shared/Toast';

// Welcome sequence template for one-click activation
const WELCOME_TEMPLATE = {
  name: 'Welcome Series',
  triggerType: 'new_subscription',
  steps: [
    { delay_days: 0, subject: "Welcome to {{tier_name}}, {{first_name}}!", body: "Thanks for joining! Here's what you've unlocked as a {{tier_name}} member:\n\n- Exclusive tracks and early releases\n- Community posts and updates\n- Direct connection with me\n\nCheck out my page to start exploring what's available to you." },
    { delay_days: 3, subject: "Here's what you get, {{first_name}}", body: "As a {{tier_name}} subscriber, you have access to exclusive tracks, community posts, and more. Here's a quick tour of what's waiting for you:\n\n1. Library — all your exclusive content in one place\n2. Community — posts, updates, and behind-the-scenes\n3. New drops — you'll be first to know\n\nDon't be a stranger — I love hearing from my supporters." },
    { delay_days: 7, subject: "Your first exclusive drop", body: "Hey {{first_name}} — check out the latest release, available now for {{tier_name}} members.\n\nI've been working hard on new content and I'm excited to share it with you. Keep an eye out for more coming soon." },
  ],
};

interface Sequence {
  id: string;
  name: string;
  trigger_type: string;
  is_active: boolean;
  steps: { id: string; step_number: number; delay_days: number; subject: string }[];
  enrollments: { active: number; completed: number; canceled: number };
  created_at: string;
}

interface SequenceListProps {
  artistId: string;
  onEdit: (id: string) => void;
  onNew: () => void;
}

const triggerLabels: Record<string, string> = {
  new_subscription: 'New Subscription',
  new_purchase: 'New Purchase',
  tier_upgrade: 'Tier Upgrade',
  post_purchase_upsell: 'Post-Purchase Upsell',
  win_back: 'Win-Back',
  inactive_subscriber: 'Inactive Subscriber',
  abandoned_cart: 'Abandoned Cart',
  loyalty_survey: 'Loyalty Survey',
};

export function SequenceList({ artistId, onEdit, onNew }: SequenceListProps) {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [activatingWelcome, setActivatingWelcome] = useState(false);
  const { showToast } = useToast();

  const loadSequences = async () => {
    try {
      const res = await fetch(`/api/sequences?artistId=${artistId}`);
      const json = await res.json();
      setSequences(json.sequences || []);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadSequences(); }, [artistId]);

  const hasWelcomeSequence = sequences.some(s => s.trigger_type === 'new_subscription');

  const handleQuickActivateWelcome = async () => {
    setActivatingWelcome(true);
    try {
      const res = await fetch('/api/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artistId,
          name: WELCOME_TEMPLATE.name,
          triggerType: WELCOME_TEMPLATE.triggerType,
          steps: WELCOME_TEMPLATE.steps,
          activate: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create');
      showToast('Welcome sequence activated! New subscribers will receive it automatically.', 'success');
      await loadSequences();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to activate', 'error');
    } finally {
      setActivatingWelcome(false);
    }
  };

  const handleToggle = async (id: string) => {
    setTogglingId(id);
    try {
      const res = await fetch(`/api/sequences/${id}/toggle`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to toggle');
      showToast(json.is_active ? 'Sequence activated' : 'Sequence deactivated', 'success');
      await loadSequences();
    } catch (err: any) {
      showToast(err.message || 'Failed to toggle', 'error');
    } finally {
      setTogglingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-crwn-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-crwn-text">Sequences</h2>
          <p className="text-sm text-crwn-text-secondary mt-0.5">Automated email drips triggered by fan actions</p>
        </div>
        <button
          onClick={onNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-crwn-gold text-crwn-bg rounded-full text-sm font-semibold hover:bg-crwn-gold/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Sequence
        </button>
      </div>

      {/* Quick-activate welcome sequence banner */}
      {!hasWelcomeSequence && (
        <div className="bg-crwn-gold/10 border border-crwn-gold/30 rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-crwn-gold/20 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-crwn-gold" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-crwn-text">Welcome new subscribers automatically</p>
              <p className="text-xs text-crwn-text-secondary">Activate a 3-email welcome series in one click — fans who get onboarded early stay 2x longer.</p>
            </div>
          </div>
          <button
            onClick={handleQuickActivateWelcome}
            disabled={activatingWelcome}
            className="px-4 py-2 bg-crwn-gold text-crwn-bg rounded-full text-sm font-semibold hover:bg-crwn-gold/90 transition-colors flex-shrink-0 flex items-center gap-2"
          >
            {activatingWelcome ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Activate'
            )}
          </button>
        </div>
      )}

      {sequences.length === 0 ? (
        <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-12 text-center">
          <Zap className="w-10 h-10 text-crwn-text-secondary mx-auto mb-3" />
          <p className="text-crwn-text font-medium mb-1">No sequences yet</p>
          <p className="text-sm text-crwn-text-secondary mb-4">
            Create a welcome sequence to automatically engage new fans.
          </p>
          <button
            onClick={onNew}
            className="px-4 py-2.5 bg-crwn-gold text-crwn-bg rounded-full text-sm font-semibold hover:bg-crwn-gold/90 transition-colors"
          >
            Create Sequence
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sequences.map(seq => (
            <div
              key={seq.id}
              className="bg-crwn-card rounded-xl border border-crwn-elevated p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-medium text-crwn-text truncate">{seq.name}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      seq.is_active
                        ? 'bg-green-500/10 text-green-400'
                        : 'bg-crwn-elevated text-crwn-text-secondary'
                    }`}>
                      {seq.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-crwn-text-secondary">
                    <span>Trigger: {triggerLabels[seq.trigger_type] || seq.trigger_type}</span>
                    <span>{seq.steps.length} step{seq.steps.length !== 1 ? 's' : ''}</span>
                  </div>
                  {(seq.enrollments.active > 0 || seq.enrollments.completed > 0) && (
                    <div className="flex items-center gap-3 mt-2 text-xs">
                      {seq.enrollments.active > 0 && (
                        <span className="flex items-center gap-1 text-blue-400">
                          <Users className="w-3 h-3" />
                          {seq.enrollments.active} active
                        </span>
                      )}
                      {seq.enrollments.completed > 0 && (
                        <span className="flex items-center gap-1 text-green-400">
                          <CheckCircle className="w-3 h-3" />
                          {seq.enrollments.completed} completed
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleToggle(seq.id)}
                    disabled={togglingId === seq.id}
                    className={`p-2 rounded-lg border transition-colors ${
                      seq.is_active
                        ? 'border-green-500/30 text-green-400 hover:bg-green-500/10'
                        : 'border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text'
                    }`}
                    title={seq.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {togglingId === seq.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : seq.is_active ? (
                      <Power className="w-4 h-4" />
                    ) : (
                      <PowerOff className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => onEdit(seq.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text transition-colors"
                  >
                    Edit
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
