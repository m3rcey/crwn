import { defineConfig } from "vitest/config";

// The Fan Economy reel editor (scripts/reel). Separate config so the app suite
// (npm test, src only) never loads it. Every provider is mocked or synthetic: this
// suite never spends API credits and never needs the founder recording.
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/reel/**/*.test.mjs"],
    testTimeout: 30000,
  },
});
