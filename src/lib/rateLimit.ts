import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * check_rate_limit's p_user_id column is a uuid. Unauthenticated routes have no user
 * id, so they key on a string like `ip:1.2.3.4` — which Postgres cannot cast to uuid.
 * The RPC then failed with 22P02, and an errored limiter used to read as "denied", so
 * /api/support, /api/partner/apply and the lead magnet routes returned 429 to every
 * visitor on their very first request. Hashing the key into a stable uuid keeps one
 * limiter and one bucket-per-key, with no schema change.
 */
function toUuidKey(key: string): string {
  if (UUID_RE.test(key)) return key;
  const h = createHash('sha256').update(key).digest('hex').slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export async function checkRateLimit(
  userId: string,
  action: string,
  windowSeconds: number = 60,
  maxRequests: number = 5
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
    p_user_id: toUuidKey(userId),
    p_action: action,
    p_window_seconds: windowSeconds,
    p_max_requests: maxRequests,
  });

  if (error) {
    // Never swallow this. A limiter that cannot answer looks exactly like a limiter
    // saying "denied", which is how the public forms stayed broken unnoticed.
    console.error(`checkRateLimit RPC failed (action: ${action}):`, error.message);
    return false;
  }

  return data === true;
}
