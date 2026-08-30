// Sanitized connection status for the artist UI. Owner-authorized; the response type
// (SanitizedConnection) has no token field by construction, so nothing here CAN leak one.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireArtistOwner } from '@/lib/apiAuth';
import { listConnections } from '@/lib/fanAutomations/connections';
import { providerAvailability } from '@/lib/fanAutomations/config';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get('artistId') || '';
  const owner = await requireArtistOwner(artistId);
  if (!owner.ok) return owner.error;

  const connections = await listConnections(supabaseAdmin, artistId);
  return NextResponse.json({
    connections: connections.filter((c) => c.status !== 'candidate'),
    hasCandidates: connections.some((c) => c.status === 'candidate'),
    availability: providerAvailability(),
  });
}
