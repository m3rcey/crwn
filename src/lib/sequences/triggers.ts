// The sequence trigger the fan funnel's free join fires. Lives in its own module so PURE code
// (funnelReadiness.ts) can name it without importing the enroller, which reasons about a client.
export const FREE_JOIN_TRIGGER = 'free_join';
