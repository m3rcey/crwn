'use client';

import { useEffect, useState } from 'react';

interface BackgroundImageProps {
  src: string;
  overlayOpacity?: string;
}

export function BackgroundImage({ src, overlayOpacity = 'bg-black/70' }: BackgroundImageProps) {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    // Check if mobile (background-attachment: fixed doesn't work well on iOS)
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    
    if (!isMobile) {
      // Desktop: use CSS fixed attachment
      return;
    }

    // Mobile: use JS-based parallax
    const handleScroll = () => {
      setOffset(window.scrollY * 0.3);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div className="fixed inset-0 -z-10">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url('${src}')`,
          backgroundAttachment: isMobile ? 'scroll' : 'fixed',
          transform: isMobile ? `translateY(${offset}px)` : undefined,
          willChange: 'transform',
        }}
      />
      <div className={`absolute inset-0 ${overlayOpacity}`} />
    </div>
  );
}
