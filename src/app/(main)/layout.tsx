import { createServerSupabaseClient } from '@/lib/supabase/server';
import MainShell from './MainShell';
import type { ServerRole } from '@/hooks/useServerRole';

// The (main) segment is already rendered per request (nothing under it is
// prerendered), so reading the session here costs no static rendering. It is
// deliberately NOT done in the root layout: that layout also wraps the public
// marketing pages and the calculators, and touching cookies there would opt the
// whole acquisition funnel out of static rendering to fix an authenticated-only
// flash.
//
// One `profiles` read, on a session the middleware has already validated. If it
// fails for any reason the answer is null and the client resolves the role the way
// it always has, a little later. This must never be able to block the app.
async function resolveRole(): Promise<ServerRole> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    // Explicit single column. `profiles` carries columns whose SELECT is revoked
    // from the browser roles, and one revoked column fails the WHOLE statement.
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    const role = data?.role;
    return role === 'artist' || role === 'admin' || role === 'fan' ? role : null;
  } catch {
    return null;
  }
}

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  return <MainShell serverRole={await resolveRole()}>{children}</MainShell>;
}
