// node_modules for task worktrees: shared by hardlink, isolated before anything changes it.
//
// Measured 2026-09-29 (docs/PARALLEL_CLAUDE_SESSIONS.md, "Dependencies"):
//   * npm install / uninstall / ci and `next build` never modify an existing package file. They
//     write NEW files, so a hardlinked tree is safe for them, and it costs about 17 MB instead of
//     about 1 GB per worktree.
//   * Two paths ARE rewritten in place, and through a shared inode that write reaches every other
//     checkout: npm's own record of what is installed (node_modules/.package-lock.json) and
//     vitest's results cache (node_modules/.vite). Each worktree gets its own copy of those.
//   * Anything else that could rewrite an installed file (npm rebuild, lifecycle scripts, a future
//     npm) is covered by isolating the WHOLE tree before any dependency-changing npm command:
//     about 5 s and 1 GB, paid only by a task that actually changes dependencies.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const MARKER = '.crwn-hardlinked';
const REWRITTEN_IN_PLACE = ['.package-lock.json', '.vite', '.cache'];

// npm subcommands (and their aliases) that change node_modules. `ci` is absent on purpose: it
// deletes node_modules before installing, which unlinks rather than rewrites (verified).
const MUTATING = new Set([
  'install', 'i', 'in', 'ins', 'inst', 'insta', 'instal', 'isnt', 'isnta', 'isntal', 'isntall', 'add',
  'install-test', 'it',
  'uninstall', 'un', 'unlink', 'remove', 'rm', 'r',
  'update', 'up', 'upgrade', 'udpate', 'dedupe', 'ddp', 'prune', 'rebuild', 'rb', 'link', 'ln',
]);

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}: ${(r.stderr || '').trim().slice(0, 300)}`);
}

// Replace a hardlinked file or directory with an identical copy that has its own inodes.
function unshare(p) {
  if (!fs.existsSync(p)) return;
  const tmp = `${p}.crwn-unshare`;
  fs.rmSync(tmp, { recursive: true, force: true });
  run('cp', ['-a', p, tmp]);
  fs.rmSync(p, { recursive: true, force: true });
  fs.renameSync(tmp, p);
}

/** Give a task worktree its node_modules. Returns a one-line note, or null if nothing to do. */
export function linkDeps(root, mainRoot) {
  const mine = path.join(root, 'node_modules');
  const shared = path.join(mainRoot, 'node_modules');
  if (fs.existsSync(mine) || !fs.existsSync(shared)) return null;
  // The main checkout's tree is only right for a worktree that asks for the same packages. A task
  // that changed dependencies and later lost node_modules to `crwn clean` must not be handed main's.
  const lock = (r) => { try { return fs.readFileSync(path.join(r, 'package-lock.json')); } catch { return null; } };
  const wantLock = lock(root), mainLock = lock(mainRoot);
  if (wantLock && mainLock && !wantLock.equals(mainLock)) {
    return "node_modules: missing, and this worktree's package-lock.json differs from the main checkout's, so it was NOT linked from there. Run npm ci in this worktree before building or testing.";
  }
  run('cp', ['-al', shared, mine]);
  for (const p of REWRITTEN_IN_PLACE) unshare(path.join(mine, p));
  fs.writeFileSync(path.join(mine, MARKER), 'Hardlinked from the main checkout. Isolated automatically before any npm command that changes dependencies.\n');
  return 'node_modules: hardlinked from the main checkout (about 17 MB). A dependency-changing npm command here first gets this worktree its own copy, automatically, so it cannot change another checkout.';
}

/** Is node_modules in this checkout still sharing files with the main checkout? */
export const isLinked = (root) => fs.existsSync(path.join(root, 'node_modules', MARKER));

/** Turn a hardlinked node_modules into an independent copy (same content, new inodes). */
export function isolateDeps(root) {
  const nm = path.join(root, 'node_modules');
  if (!isLinked(root)) return false;
  const copy = `${nm}.crwn-isolating`;
  const old = `${nm}.crwn-linked`;
  fs.rmSync(copy, { recursive: true, force: true });
  run('cp', ['-a', nm, copy]);
  fs.rmSync(path.join(copy, MARKER));
  fs.renameSync(nm, old);
  fs.renameSync(copy, nm);
  fs.rmSync(old, { recursive: true, force: true }); // removes links only; the main checkout keeps its files
  return true;
}

/** Does this simple command (array of words) change node_modules? */
export function mutatesDeps(seg) {
  const at = seg.findIndex((t) => path.basename(t).replace(/\.(exe|cmd)$/i, '') === 'npm');
  if (at < 0) return false;
  const rest = seg.slice(at + 1);
  if (rest.some((a) => a === '-g' || a === '--global' || a === '--dry-run' || a === '--package-lock-only')) return false;
  const sub = rest.find((a) => !a.startsWith('-'));
  if (sub === 'audit') return rest.includes('fix');
  return MUTATING.has(sub);
}
