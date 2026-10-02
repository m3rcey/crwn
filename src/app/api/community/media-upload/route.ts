// POST /api/community/media-upload  { artistId, filename, contentType }  ->  { uploadUrl, key }
//
// A signed PUT so the artist's browser uploads a room post's photo or video straight to the
// PRIVATE R2 bucket. Owner-only (requireArtistOwner proves the artist from the session).
//
// SEC-009 shape: the KEY is generated here, under the artist's own community prefix, with a
// random component, so a caller names only a file extension and a content type. The post
// stores that key; /api/community/media signs it only inside the same prefix and only for a
// post the artist wrote. The file never gets a durable public URL.

import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtistOwner } from '@/lib/apiAuth';
import { getSignedUploadUrl } from '@/lib/r2/client';
import { communityMediaPrefix } from '@/lib/community/rooms';

export const runtime = 'nodejs';

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const owner = await requireArtistOwner(body.artistId);
  if (!owner.ok) return owner.error;

  const contentType = typeof body.contentType === 'string' ? body.contentType : '';
  const ext = EXT_BY_TYPE[contentType];
  if (!ext) {
    return NextResponse.json({ error: 'Use a JPG, PNG, WebP or GIF photo, or an MP4, MOV or WebM video.' }, { status: 400 });
  }

  const key = `${communityMediaPrefix(body.artistId)}${Date.now()}-${randomUUID()}.${ext}`;
  const uploadUrl = await getSignedUploadUrl(key, contentType, 900);
  return NextResponse.json({ uploadUrl, key }, { headers: { 'Cache-Control': 'private, no-store' } });
}
