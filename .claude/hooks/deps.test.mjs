// node --test .claude/hooks/deps.test.mjs   (npm run test:hooks)
// Real files, real hardlinks, a real `cp`: the property under test is inode sharing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { linkDeps, isolateDeps, isLinked, mutatesDeps, MARKER } from './deps.mjs';
import { evaluateAll } from './git-guard.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crwn-deps-'));
const MAIN = path.join(tmp, 'crwn');
const w = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const ino = (p) => fs.statSync(p).ino;

// a main checkout with a node_modules, and one linked task worktree
w(path.join(MAIN, '.git', 'HEAD'), 'ref: refs/heads/master\n');
w(path.join(MAIN, 'node_modules', 'pkg', 'index.js'), 'module.exports = 1;\n');
w(path.join(MAIN, 'node_modules', '.package-lock.json'), '{"packages":{}}\n');
w(path.join(MAIN, 'node_modules', '.vite', 'vitest', 'results.json'), '{}\n');
const WT = path.join(MAIN, '.claude', 'worktrees', 'task-a');
const GD = path.join(MAIN, '.git', 'worktrees', 'task-a');
w(path.join(GD, 'HEAD'), 'ref: refs/heads/worktree-task-a\n');
w(path.join(GD, 'commondir'), '../..\n');
w(path.join(WT, '.git'), `gitdir: ${GD}\n`);

test('linkDeps shares package files but not the files tools rewrite in place', () => {
  assert.ok(linkDeps(WT, MAIN));
  const nm = (r, p) => path.join(r, 'node_modules', p);
  assert.equal(ino(nm(WT, 'pkg/index.js')), ino(nm(MAIN, 'pkg/index.js')), 'package file is hardlinked');
  assert.notEqual(ino(nm(WT, '.package-lock.json')), ino(nm(MAIN, '.package-lock.json')), 'hidden lockfile is its own copy');
  assert.notEqual(ino(nm(WT, '.vite/vitest/results.json')), ino(nm(MAIN, '.vite/vitest/results.json')), 'vitest cache is its own copy');
  assert.ok(isLinked(WT));
  assert.equal(fs.existsSync(nm(MAIN, MARKER)), false, 'the main checkout is never marked');
  assert.equal(linkDeps(WT, MAIN), null, 'a second start leaves an existing node_modules alone');
});

test('the guard asks for isolation before a dependency change in a linked worktree, and only then', () => {
  const iso = (cmd, dir = WT) => evaluateAll({ tool_name: 'Bash', tool_input: { command: cmd }, cwd: dir }, { CLAUDE_PROJECT_DIR: dir }).isolate;
  assert.deepEqual(iso('npm install left-pad'), [WT]);
  assert.deepEqual(iso('npm i -D zod && npm test'), [WT]);
  assert.deepEqual(iso('npm uninstall qrcode'), [WT]);
  assert.deepEqual(iso('npm rebuild'), [WT]);
  assert.deepEqual(iso('npm audit fix'), [WT]);
  assert.deepEqual(iso(`cd ${WT}/src && npm update next`), [WT]);
  assert.deepEqual(iso('npm test && npm run build && npx vitest run'), []);
  assert.deepEqual(iso('npm ci'), [], 'npm ci replaces node_modules itself');
  assert.deepEqual(iso('npm install -g something'), [], 'a global install never touches this tree');
  assert.deepEqual(iso('npm install left-pad', MAIN), [], 'the main checkout owns its tree');
  assert.ok(mutatesDeps(['npm', '--silent', 'add', 'x']));
  assert.equal(mutatesDeps(['npm', 'run', 'install']), false);
});

test('isolateDeps gives the worktree its own copy; the main checkout keeps its files', () => {
  const before = fs.readFileSync(path.join(MAIN, 'node_modules', 'pkg', 'index.js'), 'utf8');
  assert.equal(isolateDeps(WT), true);
  assert.notEqual(ino(path.join(WT, 'node_modules/pkg/index.js')), ino(path.join(MAIN, 'node_modules/pkg/index.js')));
  assert.equal(fs.readFileSync(path.join(WT, 'node_modules/pkg/index.js'), 'utf8'), before, 'same content');
  assert.equal(isLinked(WT), false, 'marker gone');
  assert.equal(fs.readFileSync(path.join(MAIN, 'node_modules/pkg/index.js'), 'utf8'), before, 'main untouched');
  fs.writeFileSync(path.join(WT, 'node_modules/pkg/index.js'), 'changed in the worktree\n');
  assert.equal(fs.readFileSync(path.join(MAIN, 'node_modules/pkg/index.js'), 'utf8'), before, 'a write in the worktree no longer reaches main');
  assert.equal(isolateDeps(WT), false, 'isolating twice is a no-op');
  const iso = evaluateAll({ tool_name: 'Bash', tool_input: { command: 'npm install x' }, cwd: WT }, { CLAUDE_PROJECT_DIR: WT }).isolate;
  assert.deepEqual(iso, [], 'an isolated worktree needs nothing more');
});
