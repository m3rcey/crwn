import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function checkRateLimit(
  userId: string,
  action: string,
  windowSeconds: number = 60,
  maxRequests: number = 5
): Promise<boolean> {
  const { data } = await supabaseAdmin.rpc('check_rate_limit', {
    p_user_id: userId,
    p_action: action,
    p_window_seconds: windowSeconds,
    p_max_requests: maxRequests,
  });
  return data === true;
}
