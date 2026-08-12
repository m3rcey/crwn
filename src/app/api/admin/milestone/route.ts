// COMPATIBILITY WRAPPER (F-16). This route was always artist SELF-SERVICE (the session user
// marks their own milestone) and never admin-gated; it was merely misfiled under /api/admin/.
// The canonical implementation now lives at /api/artist/milestone. This wrapper exists only
// for deployed clients and service-worker-cached PWA bundles still POSTing the old path — do
// not add logic here, and do not admin-gate it (that would break those cached clients).
export { POST } from '@/app/api/artist/milestone/route';
