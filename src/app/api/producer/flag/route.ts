import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isProducerSessionsEnabled } from '@/lib/producer/access';

// Tiny probe so the UI can hide the entire Executive Producer Session surface
// while the dark-launch flag is off. Public: it leaks only a boolean.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET() {
  return NextResponse.json({ enabled: await isProducerSessionsEnabled(supabaseAdmin) });
}
