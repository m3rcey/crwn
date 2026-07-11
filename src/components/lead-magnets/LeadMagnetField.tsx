'use client';

import { OptionSelect } from '@/components/ui/OptionSelect';
import type { LeadMagnetInputDefinition } from '@/lib/leadMagnets/types';
import { useState } from 'react';
import { X } from 'lucide-react';

type Value = string | number | boolean | string[] | null;

const INPUT_CLASS =
  'w-full bg-crwn-surface border border-crwn-elevated rounded-xl px-4 py-4 text-lg text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold';

// Renders one input from its definition. Controlled by the wizard engine.
export function LeadMagnetField({ def, value, onChange }: { def: LeadMagnetInputDefinition; value: Value; onChange: (v: Value) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-crwn-text mb-2">
        {def.label}
        {def.required && <span className="text-crwn-gold"> *</span>}
      </label>
      {def.help && <p className="text-xs text-crwn-text-secondary mb-3 -mt-1">{def.help}</p>}
      <FieldControl def={def} value={value} onChange={onChange} />
      {def.example && <p className="text-xs text-crwn-text-secondary mt-2">Example: {def.example}</p>}
    </div>
  );
}

function FieldControl({ def, value, onChange }: { def: LeadMagnetInputDefinition; value: Value; onChange: (v: Value) => void }) {
  switch (def.type) {
    case 'textarea':
      return (
        <textarea
          className={`${INPUT_CLASS} min-h-[120px] text-base`}
          placeholder={def.placeholder}
          maxLength={def.maxLength}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case 'number':
      return (
        <input
          type="number"
          inputMode="numeric"
          className={INPUT_CLASS}
          placeholder={def.placeholder ?? '0'}
          min={def.min}
          max={def.max}
          value={value === null || value === undefined || value === '' ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? null : Math.max(0, Math.floor(Number(e.target.value))))}
        />
      );

    case 'currency':
      return (
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-crwn-text-secondary">$</span>
          <input
            type="number"
            inputMode="decimal"
            className={`${INPUT_CLASS} pl-8`}
            placeholder={def.placeholder ?? '0'}
            min={def.min ?? 0}
            max={def.max}
            step="0.01"
            value={value === null || value === undefined || value === '' ? '' : String(value)}
            onChange={(e) => onChange(e.target.value === '' ? null : Math.max(0, Number(e.target.value)))}
          />
        </div>
      );

    case 'percentage':
      return (
        <div className="relative">
          <input
            type="number"
            inputMode="decimal"
            className={`${INPUT_CLASS} pr-10`}
            placeholder={def.placeholder ?? '0'}
            min={0}
            max={100}
            value={value === null || value === undefined || value === '' ? '' : String(value)}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-lg text-crwn-text-secondary">%</span>
        </div>
      );

    case 'date':
      return (
        <input
          type="date"
          className={INPUT_CLASS}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );

    case 'url':
    case 'email':
    case 'phone':
    case 'text':
      return (
        <input
          type={def.type === 'url' ? 'url' : def.type === 'email' ? 'email' : def.type === 'phone' ? 'tel' : 'text'}
          className={INPUT_CLASS}
          placeholder={def.placeholder}
          maxLength={def.maxLength}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case 'toggle':
      return (
        <div className="flex gap-3">
          {[
            { v: true, label: 'Yes' },
            { v: false, label: 'No' },
          ].map((o) => (
            <button
              key={String(o.v)}
              type="button"
              onClick={() => onChange(o.v)}
              className={`flex-1 py-3 rounded-full text-sm font-semibold border ${
                value === o.v ? 'bg-crwn-gold text-crwn-bg border-crwn-gold' : 'border-crwn-elevated text-crwn-text-secondary'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      );

    case 'binary':
      return (
        <div className="flex gap-3">
          {(def.options || []).slice(0, 2).map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`flex-1 py-3 rounded-full text-sm font-semibold border ${
                value === o.value ? 'bg-crwn-gold text-crwn-bg border-crwn-gold' : 'border-crwn-elevated text-crwn-text-secondary'
              }`}
            >
              {o.icon ? `${o.icon} ` : ''}
              {o.label}
            </button>
          ))}
        </div>
      );

    case 'option':
      return (
        <OptionSelect
          options={(def.options || []).map((o) => ({ value: o.value, label: o.label, hint: o.hint, icon: o.icon }))}
          value={typeof value === 'string' ? value : null}
          onChange={(v) => onChange(v)}
          placeholder={def.placeholder ?? 'Choose one'}
        />
      );

    case 'checkboxGroup':
      return <CheckboxGroup def={def} value={Array.isArray(value) ? value : []} onChange={onChange} />;

    case 'tags':
      return <TagsInput value={Array.isArray(value) ? value : []} onChange={onChange} placeholder={def.placeholder} />;

    default:
      return null;
  }
}

function CheckboxGroup({ def, value, onChange }: { def: LeadMagnetInputDefinition; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (v: string) => (value.includes(v) ? onChange(value.filter((x) => x !== v)) : onChange([...value, v]));
  return (
    <div className="grid grid-cols-2 gap-2">
      {(def.options || []).map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm ${
              on ? 'border-crwn-gold bg-crwn-gold/10 text-crwn-text' : 'border-crwn-elevated text-crwn-text-secondary'
            }`}
          >
            {o.icon && <span className="text-lg">{o.icon}</span>}
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function TagsInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const t = draft.trim().replace(/^#/, '');
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft('');
  };
  return (
    <div>
      <div className="flex gap-2">
        <input
          className={INPUT_CLASS}
          placeholder={placeholder ?? 'Add and press enter'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" onClick={add} className="px-4 rounded-xl bg-crwn-elevated text-crwn-text text-sm font-medium">
          Add
        </button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {value.map((t) => (
            <span key={t} className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-crwn-gold/10 text-crwn-text text-sm">
              #{t}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remove ${t}`}>
                <X className="w-3.5 h-3.5 text-crwn-text-secondary" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
