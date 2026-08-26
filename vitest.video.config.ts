import { defineConfig } from 'vitest/config';

// The video pipeline's deterministic suite (scripts/video). Separate config so the
// app's `npm test` (src-only, per vitest.config.ts) stays untouched. These tests
// mock every paid provider: they must never spend API credits.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/video/**/*.test.mjs'],
  },
});
