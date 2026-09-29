// node --test .claude/hooks/git-guard.test.mjs   (npm run test:hooks)
//
// Fixture repos are plain files, the same shape git writes: a main checkout has a .git DIRECTORY,
// a linked worktree has a .git FILE pointing at <main>/.git/worktrees/<name>. No git binary needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { evaluate, tokenize } from './git-guard.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'git-guard-'));
const MAIN = path.join(tmp, 'crwn');
const w = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
w(path.join(MAIN, '.git', 'HEAD'), 'ref: refs/heads/master\n');
w(path.join(MAIN, '.git', 'refs', 'remotes', 'origin', 'HEAD'), 'ref: refs/remotes/origin/master\n');
const worktree = (name) => {
  const dir = path.join(MAIN, '.claude', 'worktrees', name);
  const gd = path.join(MAIN, '.git', 'worktrees', name);
  w(path.join(gd, 'HEAD'), `ref: refs/heads/worktree-${name}\n`);
  w(path.join(gd, 'commondir'), '../..\n');
  w(path.join(dir, '.git'), `gitdir: ${gd}\n`);
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  return dir;
};
const A = worktree('task-a');
const B = worktree('task-b');

const run = (sessionDir, command, tool = 'Bash') =>
  evaluate({ tool_name: tool, tool_input: { command }, cwd: sessionDir }, { CLAUDE_PROJECT_DIR: sessionDir });
const blocked = (dir, cmd, tool) => assert.ok(run(dir, cmd, tool), `expected BLOCK: ${cmd}`);
const allowed = (dir, cmd, tool) => assert.equal(run(dir, cmd, tool), null, `expected ALLOW: ${cmd}`);

test('tokenizer splits operators and keeps quoted text whole', () => {
  assert.deepEqual(tokenize(`git commit -m "a; b" && git push`), [['git', 'commit', '-m', 'a; b'], ['git', 'push']]);
  assert.deepEqual(tokenize(`bash -lc 'cd /x && git status'`), [['bash', '-lc', 'cd /x && git status']]);
});

test('task worktree: its own branch commits and pushes normally', () => {
  allowed(A, 'git add src/x.ts && git commit -m "fix: never push to master" && git push -u origin HEAD');
  allowed(A, 'git push');
  allowed(A, 'git push origin worktree-task-a');
  allowed(A, 'git push --force-with-lease origin worktree-task-a');
  allowed(A, 'git fetch origin && git merge origin/master');
  allowed(A, 'git reset --hard HEAD~1');
  allowed(A, 'git clean -fd');
  allowed(A, 'git checkout -- src/x.ts');
  allowed(A, 'git branch -d old-merged-branch');
  allowed(A, `git -C ${MAIN} status && git -C ${MAIN} log --oneline -3 && git -C ${B} diff`);
  allowed(A, 'npm test && npm run build');
  allowed(A, 'echo git push origin master');
  allowed(A, 'git push --dry-run origin HEAD:master');
});

test('task worktree: every route to the integration branch is blocked', () => {
  blocked(A, 'git push origin HEAD:master');
  blocked(A, 'git push origin master');
  blocked(A, 'git push origin refs/heads/worktree-task-a:refs/heads/main');
  blocked(A, 'git push origin +HEAD:master');
  blocked(A, 'git push --all origin');
  blocked(A, `git -C ${MAIN} push origin master`);
  blocked(A, `cd ${MAIN} && git push`);
  blocked(A, `wsl.exe -d Ubuntu -e bash -lc 'cd /anywhere && git push origin HEAD:master'`);
  blocked(A, 'gh pr merge 42 --merge');
  blocked(A, `cd ${MAIN} && scripts/dev/crwn land task-a --yes`);
  blocked(A, 'bash scripts/dev/crwn sync');
  allowed(A, 'scripts/dev/crwn ls');
  allowed(MAIN, 'scripts/dev/crwn land task-a --yes');
});

test('task worktree: cannot write into another checkout', () => {
  blocked(A, `git -C ${MAIN} commit -m x`);
  blocked(A, `cd ${MAIN} && git checkout -- src/x.ts`);
  blocked(A, `git -C ${B} reset --hard`);
  blocked(A, `cd ${B} && git add -A`);
  blocked(A, `git -C ${MAIN} checkout some-branch`);
});

test('anywhere: commands that delete another session\'s work', () => {
  blocked(A, 'git branch -D worktree-task-b');
  blocked(A, 'git worktree remove --force .claude/worktrees/task-b');
  blocked(MAIN, 'git branch -D worktree-task-a');
  allowed(MAIN, 'git worktree remove .claude/worktrees/task-a');
});

test('main checkout: integration push is allowed, force/delete/mirror are not', () => {
  allowed(MAIN, 'git push origin master');
  allowed(MAIN, 'git push origin worktree-task-a:master');
  blocked(MAIN, 'git push --force origin master');
  blocked(MAIN, 'git push -f origin HEAD:master');
  blocked(MAIN, 'git push origin :master');
  blocked(MAIN, 'git push --delete origin master');
  blocked(MAIN, 'git push --mirror origin');
  blocked(MAIN, 'git push --force origin master', 'PowerShell');
});

test('main checkout: shared, so discarding work there is blocked', () => {
  blocked(MAIN, 'git reset --hard');
  blocked(MAIN, 'git checkout -- .');
  blocked(MAIN, 'git checkout .');
  blocked(MAIN, 'git restore src/x.ts');
  blocked(MAIN, 'git clean -fd');
  blocked(MAIN, 'git stash drop');
  blocked(MAIN, 'git stash clear');
  blocked(MAIN, `git -C ${A} commit -m x`);
  allowed(MAIN, 'git restore --staged src/x.ts');
  allowed(MAIN, 'git clean -n');
  allowed(MAIN, 'git stash && git stash list');
  allowed(MAIN, 'git status && git diff --cached --stat && git commit -F /tmp/msg -- src/x.ts');
});

test('non-git tools and commands are ignored', () => {
  assert.equal(evaluate({ tool_name: 'Edit', tool_input: { command: 'git push --force origin master' }, cwd: MAIN }), null);
  allowed(MAIN, 'ls -la && npm run lint');
});
