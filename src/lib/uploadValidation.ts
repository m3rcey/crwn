const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/x-m4a', 'audio/mp4'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;   // 10MB
const MAX_AUDIO_SIZE = 100 * 1024 * 1024;  // 100MB
const MAX_VIDEO_SIZE = 500 * 1024 * 1024;  // 500MB
const MAX_PRODUCT_FILE_SIZE = 50 * 1024 * 1024; // 50MB

type FileCategory = 'image' | 'audio' | 'video' | 'product';

const CATEGORY_CONFIG: Record<FileCategory, { types: string[]; maxSize: number; label: string }> = {
  image: { types: ALLOWED_IMAGE_TYPES, maxSize: MAX_IMAGE_SIZE, label: 'Image' },
  audio: { types: ALLOWED_AUDIO_TYPES, maxSize: MAX_AUDIO_SIZE, label: 'Audio' },
  video: { types: ALLOWED_VIDEO_TYPES, maxSize: MAX_VIDEO_SIZE, label: 'Video' },
  product: { types: [...ALLOWED_IMAGE_TYPES, 'application/pdf', 'application/zip'], maxSize: MAX_PRODUCT_FILE_SIZE, label: 'File' },
};

export function validateUpload(file: File, category: FileCategory): { valid: boolean; error?: string } {
  const config = CATEGORY_CONFIG[category];

  if (!config.types.includes(file.type)) {
    return { valid: false, error: `Invalid file type. Allowed: ${config.types.map(t => t.split('/')[1]).join(', ')}` };
  }

  if (file.size > config.maxSize) {
    const maxMB = config.maxSize / (1024 * 1024);
    return { valid: false, error: `${config.label} must be under ${maxMB}MB. Yours is ${(file.size / (1024 * 1024)).toFixed(1)}MB.` };
  }

  return { valid: true };
}
