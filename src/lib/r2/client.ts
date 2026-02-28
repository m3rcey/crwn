import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const R2_ENDPOINT = `https://${process.env.CLOUDFLARE_ACCOUNT_ID || 'account-id'}.r2.cloudflarestorage.com`;

const r2Client = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || 'dummy-key',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || 'dummy-secret',
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'crwn-media';

export async function uploadToR2(
  file: Buffer | Blob,
  key: string,
  contentType: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: file,
    ContentType: contentType,
  });

  await r2Client.send(command);

  // Return the public URL
  return `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://crwn-media.r2.dev'}/${key}`;
}

export async function getSignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 300
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(r2Client, command, { expiresIn });
}

export async function getSignedDownloadUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(r2Client, command, { expiresIn });
}

export function generateFileKey(
  artistSlug: string,
  type: 'audio' | 'art' | 'banner' | 'avatar',
  filename: string
): string {
  const timestamp = Date.now();
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${artistSlug}/${type}/${timestamp}-${sanitizedFilename}`;
}
