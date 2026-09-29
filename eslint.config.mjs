import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Task worktrees (docs/PARALLEL_CLAUDE_SESSIONS.md) are whole checkouts of the repo, each
    // linted from its own root; without this, linting the main checkout lints all of them too.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
