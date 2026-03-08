'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import { Check, X, AlertTriangle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const getIcon = (type: ToastType) => {
    switch (type) {
      case 'success': return <Check className="w-5 h-5 text-green-400" />;
      case 'error': return <X className="w-5 h-5 text-red-400" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
      case 'info': return <Info className="w-5 h-5 text-crwn-gold" />;
    }
  };

  const getBorderColor = (type: ToastType) => {
    switch (type) {
      case 'success': return 'border-green-400/30';
      case 'error': return 'border-red-400/30';
      case 'warning': return 'border-yellow-400/30';
      case 'info': return 'border-crwn-gold/30';
    }
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container - fixed center */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto neu-raised flex items-center gap-3 px-4 py-3 rounded-xl border ${getBorderColor(toast.type)} animate-slide-down`}
            onClick={() => removeToast(toast.id)}
          >
            {getIcon(toast.type)}
            <p className="text-sm text-crwn-text flex-1">{toast.message}</p>
            <button
              onClick={(e) => { e.stopPropagation(); removeToast(toast.id); }}
              className="text-crwn-text-secondary hover:text-crwn-text"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    // Fallback if used outside provider — use alert as backup
    return {
      showToast: (message: string) => {
        console.warn('Toast used outside provider, falling back to console:', message);
      },
    };
  }
  return context;
}
