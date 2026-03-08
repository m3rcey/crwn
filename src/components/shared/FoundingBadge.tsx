'use client';

interface FoundingBadgeProps {
  number: number;
  size?: 'sm' | 'md';
}

export function FoundingBadge({ number, size = 'sm' }: FoundingBadgeProps) {
  const sizeClasses = size === 'sm'
    ? 'text-[10px] px-2 py-0.5'
    : 'text-xs px-3 py-1';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-crwn-gold/15 text-crwn-gold font-semibold ${sizeClasses}`}>
      👑 Founding Artist #{number}
    </span>
  );
}
