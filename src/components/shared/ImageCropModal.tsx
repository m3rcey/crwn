'use client';

import { useState, useCallback } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { X, ZoomIn, ZoomOut } from 'lucide-react';

interface ImageCropModalProps {
  imageSrc: string;
  type: 'avatar' | 'banner';
  onComplete: (croppedBlob: Blob) => void;
  onCancel: () => void;
}

const CROP_CONFIG = {
  avatar: {
    aspect: 1,
    shape: 'round' as const,
    label: 'Profile Photo',
    recommended: '500 x 500px',
    outputSize: 500,
  },
  banner: {
    aspect: 3,
    shape: 'rect' as const,
    label: 'Banner Image',
    recommended: '1500 x 500px',
    outputSize: 1500,
  },
};

export default function ImageCropModal({ imageSrc, type, onComplete, onCancel }: ImageCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const config = CROP_CONFIG[type];

  const onCropComplete = useCallback((_: Area, croppedAreaPixels: Area) => {
    setCroppedArea(croppedAreaPixels);
  }, []);

  const handleSave = async () => {
    if (!croppedArea) return;
    setSaving(true);

    try {
      const blob = await getCroppedImage(imageSrc, croppedArea, config.outputSize, type);
      onComplete(blob);
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-crwn-surface rounded-xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-crwn-elevated">
          <div>
            <h3 className="text-base font-semibold text-crwn-text">Adjust {config.label}</h3>
            <p className="text-xs text-crwn-text-secondary">
              Recommended: {config.recommended}
            </p>
          </div>
          <button onClick={onCancel} className="text-crwn-text-secondary hover:text-crwn-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Crop area */}
        <div className="relative w-full" style={{ height: type === 'banner' ? 280 : 340 }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={config.aspect}
            cropShape={config.shape}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            showGrid={false}
            style={{
              containerStyle: { background: '#0D0D0D' },
            }}
          />
        </div>

        {/* Zoom slider */}
        <div className="flex items-center gap-3 px-4 py-3">
          <ZoomOut className="w-4 h-4 text-crwn-text-secondary flex-shrink-0" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-crwn-gold h-1"
          />
          <ZoomIn className="w-4 h-4 text-crwn-text-secondary flex-shrink-0" />
        </div>

        <p className="text-xs text-crwn-text-secondary text-center pb-2">
          Drag to reposition, scroll or slide to zoom
        </p>

        {/* Actions */}
        <div className="flex gap-3 px-4 pb-4">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-full border border-crwn-elevated text-crwn-text-secondary font-medium hover:text-crwn-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-full bg-crwn-gold text-crwn-bg font-semibold hover:bg-crwn-gold-hover transition-colors disabled:opacity-50"
          >
            {saving ? 'Applying...' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Canvas-based crop: reads the source image, draws the cropped region, exports as blob */
async function getCroppedImage(
  src: string,
  crop: Area,
  maxOutputWidth: number,
  type: 'avatar' | 'banner'
): Promise<Blob> {
  const img = await loadImg(src);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  // Output dimensions — fit within maxOutputWidth while maintaining crop aspect
  const outputW = Math.min(crop.width, maxOutputWidth);
  const outputH = type === 'banner'
    ? Math.round(outputW / 3)
    : outputW;

  canvas.width = outputW;
  canvas.height = outputH;

  ctx.drawImage(
    img,
    crop.x, crop.y, crop.width, crop.height,
    0, 0, outputW, outputH
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))),
      'image/jpeg',
      0.92
    );
  });
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
