'use client';

interface BackgroundImageProps {
  src: string;
  overlayOpacity?: string;
}

export function BackgroundImage({ src, overlayOpacity = 'bg-black/70' }: BackgroundImageProps) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <img
        src={src}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        loading="eager"
      />
      <div className={`absolute inset-0 ${overlayOpacity}`} />
    </div>
  );
}
