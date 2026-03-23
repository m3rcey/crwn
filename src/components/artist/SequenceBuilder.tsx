'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/shared/Toast';
import { ArrowLeft, Plus, Trash2, Save, Loader2, GripVertical } from 'lucide-react';

interface Step {
  id?: string;
  delay_days: number;
  subject: string;
  body: string;
}

interface SequenceBuilderProps {
  artistId: string;
  sequenceId: string | null;
  onBack: () => void;
  onSaved: () => void;
}

const PLACEHOLDER_STEPS: { delay: number; subject: string; body: string }[] = [
  { delay: 0, subject: "Welcome to {{tier_name}}, {{first_name}}!", body: "Thanks for joining! Here's what you've unlocked as a {{tier_name}} member..." },
  { delay: 3, subject: "Here's what you get, {{first_name}}", body: "As a {{tier_name}} subscriber, you have access to exclusive tracks, community posts, and more. Here's a quick tour..." },
  { delay: 7, subject: "Your first exclusive drop", body: "Hey {{first_name}} — check out {{latest_release}}, available now for {{tier_name}} members." },
];

export function SequenceBuilder({ artistId, sequenceId, onBack, onSaved }: SequenceBuilderProps) {
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState('new_subscription');
  const [steps, setSteps] = useState<Step[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(!!sequenceId);

  // Load existing sequence
  useEffect(() => {
    if (!sequenceId) {
      setIsLoading(false);
      return;
    }
    async function load() {
      try {
        const res = await fetch(`/api/sequences?artistId=${artistId}`);
        const json = await res.json();
        const seq = (json.sequences || []).find((s: any) => s.id === sequenceId);
        if (seq) {
          setName(seq.name);
          setTriggerType(seq.trigger_type);
          setSteps(
            seq.steps.map((s: any) => ({
              id: s.id,
              delay_days: s.delay_days,
              subject: s.subject,
              body: s.body,
            }))
          );
        }
      } catch {
        showToast('Failed to load sequence', 'error');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [sequenceId, artistId, showToast]);

  const addStep = () => {
    const lastDelay = steps.length > 0 ? steps[steps.length - 1].delay_days : 0;
    setSteps([...steps, { delay_days: lastDelay + 3, subject: '', body: '' }]);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const updateStep = (index: number, field: keyof Step, value: string | number) => {
    setSteps(steps.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const moveStep = (from: number, to: number) => {
    if (to < 0 || to >= steps.length) return;
    const newSteps = [...steps];
    const [moved] = newSteps.splice(from, 1);
    newSteps.splice(to, 0, moved);
    setSteps(newSteps);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      showToast('Sequence name is required', 'error');
      return;
    }
    if (steps.length === 0) {
      showToast('Add at least one step', 'error');
      return;
    }
    for (const step of steps) {
      if (!step.subject.trim() || !step.body.trim()) {
        showToast('All steps need a subject and body', 'error');
        return;
      }
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: sequenceId,
          artistId,
          name: name.trim(),
          triggerType,
          steps: steps.map(s => ({
            delay_days: s.delay_days,
            subject: s.subject.trim(),
            body: s.body.trim(),
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');
      showToast('Sequence saved', 'success');
      onSaved();
    } catch (err: any) {
      showToast(err.message || 'Failed to save', 'error');
    } finally {
      setIsSaving(false);
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
            {sequenceId ? 'Edit Sequence' : 'New Sequence'}
          </h2>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-4 py-2.5 bg-crwn-gold text-crwn-bg rounded-full text-sm font-semibold hover:bg-crwn-gold/90 disabled:opacity-40 transition-colors"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </button>
      </div>

      {/* Sequence settings */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-crwn-text-secondary mb-1.5">Sequence Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Welcome Series"
            className="w-full px-4 py-2.5 bg-crwn-card border border-crwn-elevated rounded-xl text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-crwn-text-secondary mb-1.5">Trigger</label>
          <select
            value={triggerType}
            onChange={e => setTriggerType(e.target.value)}
            className="w-full px-4 py-2.5 bg-crwn-card border border-crwn-elevated rounded-xl text-sm text-crwn-text focus:outline-none focus:border-crwn-gold/50"
          >
            <option value="new_subscription">New Subscription</option>
            <option value="new_purchase">New Purchase</option>
            <option value="tier_upgrade">Tier Upgrade</option>
          </select>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-crwn-text">
            Steps ({steps.length})
          </h3>
          <button
            onClick={addStep}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add Step
          </button>
        </div>

        {steps.length === 0 && (
          <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-6 text-center">
            <p className="text-sm text-crwn-text-secondary mb-3">No steps yet. Here's a template to get started:</p>
            <button
              onClick={() => setSteps(PLACEHOLDER_STEPS.map(p => ({ delay_days: p.delay, subject: p.subject, body: p.body })))}
              className="px-4 py-2 bg-crwn-elevated rounded-lg text-xs font-medium text-crwn-text hover:text-crwn-gold transition-colors"
            >
              Use Welcome Template (3 steps)
            </button>
          </div>
        )}

        {steps.map((step, index) => (
          <div key={index} className="bg-crwn-card rounded-xl border border-crwn-elevated p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => moveStep(index, index - 1)}
                  disabled={index === 0}
                  className="p-1 text-crwn-text-secondary hover:text-crwn-text disabled:opacity-20 transition-colors"
                >
                  <GripVertical className="w-4 h-4" />
                </button>
              </div>
              <span className="text-xs font-medium text-crwn-gold">Step {index + 1}</span>
              <div className="flex items-center gap-2 flex-1">
                <span className="text-xs text-crwn-text-secondary">Send after</span>
                <input
                  type="number"
                  min="0"
                  value={step.delay_days}
                  onChange={e => updateStep(index, 'delay_days', parseInt(e.target.value) || 0)}
                  className="w-16 px-2 py-1 bg-crwn-elevated border border-crwn-elevated rounded-lg text-xs text-crwn-text text-center focus:outline-none focus:border-crwn-gold/50"
                />
                <span className="text-xs text-crwn-text-secondary">day{step.delay_days !== 1 ? 's' : ''}</span>
              </div>
              <button
                onClick={() => removeStep(index)}
                className="p-1.5 text-crwn-text-secondary hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <input
              type="text"
              value={step.subject}
              onChange={e => updateStep(index, 'subject', e.target.value)}
              placeholder="Subject line (supports {{first_name}}, {{tier_name}}, etc.)"
              className="w-full px-3 py-2 bg-crwn-elevated border border-crwn-elevated rounded-lg text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
            />

            <textarea
              value={step.body}
              onChange={e => updateStep(index, 'body', e.target.value)}
              rows={4}
              placeholder="Email body (supports personalization tokens)"
              className="w-full px-3 py-2 bg-crwn-elevated border border-crwn-elevated rounded-lg text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50 resize-y"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
