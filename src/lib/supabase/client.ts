import { createBrowserClient } from '@supabase/ssr';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy-key-for-build';

// Browser client for client-side usage (singleton)
let browserClient: SupabaseClient | null = null;

export const createBrowserSupabaseClient = (): SupabaseClient => {
  if (browserClient) return browserClient;
  browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: {
      path: '/',
      sameSite: 'lax',
      secure: true,
      maxAge: 34560000,
    },
  });
  return browserClient;
};

// Default export for convenience
export const supabase = createBrowserSupabaseClient();

// Server client for API routes (no cookie handling needed there)
export const supabaseServer = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
