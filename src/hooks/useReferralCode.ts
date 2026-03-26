import { useAuth } from '@/hooks/useAuth';

/**
 * Returns the current user's referral code if they are logged in, or null.
 * Use this to embed ?ref= in shared links for subscribed fans.
 */
export function useReferralCode(): string | null {
  const { user, profile } = useAuth();
  if (!user || !profile) return null;
  return profile.username || user.id.replace(/-/g, '').substring(0, 8);
}
