// The service-role client for the acquisition engine.
//
// SERVER ONLY. This client bypasses RLS entirely. It must never be imported into a client
// component or anything that ends up in the browser bundle. Every module that imports it is
// under src/lib/acquisition/ or src/app/api/, and every route that uses it authenticates
// itself (webhook secret, session cookie, or CRON_SECRET) because middleware skips /api/.
//
// The existing codebase creates this client inline in each file. Centralizing it here means
// there is ONE place to audit for the fallback-not-assertion rule, instead of one per file.

import { createClient } from '@supabase/supabase-js';

// Build-safe fallbacks, NOT `!` (CLAUDE.md). A non-null assertion here crashes the Vercel
// build during static page collection, where no secrets exist.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/** The engine's kill switch. Reads admin_settings.acquisition_engine, same as the quest flag. */
export async function isAcquisitionEngineEnabled(): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from('admin_settings')
      .select('value')
      .eq('key', 'acquisition_engine')
      .maybeSingle();
    return !!(data?.value as { enabled?: boolean } | null)?.enabled;
  } catch {
    // Fail CLOSED. If we cannot read the flag we assume off, so a database blip cannot
    // silently turn on a dark-launched feature.
    return false;
  }
}
