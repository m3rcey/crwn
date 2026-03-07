'use client';

interface BackgroundImageProps {
  src: string;
  overlayOpacity?: string;
}

export function BackgroundImage({ src, overlayOpacity = 'bg-black/70' }: BackgroundImageProps) {
  return (
    <div className="fixed inset-0 -z-10">
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
