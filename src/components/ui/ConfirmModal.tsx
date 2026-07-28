'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { hapticMedium } from '@/lib/haptics';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  // Portal to <body> so the overlay is centered in the VIEWPORT, not inside a
  // page wrapper. Any ancestor with a transform (e.g. a lingering fadeInUp
  // translateY) makes `position: fixed` anchor to that ancestor instead of the
  // viewport, and its overflow-hidden then clips the modal, which is why the
  // dialog used to appear mid-page and require scrolling. The portal escapes
  // that entirely. A mount guard keeps it SSR-safe (no document on the server).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onCancel} />
      <div className="relative neu-modal p-6 max-w-sm w-full" style={{ animation: 'fadeInUp 0.3s ease-out' }}>
        <h3 className="text-lg font-semibold text-crwn-text mb-2">{title}</h3>
        <p className="text-sm text-crwn-text-secondary mb-6">{message}</p>
        {/* Buttons are rounded RECTANGLES, not full pills: a 9999px radius turns a
            two-line label into an oval blob. !rounded-2xl reliably beats the
            border-radius baked into the neu-* classes; min-h + leading-tight keep
            a one-line and a wrapped label the same clean height. */}
        <div className="flex items-stretch gap-3">
          <button
            onClick={onCancel}
            className="flex-1 min-h-[46px] px-3 neu-button !rounded-2xl py-2.5 text-crwn-text-secondary text-sm font-medium leading-tight press-scale"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              hapticMedium();
              onConfirm();
            }}
            className={`flex-1 min-h-[46px] px-3 py-2.5 !rounded-2xl text-sm font-semibold leading-tight press-scale ${
              variant === 'danger'
                ? 'bg-crwn-error text-white'
                : 'neu-button-accent text-crwn-bg'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
