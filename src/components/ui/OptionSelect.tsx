'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
//
// THE OPEN LIST IS PORTALLED TO document.body, AND IT HAS TO BE.
//
// It used to be an `absolute` child of this component, which means every ancestor got a
// vote on whether it was visible. `VaultPlanner`'s card is `overflow-hidden` (it needs to
// be: it clips its own rounded corners), so the list opened INSIDE the card and was cut
// off at the border, leaving the artist with a control that appeared to do nothing. Around
// thirty screens mount this component, several of them inside clipping cards, scroll
// containers and modals, so fixing the one card would have left the same bug latent
// everywhere else.
//
// A portalled child of `body` has no ancestor that can clip it, and `position: fixed`
// anchored to the trigger's measured rect is what keeps it attached to the control. The
// rect is re-measured on scroll and resize, so it tracks rather than drifting. It flips
// above the trigger when there is not enough room below, and its height is the space
// actually available rather than a fixed guess.
//
// Two consequences to keep in mind if you edit this:
//   - The list is no longer inside `rootRef`, so outside-click MUST test the menu as well,
//     or clicking an option closes the menu before the option's own handler runs.
//   - `z-[120]` is above every modal in the app (the highest is `z-[100]`), because this
//     control is used inside modals and a portalled list at a lower layer renders behind
//     the very dialog that opened it.
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
  const [mounted, setMounted] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? null;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Where the list goes, in viewport coordinates. Below the trigger by default; above it
  // when the space below cannot hold a usable list and the space above is bigger. The
  // height offered is the room that actually exists, so a control near the bottom of the
  // window gets a short scrolling list instead of one that runs off the screen.
  const measure = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 8;
    const roomBelow = window.innerHeight - r.bottom - gap;
    const roomAbove = r.top - gap;
    const placeAbove = roomBelow < 220 && roomAbove > roomBelow;
    const room = placeAbove ? roomAbove : roomBelow;
    setMenuStyle({
      position: 'fixed',
      left: r.left,
      width: r.width,
      maxHeight: Math.max(140, Math.min(Math.round(window.innerHeight * 0.55), room)),
      ...(placeAbove ? { bottom: window.innerHeight - r.top + gap } : { top: r.bottom + gap }),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    measure();
    // The outside-click test covers BOTH halves of the control, because the list is a
    // sibling of the page in the DOM now rather than a child of this component.
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    // Capture: the trigger may sit inside a scrolling panel, whose scroll events never
    // reach the document in the bubble phase.
    const onMove = () => measure();
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, measure]);

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

      {open && mounted && menuStyle && createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className="z-[120] rounded-xl border border-crwn-elevated bg-crwn-surface-solid shadow-2xl overflow-y-auto"
        >
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
        </div>,
        document.body,
      )}
    </div>
  );
}
