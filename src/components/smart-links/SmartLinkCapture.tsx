'use client';

import { useState } from 'react';
import { Loader2, CheckCircle } from 'lucide-react';

interface SmartLinkCaptureProps {
  linkId: string;
  artistId: string;
  collectEmail: boolean;
  collectPhone: boolean;
  collectName: boolean;
  destinationUrl: string | null;
}

export function SmartLinkCapture({
  linkId,
  artistId,
  collectEmail,
  collectPhone,
  collectName,
  destinationUrl,
}: SmartLinkCaptureProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (collectEmail && !email.trim()) {
      setError('Email is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/smart-links/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkId,
          artistId,
          name: collectName ? name.trim() : undefined,
          email: collectEmail ? email.trim() : undefined,
          phone: collectPhone ? phone.trim() : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Something went wrong');

      setIsSubmitted(true);

      // Redirect after a brief moment
      if (destinationUrl) {
        setTimeout(() => {
          window.location.href = destinationUrl;
        }, 1500);
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="bg-[#1A1A1A] rounded-2xl border border-[#333] p-8 text-center">
        <CheckCircle className="w-12 h-12 text-[#D4AF37] mx-auto mb-3" />
        <p className="text-white font-medium text-lg">You're in!</p>
        {destinationUrl && (
          <p className="text-[#A0A0A0] text-sm mt-2">Redirecting you now...</p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[#1A1A1A] rounded-2xl border border-[#333] p-6 space-y-4">
      {collectName && (
        <div>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
            className="w-full px-4 py-3 bg-[#242424] border border-[#333] rounded-xl text-sm text-white placeholder:text-[#666] focus:outline-none focus:border-[#D4AF37]/50"
          />
        </div>
      )}

      {collectEmail && (
        <div>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Your email"
            required
            className="w-full px-4 py-3 bg-[#242424] border border-[#333] rounded-xl text-sm text-white placeholder:text-[#666] focus:outline-none focus:border-[#D4AF37]/50"
          />
        </div>
      )}

      {collectPhone && (
        <div>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="Phone number (optional)"
            className="w-full px-4 py-3 bg-[#242424] border border-[#333] rounded-xl text-sm text-white placeholder:text-[#666] focus:outline-none focus:border-[#D4AF37]/50"
          />
        </div>
      )}

      {error && (
        <p className="text-red-400 text-xs">{error}</p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-3 bg-gradient-to-r from-[#9a7b2a] to-[#D4AF37] text-[#0D0D0D] rounded-xl text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {isSubmitting ? (
          <Loader2 className="w-4 h-4 animate-spin mx-auto" />
        ) : (
          'Join'
        )}
      </button>
    </form>
  );
}
