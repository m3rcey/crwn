import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';

/**
 * Returns the authenticated admin User, or null if the caller is not a
 * signed-in admin.
 *
 * SECURITY: identity comes from the SESSION cookie, never from a client-
 * supplied `userId`/`adminUserId` param. The old pattern checked the role of
 * whatever id the request carried, so any request presenting a known admin
 * UUID was treated as admin (and several admin GETs had no session at all).
 * Always derive the acting admin id from the returned `user.id`.
 */
export async function requireAdmin(): Promise<User | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') return null;
  return user;
}
