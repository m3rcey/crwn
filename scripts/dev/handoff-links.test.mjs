// node --test scripts/dev/handoff-links.test.mjs   (npm run test:hooks)
//
// Does `crwn land` hand over a link that actually OPENS?
//
// The failure this pins (2026-10-02): a migration that had landed on origin/master was handed over
// as a repo-relative link, but the founder's main checkout was 8 commits behind, so the link opened
// nothing and he could not run the SQL. "Landed" is not "in his checkout", and the only thing that
// decides whether a markdown link opens is whether the path exists under the main checkout.
//
// print_handoff_links lives in scripts/dev/crwn (bash), so each case runs it there for real,
// against real files on disk, rather than reimplementing its logic here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CRWN = join(dirname(fileURLToPath(import.meta.url)), 'crwn');

/** Run print_handoff_links from the real script, with ROOT pointed at a scratch checkout. */
function run(root, list) {
  const script = `eval "$(sed -n '/^print_handoff_links() {/,/^}/p' "$1")"; ROOT="$2"; print_handoff_links "$3"`;
  return execFileSync('bash', ['-c', script, 'bash', CRWN, root, list], { encoding: 'utf8' });
}

function scratch() {
  const root = mkdtempSync(join(tmpdir(), 'handoff-'));
  mkdirSync(join(root, 'supabase'), { recursive: true });
  mkdirSync(join(root, '.claude/worktrees/task-a/supabase'), { recursive: true });
  writeFileSync(join(root, 'supabase/present.sql'), '-- in the main checkout');
  writeFileSync(join(root, '.claude/worktrees/task-a/supabase/branch-only.sql'), '-- only on a branch');
  return root;
}

test('a file in the main checkout is linked repo-relative', () => {
  const root = scratch();
  try {
    assert.match(run(root, 'supabase/present.sql'), /\[supabase\/present\.sql\]\(supabase\/present\.sql\)/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a file that only exists on a branch is linked by its worktree path, and says why', () => {
  const root = scratch();
  try {
    const out = run(root, 'supabase/branch-only.sql');
    assert.match(out, /\[\.claude\/worktrees\/task-a\/supabase\/branch-only\.sql\]\(\.claude\/worktrees\/task-a\/supabase\/branch-only\.sql\)/);
    assert.match(out, /main checkout does not have this yet/);
    // The trap: it must NOT offer the repo-relative form, which is what opened nothing.
    assert.doesNotMatch(out, /\[supabase\/branch-only\.sql\]\(supabase\/branch-only\.sql\)/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a file on no disk anywhere refuses to be handed over', () => {
  const root = scratch();
  try {
    const out = run(root, 'supabase/nowhere.sql');
    assert.match(out, /NOT on disk anywhere/);
    assert.match(out, /crwn sync/);
    assert.doesNotMatch(out, /\]\(supabase\/nowhere\.sql\)/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a land with no SQL prints nothing at all', () => {
  const root = scratch();
  try {
    assert.equal(run(root, '').trim(), '');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('several files are each resolved on their own', () => {
  const root = scratch();
  try {
    const out = run(root, 'supabase/present.sql\nsupabase/branch-only.sql');
    assert.match(out, /\[supabase\/present\.sql\]\(supabase\/present\.sql\)/);
    assert.match(out, /\[\.claude\/worktrees\/task-a\/supabase\/branch-only\.sql\]/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
