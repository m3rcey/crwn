'use client';

import { useState, useEffect } from 'react';
import {
  Zap, Power, PowerOff, Loader2, Users, CheckCircle, ArrowLeft,
  Save, Plus, Trash2, ChevronDown, ChevronUp,
} from 'lucide-react';

interface Step {
  delay_days: number;
  subject: string;
  body: string;
}

interface Sequence {
  id: string;
  name: string;
  trigger_type: string;
  is_active: boolean;
  steps: Step[];
  enrollments: { active: number; completed: number; canceled: number };
}

const TRIGGER_LABELS: Record<string, string> = {
  new_signup: 'New Signup',
  onboarding_incomplete: 'Onboarding Incomplete',
  starter_upgrade_nudge: 'Starter → Pro Upgrade',
  paid_at_risk: 'Paid At Risk',
  paid_churned: 'Paid Churned (Win-Back)',
  upgrade_abandoned: 'Upgrade Abandoned',
  loyalty_survey: 'Loyalty Survey (Long-Term Artists)',
};

const TOKENS = [
  '{{first_name}}', '{{full_name}}', '{{artist_slug}}', '{{platform_tier}}',
  '{{dashboard_url}}', '{{connect_stripe_url}}', '{{upgrade_url}}',
];

export default function PlatformSequences() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Editor state
  const [editingSeq, setEditingSeq] = useState<Sequence | null>(null);
  const [editName, setEditName] = useState('');
  const [editSteps, setEditSteps] = useState<Step[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const loadSequences = async () => {
    try {
      const res = await fetch('/api/admin/platform-sequences');
      const json = await res.json();
      setSequences(json.sequences || []);
    } catch { /* silent */ }
    finally { setIsLoading(false); }
  };

  useEffect(() => { loadSequences(); }, []);

  const handleToggle = async (id: string) => {
    setTogglingId(id);
    try {
      const res = await fetch('/api/admin/platform-sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'toggle' }),
      });
      if (res.ok) await loadSequences();
    } catch { /* silent */ }
    finally { setTogglingId(null); }
  };

  const handleEdit = (seq: Sequence) => {
    setEditingSeq(seq);
    setEditName(seq.name);
    setEditSteps(seq.steps.map(s => ({ delay_days: s.delay_days, subject: s.subject, body: s.body })));
    setSaveMessage('');
  };

  const handleSave = async () => {
    if (!editingSeq) return;
    for (const step of editSteps) {
      if (!step.subject.trim() || !step.body.trim()) {
        setSaveMessage('All steps need a subject and body');
        return;
      }
    }
    setIsSaving(true);
    setSaveMessage('');
    try {
      const res = await fetch('/api/admin/platform-sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingSeq.id,
          action: 'update_steps',
          name: editName.trim(),
          steps: editSteps,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setSaveMessage('Saved');
      await loadSequences();
      // Update local editingSeq
      const updated = sequences.find(s => s.id === editingSeq.id);
      if (updated) setEditingSeq({ ...updated, steps: editSteps });
    } catch {
      setSaveMessage('Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const addStep = () => {
    const lastDelay = editSteps.length > 0 ? editSteps[editSteps.length - 1].delay_days : 0;
    setEditSteps([...editSteps, { delay_days: lastDelay + 3, subject: '', body: '' }]);
  };

  const removeStep = (idx: number) => {
    setEditSteps(editSteps.filter((_, i) => i !== idx));
  };

  const updateStep = (idx: number, field: keyof Step, value: string | number) => {
    setEditSteps(editSteps.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-crwn-gold" />
      </div>
    );
  }

  // Editor view
  if (editingSeq) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setEditingSeq(null)} className="p-2 rounded-lg text-crwn-text-secondary hover:text-crwn-text transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-crwn-text">Edit Sequence</h2>
            <p className="text-xs text-crwn-text-secondary">{TRIGGER_LABELS[editingSeq.trigger_type] || editingSeq.trigger_type}</p>
          </div>
          <div className="flex items-center gap-2">
            {saveMessage && (
              <span className={`text-xs ${saveMessage === 'Saved' ? 'text-green-400' : 'text-red-400'}`}>{saveMessage}</span>
            )}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2.5 bg-crwn-gold text-crwn-bg rounded-full text-sm font-semibold hover:bg-crwn-gold/90 disabled:opacity-40 transition-colors"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
          </div>
        </div>

        {/* Sequence name */}
        <div>
          <label className="block text-xs font-medium text-crwn-text-secondary mb-1.5">Sequence Name</label>
          <input
            type="text"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            className="w-full px-4 py-2.5 bg-crwn-card border border-crwn-elevated rounded-xl text-sm text-crwn-text focus:outline-none focus:border-crwn-gold/50"
          />
        </div>

        {/* Available tokens */}
        <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-3">
          <p className="text-xs text-crwn-text-secondary mb-2">Available tokens:</p>
          <div className="flex flex-wrap gap-1.5">
            {TOKENS.map(t => (
              <span key={t} className="px-2 py-0.5 bg-crwn-elevated rounded text-xs font-mono text-crwn-gold">{t}</span>
            ))}
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-crwn-text">Steps ({editSteps.length})</h3>
            <button
              onClick={addStep}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text transition-colors"
            >
              <Plus className="w-3 h-3" /> Add Step
            </button>
          </div>

          {editSteps.map((step, idx) => (
            <div key={idx} className="bg-crwn-card rounded-xl border border-crwn-elevated p-4 space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-crwn-gold">Step {idx + 1}</span>
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-xs text-crwn-text-secondary">Send after</span>
                  <input
                    type="number"
                    min="0"
                    value={step.delay_days}
                    onChange={e => updateStep(idx, 'delay_days', parseInt(e.target.value) || 0)}
                    className="w-16 px-2 py-1 bg-crwn-elevated border border-crwn-elevated rounded-lg text-xs text-crwn-text text-center focus:outline-none focus:border-crwn-gold/50"
                  />
                  <span className="text-xs text-crwn-text-secondary">day{step.delay_days !== 1 ? 's' : ''}</span>
                </div>
                <button onClick={() => removeStep(idx)} className="p-1.5 text-crwn-text-secondary hover:text-red-400 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <input
                type="text"
                value={step.subject}
                onChange={e => updateStep(idx, 'subject', e.target.value)}
                placeholder="Subject line"
                className="w-full px-3 py-2 bg-crwn-elevated border border-crwn-elevated rounded-lg text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
              />

              <textarea
                value={step.body}
                onChange={e => updateStep(idx, 'body', e.target.value)}
                rows={6}
                placeholder="Email body"
                className="w-full px-3 py-2 bg-crwn-elevated border border-crwn-elevated rounded-lg text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50 resize-y"
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-crwn-text">Platform Sequences</h2>
        <p className="text-sm text-crwn-text-secondary mt-0.5">Automated emails from CRWN to artists based on lifecycle stage</p>
      </div>

      <div className="space-y-3">
        {sequences.map(seq => (
          <div key={seq.id} className="bg-crwn-card rounded-xl border border-crwn-elevated p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-medium text-crwn-text truncate">{seq.name}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    seq.is_active ? 'bg-green-500/10 text-green-400' : 'bg-crwn-elevated text-crwn-text-secondary'
                  }`}>
                    {seq.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-crwn-text-secondary">
                  <span>Trigger: {TRIGGER_LABELS[seq.trigger_type] || seq.trigger_type}</span>
                  <span>{seq.steps.length} email{seq.steps.length !== 1 ? 's' : ''}</span>
                </div>
                {(seq.enrollments.active > 0 || seq.enrollments.completed > 0) && (
                  <div className="flex items-center gap-3 mt-2 text-xs">
                    {seq.enrollments.active > 0 && (
                      <span className="flex items-center gap-1 text-blue-400">
                        <Users className="w-3 h-3" /> {seq.enrollments.active} active
                      </span>
                    )}
                    {seq.enrollments.completed > 0 && (
                      <span className="flex items-center gap-1 text-green-400">
                        <CheckCircle className="w-3 h-3" /> {seq.enrollments.completed} completed
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
                  onClick={() => handleEdit(seq)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text transition-colors"
                >
                  Edit
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
