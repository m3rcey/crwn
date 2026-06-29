const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
const ALLOWED_AUDIO_TYPES = [
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/vnd.wave',
  'audio/ogg', 'audio/aac', 'audio/x-m4a', 'audio/m4a', 'audio/mp4',
  'audio/flac', 'audio/x-flac', 'audio/aiff', 'audio/x-aiff', 'audio/opus', 'audio/webm',
];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

// Extension fallbacks. File.type (browser MIME sniffing) is unreliable — it is
// often an empty string or a non-standard variant for perfectly valid audio
// (esp. .m4a/.wav/.flac/.aiff). Accept a file if EITHER its MIME or its
// extension is allowed, so real music never gets bounced as "invalid type".
const ALLOWED_EXTENSIONS: Record<FileCategory, string[]> = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'],
  audio: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'flac', 'aiff', 'aif', 'opus', 'mp4'],
  video: ['mp4', 'mov', 'webm'],
  product: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'zip'],
};

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

  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  const typeOk = !!file.type && config.types.includes(file.type);
  const extOk = !!ext && ALLOWED_EXTENSIONS[category].includes(ext);

  if (!typeOk && !extOk) {
    return { valid: false, error: `Invalid file type. Allowed: ${ALLOWED_EXTENSIONS[category].join(', ')}` };
  }

  if (file.size > config.maxSize) {
    const maxMB = config.maxSize / (1024 * 1024);
    return { valid: false, error: `${config.label} must be under ${maxMB}MB. Yours is ${(file.size / (1024 * 1024)).toFixed(1)}MB.` };
  }

  return { valid: true };
}
