'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Loader2, Tag, Copy, Check } from 'lucide-react';
import { useToast } from '@/components/shared/Toast';

interface DiscountCode {
  id: string;
  code: string;
  description: string | null;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  applies_to: 'all' | 'subscription' | 'product';
  max_uses: number | null;
  uses_count: number;
  max_uses_per_fan: number;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

interface DiscountCodeManagerProps {
  artistId: string;
  onBack: () => void;
}

interface FormData {
  code: string;
  description: string;
  discountType: 'percent' | 'fixed';
  discountValue: string;
  appliesTo: 'all' | 'subscription' | 'product';
  maxUses: string;
  maxUsesPerFan: string;
  expiresAt: string;
}

const EMPTY_FORM: FormData = {
  code: '',
  description: '',
  discountType: 'percent',
  discountValue: '',
  appliesTo: 'all',
  maxUses: '',
  maxUsesPerFan: '1',
  expiresAt: '',
};

export function DiscountCodeManager({ artistId, onBack }: DiscountCodeManagerProps) {
  const { showToast } = useToast();
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadCodes = useCallback(async () => {
    try {
      const res = await fetch(`/api/discount-codes?artistId=${artistId}`);
      const json = await res.json();
      setCodes(json.codes || []);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [artistId]);

  useEffect(() => { loadCodes(); }, [loadCodes]);

  const handleSave = async () => {
    if (!formData.code.trim()) {
      showToast('Code is required', 'error');
      return;
    }
    if (!formData.discountValue || Number(formData.discountValue) <= 0) {
      showToast('Discount value is required', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/discount-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artistId,
          code: formData.code,
          description: formData.description || null,
          discountType: formData.discountType,
          discountValue: formData.discountType === 'percent'
            ? parseInt(formData.discountValue)
            : Math.round(parseFloat(formData.discountValue) * 100),
          appliesTo: formData.appliesTo,
          maxUses: formData.maxUses ? parseInt(formData.maxUses) : null,
          maxUsesPerFan: parseInt(formData.maxUsesPerFan) || 1,
          expiresAt: formData.expiresAt || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');
      showToast('Discount code created', 'success');
      setFormData(EMPTY_FORM);
      setShowForm(false);
      await loadCodes();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save';
      showToast(message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch('/api/discount-codes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, artistId }),
      });
      if (!res.ok) throw new Error('Failed to delete');
      showToast('Code deactivated', 'success');
      await loadCodes();
    } catch {
      showToast('Failed to deactivate', 'error');
    }
  };

  const handleCopy = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatDiscount = (code: DiscountCode) => {
    if (code.discount_type === 'percent') return `${code.discount_value}% off`;
    return `$${(code.discount_value / 100).toFixed(2)} off`;
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
          <h2 className="text-lg font-semibold text-crwn-text">Discount Codes</h2>
          <p className="text-sm text-crwn-text-secondary mt-0.5">Create promo codes for subscriptions and products</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2.5 bg-crwn-gold text-crwn-bg rounded-full text-sm font-semibold hover:bg-crwn-gold/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Code
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-crwn-text-secondary mb-1.5">Code</label>
              <input
                type="text"
                value={formData.code}
                onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
                placeholder="e.g. WELCOME20"
                maxLength={20}
                className="w-full px-4 py-2.5 bg-crwn-elevated border border-crwn-elevated rounded-xl text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50 uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-crwn-text-secondary mb-1.5">Description</label>
              <input
                type="text"
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="e.g. 20% off first month"
                className="w-full px-4 py-2.5 bg-crwn-elevated border border-crwn-elevated rounded-xl text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-crwn-text-secondary mb-1.5">Type</label>
              <select
                value={formData.discountType}
                onChange={e => setFormData({ ...formData, discountType: e.target.value as 'percent' | 'fixed' })}
                className="w-full px-3 py-2.5 bg-crwn-elevated border border-crwn-elevated rounded-xl text-sm text-crwn-text focus:outline-none focus:border-crwn-gold/50"
              >
                <option value="percent">Percent</option>
                <option value="fixed">Fixed ($)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-crwn-text-secondary mb-1.5">
                {formData.discountType === 'percent' ? 'Percent Off' : 'Amount Off ($)'}
              </label>
              <input
                type="number"
                value={formData.discountValue}
                onChange={e => setFormData({ ...formData, discountValue: e.target.value })}
                placeholder={formData.discountType === 'percent' ? '20' : '5.00'}
                min="1"
                max={formData.discountType === 'percent' ? '100' : undefined}
                className="w-full px-3 py-2.5 bg-crwn-elevated border border-crwn-elevated rounded-xl text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-crwn-text-secondary mb-1.5">Applies To</label>
              <select
                value={formData.appliesTo}
                onChange={e => setFormData({ ...formData, appliesTo: e.target.value as 'all' | 'subscription' | 'product' })}
                className="w-full px-3 py-2.5 bg-crwn-elevated border border-crwn-elevated rounded-xl text-sm text-crwn-text focus:outline-none focus:border-crwn-gold/50"
              >
                <option value="all">All</option>
                <option value="subscription">Subscriptions</option>
                <option value="product">Products</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-crwn-text-secondary mb-1.5">Max Uses</label>
              <input
                type="number"
                value={formData.maxUses}
                onChange={e => setFormData({ ...formData, maxUses: e.target.value })}
                placeholder="Unlimited"
                min="1"
                className="w-full px-3 py-2.5 bg-crwn-elevated border border-crwn-elevated rounded-xl text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-crwn-text-secondary mb-1.5">Expires At</label>
              <input
                type="datetime-local"
                value={formData.expiresAt}
                onChange={e => setFormData({ ...formData, expiresAt: e.target.value })}
                className="w-full px-3 py-2.5 bg-crwn-elevated border border-crwn-elevated rounded-xl text-sm text-crwn-text focus:outline-none focus:border-crwn-gold/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-crwn-text-secondary mb-1.5">Uses Per Fan</label>
              <input
                type="number"
                value={formData.maxUsesPerFan}
                onChange={e => setFormData({ ...formData, maxUsesPerFan: e.target.value })}
                min="1"
                className="w-full px-3 py-2.5 bg-crwn-elevated border border-crwn-elevated rounded-xl text-sm text-crwn-text focus:outline-none focus:border-crwn-gold/50"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setShowForm(false); setFormData(EMPTY_FORM); }}
              className="px-4 py-2 rounded-full text-sm font-medium text-crwn-text-secondary hover:text-crwn-text transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2.5 bg-crwn-gold text-crwn-bg rounded-full text-sm font-semibold hover:bg-crwn-gold/90 disabled:opacity-40 transition-colors"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Create Code
            </button>
          </div>
        </div>
      )}

      {/* Code List */}
      {codes.length === 0 && !showForm ? (
        <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-12 text-center">
          <Tag className="w-10 h-10 text-crwn-text-secondary mx-auto mb-3" />
          <p className="text-crwn-text font-medium mb-1">No discount codes yet</p>
          <p className="text-sm text-crwn-text-secondary mb-4">
            Create promo codes to drive subscriptions and sales.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {codes.map(code => (
            <div
              key={code.id}
              className={`bg-crwn-card rounded-xl border border-crwn-elevated p-4 ${!code.is_active ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-mono font-semibold text-crwn-gold">{code.code}</span>
                    <button
                      onClick={() => handleCopy(code.code, code.id)}
                      className="p-1 text-crwn-text-secondary hover:text-crwn-text transition-colors"
                      title="Copy code"
                    >
                      {copiedId === code.id ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      code.is_active ? 'bg-green-500/10 text-green-400' : 'bg-crwn-elevated text-crwn-text-secondary'
                    }`}>
                      {code.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-crwn-text-secondary">
                    <span>{formatDiscount(code)}</span>
                    <span>{code.applies_to === 'all' ? 'All' : code.applies_to === 'subscription' ? 'Subs only' : 'Products only'}</span>
                    <span>{code.uses_count}{code.max_uses ? `/${code.max_uses}` : ''} uses</span>
                    {code.expires_at && (
                      <span>Expires {new Date(code.expires_at).toLocaleDateString()}</span>
                    )}
                    {code.description && <span>{code.description}</span>}
                  </div>
                </div>
                {code.is_active && (
                  <button
                    onClick={() => handleDelete(code.id)}
                    className="p-2 text-crwn-text-secondary hover:text-red-400 transition-colors"
                    title="Deactivate"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
