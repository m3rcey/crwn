// Where the Instagram read token lives: <main checkout>/.env.instagram (git-ignored).
//
// From a task worktree (docs/PARALLEL_CLAUDE_SESSIONS.md) this still answers the MAIN checkout's
// file. The server refreshes the token in place every 7 days, so a per-worktree copy would be
// refreshed on its own and drift from the one every other session reads. One file, one token.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function instagramEnvFile() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  try {
    // Only a linked worktree has a .git FILE ("gitdir: <main>/.git/worktrees/<name>"); in the main
    // checkout .git is a directory and this read throws.
    const gitdir = /^gitdir:\s*(.+)$/m.exec(readFileSync(join(root, '.git'), 'utf8'))?.[1].trim();
    if (gitdir) {
      const common = (readFileSync(join(gitdir, 'commondir'), 'utf8').trim() || '../..');
      return join(dirname(resolve(gitdir, common)), '.env.instagram');
    }
  } catch { /* main checkout */ }
  return join(root, '.env.instagram');
}
