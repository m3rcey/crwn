'use client';

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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onCancel} />
      <div className="relative neu-modal p-6 max-w-sm w-full" style={{ animation: 'fadeInUp 0.3s ease-out' }}>
        <h3 className="text-lg font-semibold text-crwn-text mb-2">{title}</h3>
        <p className="text-sm text-crwn-text-secondary mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 neu-button py-2.5 text-crwn-text-secondary text-sm font-medium press-scale"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              hapticMedium();
              onConfirm();
            }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold press-scale ${
              variant === 'danger'
                ? 'bg-crwn-error text-white'
                : 'neu-button-accent text-crwn-bg'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
