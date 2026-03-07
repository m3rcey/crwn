'use client';

import { useEffect, useState } from 'react';

interface BackgroundImageProps {
  src: string;
  overlayOpacity?: string;
}

export function BackgroundImage({ src, overlayOpacity = 'bg-black/70' }: BackgroundImageProps) {
  const [offset, setOffset] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Detect mobile/iOS inside useEffect to avoid hydration mismatch
    const mobile = window.innerWidth < 768 || /iPhone|iPad|iPod/i.test(navigator.userAgent);
    setIsMobile(mobile);

    if (!mobile) return;

    const handleScroll = () => {
      setOffset(window.scrollY * 0.3);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="fixed inset-0 -z-10">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url('${src}')`,
          backgroundAttachment: isMobile ? 'scroll' : 'fixed',
          transform: isMobile ? `translateY(${offset}px)` : undefined,
          willChange: isMobile ? 'transform' : undefined,
        }}
      />
      <div className={`absolute inset-0 ${overlayOpacity}`} />
    </div>
  );
}
