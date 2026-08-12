// Shared source-scanning helpers for the architecture / drift-prevention suite.
//
// Every boundary test before 2026-08-12 hand-rolled its own file walker and
// comment stripper (three materially different walkers existed). This module is
// the ONE implementation new architecture tests should use. Existing boundary
// tests keep their local copies deliberately: rewriting a passing drift test is
// how a drift test silently stops examining the right thing. Use this for NEW
// assertions; migrate an old test only when you are already changing it.
//
// Design constraints (do not "improve" these away):
// - Test-time only. This module must never be imported by product code; it
//   reads the repository with node:fs, which does not exist in the browser and
//   has no business in a route handler. architecture.test.ts asserts this.
// - cwd is the repo root (vitest.config.ts has no root override), so all paths
//   are repo-root-relative with forward slashes, e.g. 'src/lib/notifications.ts'.
// - Comment stripping uses the same idiom as campaigns/boundaries.test.ts:
//   the [^:] guard keeps 'https://' inside string literals alive.
// - Results are cached per test-file process. vitest isolates test files, so
//   the cache cannot leak between suites; within one suite it turns ~15 full
//   walks into one.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const fileListCache = new Map<string, string[]>();
const rawCache = new Map<string, string>();
const strippedCache = new Map<string, string>();

/** Normalize a path to repo-relative forward slashes (Windows-safe). */
export function norm(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Recursively list source files under a root (default 'src').
 * Excludes *.test.ts and node_modules. Returns forward-slash repo-relative paths.
 */
export function listSourceFiles(
  root = 'src',
  opts: { ext?: RegExp; includeTests?: boolean } = {},
): string[] {
  const ext = opts.ext ?? /\.(ts|tsx)$/;
  const cacheKey = `${root}|${ext.source}|${opts.includeTests ? 1 : 0}`;
  const hit = fileListCache.get(cacheKey);
  if (hit) return hit;

  const acc: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.next') continue;
        walk(p);
      } else if (ext.test(entry.name)) {
        if (!opts.includeTests && /\.test\.tsx?$/.test(entry.name)) continue;
        acc.push(norm(p));
      }
    }
  };
  walk(root);
  fileListCache.set(cacheKey, acc);
  return acc;
}

/** Raw file contents, cached. Throws if the file does not exist (a moved file should fail loudly). */
export function readRaw(path: string): string {
  const hit = rawCache.get(path);
  if (hit !== undefined) return hit;
  const src = readFileSync(path, 'utf8');
  rawCache.set(path, src);
  return src;
}

/** Raw contents, or '' when the file is absent. Only for docs whose absence a test asserts separately. */
export function readOptional(path: string): string {
  if (!existsSync(path)) return '';
  return readRaw(path);
}

/**
 * Strip /* *\/ block comments and // line comments (Idiom A from
 * campaigns/boundaries.test.ts — the [^:] guard preserves 'https://').
 */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Comment-stripped file contents, cached. */
export function readStripped(path: string): string {
  const hit = strippedCache.get(path);
  if (hit !== undefined) return hit;
  const out = stripComments(readRaw(path));
  strippedCache.set(path, out);
  return out;
}

export { existsSync, statSync };

/**
 * Format a drift-invariant violation message. Every architecture assertion
 * should fail through this so the message carries the invariant id, the rule,
 * the offending file, and where the canonical rule lives — the consumer of
 * these failures is usually a coding agent that has not read the registry.
 */
export function violation(
  id: string,
  detail: string,
  extra?: { file?: string; owner?: string; docs?: string },
): string {
  const lines = [`CRWN invariant ${id} violated: ${detail}`];
  if (extra?.file) lines.push(`  offending file: ${extra.file}`);
  if (extra?.owner) lines.push(`  canonical owner: ${extra.owner}`);
  if (extra?.docs) lines.push(`  review: ${extra.docs}`);
  lines.push(
    `  If this change is INTENTIONAL, follow the rule-change workflow in docs/crwn-brain/26-PRODUCT-DRIFT-PREVENTION.md (update the Brain rule, the implementation, the invariant registry and this test together — never weaken the test alone).`,
  );
  return lines.join('\n');
}
