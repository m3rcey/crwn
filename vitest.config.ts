import { defineConfig } from 'vitest/config';
import path from 'path';

// Smallest maintainable setup. The repo had no test runner at all; this adds one for the
// PURE services (validation, trust ordering, state machine, tokens, scoring) where a bug is
// silent and expensive. No jsdom, no component testing, no fixtures framework: those would
// be a second convention nobody asked for.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
