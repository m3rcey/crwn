'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
  icon?: React.ReactNode; // an emoji string or a lucide icon element
}

// Shared single-choice DROPDOWN. Per the CLAUDE.md UX rule, any "pick one of many"
// selector should use this instead of showing every option at once. Collapsed to a
// single control that expands the list; closes on select or outside click.
export function OptionSelect({
  options,
  value,
  onChange,
  placeholder = 'Choose one',
  className = '',
}: {
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 rounded-xl border border-crwn-elevated bg-crwn-surface px-4 py-4 text-left"
      >
        <span className="flex items-center gap-3 min-w-0">
          {selected?.icon != null && <span className="text-2xl shrink-0">{selected.icon}</span>}
          <span className="min-w-0">
            <span className={`block text-lg font-semibold truncate ${selected ? 'text-crwn-text' : 'text-crwn-text-secondary'}`}>
              {selected ? selected.label : placeholder}
            </span>
            {selected?.hint && <span className="block text-sm text-crwn-text-secondary truncate">{selected.hint}</span>}
          </span>
        </span>
        <ChevronDown className={`w-6 h-6 text-crwn-text-secondary shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-full rounded-xl border border-crwn-elevated bg-crwn-surface-solid shadow-2xl overflow-hidden max-h-[55vh] overflow-y-auto">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3.5 text-left border-b border-crwn-elevated/60 last:border-0 ${
                o.value === value ? 'bg-crwn-gold/10' : 'hover:bg-crwn-elevated/40'
              }`}
            >
              {o.icon != null && <span className="text-2xl shrink-0">{o.icon}</span>}
              <span className="flex-1 min-w-0">
                <span className="block text-lg font-semibold text-crwn-text">{o.label}</span>
                {o.hint && <span className="block text-sm text-crwn-text-secondary">{o.hint}</span>}
              </span>
              {o.value === value && <Check className="w-6 h-6 text-crwn-gold shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
