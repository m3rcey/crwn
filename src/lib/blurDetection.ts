/**
 * Detect if an image is blurry using Laplacian variance on canvas.
 * Lower variance = blurrier image.
 */

const BLUR_THRESHOLD_AVATAR = 15;  // Avatars are small — stricter
const BLUR_THRESHOLD_BANNER = 10;  // Banners can be softer

export async function detectBlur(
  file: File,
  type: 'avatar' | 'banner'
): Promise<{ isBlurry: boolean; score: number; threshold: number }> {
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  // Scale down for performance (max 256px on longest side)
  const scale = Math.min(1, 256 / Math.max(img.width, img.height));
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const gray = toGrayscale(imageData);
  const variance = laplacianVariance(gray, canvas.width, canvas.height);

  const threshold = type === 'avatar' ? BLUR_THRESHOLD_AVATAR : BLUR_THRESHOLD_BANNER;
  return { isBlurry: variance < threshold, score: variance, threshold };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function toGrayscale(imageData: ImageData): Float32Array {
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const idx = i * 4;
    gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  }
  return gray;
}

function laplacianVariance(gray: Float32Array, w: number, h: number): number {
  // 3x3 Laplacian kernel: [0,1,0; 1,-4,1; 0,1,0]
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const lap =
        gray[(y - 1) * w + x] +
        gray[(y + 1) * w + x] +
        gray[y * w + (x - 1)] +
        gray[y * w + (x + 1)] -
        4 * gray[y * w + x];
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  const mean = sum / count;
  return sumSq / count - mean * mean;
}
