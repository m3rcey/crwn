// node --test scripts/dev/worktree-clean.test.mjs   (npm run test:hooks)
//
// A real repository with a bare origin and one task worktree per safety rule, swept by the real
// command. Every worktree is backdated two days first, so "in use" is only what a case makes it.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decide, normalizeCwd, isInside, run } from './worktree-clean.mjs';

const SCRIPT = fileURLToPath(new URL('./worktree-clean.mjs', import.meta.url));
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'crwn-clean-')));
Object.assign(process.env, {
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
  CRWN_TRANSCRIPT_DIRS: path.join(tmp, 'transcripts'),
});
delete process.env.CLAUDECODE; // the test runner may itself be a Claude session

const sh = (cwd, ...args) => {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const w = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const exists = (p) => fs.existsSync(p);

const ORIGIN = path.join(tmp, 'origin.git');
const MAIN = path.join(tmp, 'crwn');
const WTS = path.join(MAIN, '.claude', 'worktrees');
sh(tmp, 'init', '-q', '--bare', '-b', 'master', ORIGIN);
sh(tmp, 'clone', '-q', ORIGIN, MAIN);
w(path.join(MAIN, '.gitignore'), '/node_modules\n/.next/\n.env*.local\nnext-env.d.ts\n/.claude/worktrees/\n');
w(path.join(MAIN, 'app.ts'), 'export {};\n');
sh(MAIN, 'add', '.');
sh(MAIN, 'commit', '-qm', 'base');
sh(MAIN, 'push', '-q', 'origin', 'HEAD:master');
sh(MAIN, 'remote', 'set-head', 'origin', 'master');
w(path.join(MAIN, 'node_modules', 'next', 'package.json'), '{"name":"next"}\n');
w(path.join(MAIN, '.env.local'), 'SECRET=main\n');

const dir = (n) => path.join(WTS, n);
/** A task worktree. landed: its commit is pushed to master. Every one gets a .next. */
function task(name, { landed = true, commit = true } = {}) {
  sh(MAIN, 'worktree', 'add', '-q', '-b', `worktree-${name}`, dir(name), 'origin/master');
  if (commit) {
    w(path.join(dir(name), `${name}.ts`), `export const ${name.replace(/-/g, '_')} = 1;\n`);
    sh(dir(name), 'add', '.');
    sh(dir(name), 'commit', '-qm', name);
  }
  if (landed) {
    sh(MAIN, 'fetch', '-q', 'origin');
    sh(dir(name), 'merge', '-q', '--no-edit', 'origin/master');
    sh(dir(name), 'push', '-q', 'origin', `HEAD:master`, `HEAD:worktree-${name}`);
  }
  w(path.join(dir(name), '.next', 'cache', 'turbopack', 'blob'), 'x'.repeat(4096));
  return dir(name);
}

task('landed');
// node_modules shared by hardlink with the main checkout, the way the SessionStart hook makes it
spawnSync('cp', ['-al', path.join(MAIN, 'node_modules'), path.join(dir('landed'), 'node_modules')]);
w(path.join(dir('landed'), 'node_modules', '.crwn-hardlinked'), 'linked\n');
task('unlanded', { landed: false });
task('dirty');
fs.appendFileSync(path.join(dir('dirty'), 'app.ts'), '// work in progress\n');
task('untracked');
w(path.join(dir('untracked'), 'notes.md'), 'not added yet\n');
task('busy-proc');
task('busy-transcript');
task('recent-edit');
task('own-env');
w(path.join(dir('own-env'), '.env.local'), 'SECRET=only-here\n');
task('copied-env');
fs.copyFileSync(path.join(MAIN, '.env.local'), path.join(dir('copied-env'), '.env.local'));
w(path.join(dir('copied-env'), 'next-env.d.ts'), '// generated\n');
task('locked-live');
sh(MAIN, 'worktree', 'lock', '--reason', `claude agent (pid ${process.pid})`, dir('locked-live'));
task('locked-dead');
sh(MAIN, 'worktree', 'lock', '--reason', 'claude agent (pid 999999)', dir('locked-dead'));
task('skipme');
task('gone');
sh(MAIN, 'fetch', '-q', 'origin');

// Two days old, everything: files, folders, and git's own records.
const old = new Date(Date.now() - 48 * 3600 * 1000);
(function backdate(p) {
  const st = fs.lstatSync(p);
  if (st.isSymbolicLink()) return;
  if (st.isDirectory()) for (const e of fs.readdirSync(p)) backdate(path.join(p, e));
  fs.utimesSync(p, old, old);
})(tmp);

// The cases that are in use now.
const sleeper = spawn('sleep', ['120'], { cwd: path.join(dir('busy-proc')), stdio: 'ignore' });
after(() => { sleeper.kill(); fs.rmSync(tmp, { recursive: true, force: true }); });
const winPath = '\\\\wsl.localhost\\Ubuntu' + dir('busy-transcript').replace(/\//g, '\\');
w(path.join(tmp, 'transcripts', 'some-project', 'session.jsonl'),
  `{"type":"user","cwd":${JSON.stringify(winPath + '\\src')},"message":"hi"}\n` +
  // a cwd quoted INSIDE a tool result is text, not where the session ran
  `{"type":"tool_result","content":"{\\"cwd\\":\\"${dir('recent-edit')}\\"}"}\n`);
fs.utimesSync(path.join(dir('recent-edit'), 'app.ts'), new Date(), new Date()); // edited now, content unchanged
fs.rmSync(dir('gone'), { recursive: true, force: true }); // deleted by hand: only git's entry remains

const branches = () => sh(MAIN, 'for-each-ref', '--format=%(refname:short) %(objectname)', 'refs/heads').split('\n').sort();
const worktreeList = () => sh(MAIN, 'worktree', 'list', '--porcelain');
const quiet = () => {};

test('decide: the rules, case by case', () => {
  const base = { exists: true, active: [], dirty: 0, merged: true, ahead: 0, pushed: true, base: 'master',
    unknownIgnored: [], caches: { '.next': true, node_modules: true } };
  assert.equal(decide(base).action, 'remove');
  assert.deepEqual(decide({ ...base, active: ['process 1 is running in it'] }), { action: 'keep', trim: [], why: 'in use: process 1 is running in it' });
  assert.equal(decide({ ...base, dirty: 1 }).action, 'keep', 'dirty is never removed, landed or not');
  assert.deepEqual(decide({ ...base, dirty: 1 }).trim, ['.next', 'node_modules'], 'but an idle dirty tree still loses its caches');
  assert.equal(decide({ ...base, merged: false, ahead: 2 }).action, 'keep', 'unlanded commits are never put at risk');
  assert.equal(decide({ ...base, unknownIgnored: ['.env.local'] }).action, 'keep');
  assert.equal(decide({ ...base, skipped: true }).action, 'keep');
  assert.deepEqual(decide({ ...base, skipped: true }).trim, []);
  assert.equal(decide({ ...base, exists: false }).action, 'prune');
});

test('transcript cwds in every form Claude writes them', () => {
  assert.equal(normalizeCwd('\\\\wsl.localhost\\Ubuntu\\home\\m\\crwn\\.claude\\worktrees\\a'), '/home/m/crwn/.claude/worktrees/a');
  assert.equal(normalizeCwd('//wsl.localhost/Ubuntu/home/m/crwn'), '/home/m/crwn');
  assert.equal(normalizeCwd('\\\\wsl$\\Ubuntu\\home\\m'), '/home/m');
  assert.ok(isInside('/home/m/crwn/.claude/worktrees/a/src', '/home/m/crwn/.claude/worktrees/a'));
  assert.equal(isInside('/home/m/crwn/.claude/worktrees/ab', '/home/m/crwn/.claude/worktrees/a'), false, 'a name prefix is another task');
});

test('dry run reports every worktree and changes nothing', () => {
  const before = { b: branches(), l: worktreeList() };
  const lines = [];
  const { plans } = run(['--repo', MAIN, '--no-fetch', '--skip', 'skipme'], (s) => lines.push(s));
  const out = lines.join('\n');
  const plan = Object.fromEntries(plans.map((p) => [p.f.name, p.plan]));
  assert.equal(plan.landed.action, 'remove');
  assert.equal(plan['copied-env'].action, 'remove', 'a byte-identical copy of the main .env.local is not work');
  assert.equal(plan['locked-dead'].action, 'remove', 'a lock held by a dead pid is stale');
  assert.equal(plan.gone.action, 'prune');
  for (const n of ['unlanded', 'dirty', 'untracked', 'own-env', 'busy-proc', 'busy-transcript', 'recent-edit', 'locked-live', 'skipme']) {
    assert.equal(plan[n]?.action, 'keep', `${n} is kept`);
  }
  assert.match(plan['busy-proc'].why, /process \d+ sleep/);
  assert.match(plan['busy-transcript'].why, /Claude session/);
  assert.match(plan['recent-edit'].why, /app\.ts changed/);
  assert.match(plan['locked-live'].why, /locked by running process/);
  assert.match(plan.unlanded.why, /1 commit\(s\) not in origin\/master, and the branch is not pushed/);
  assert.match(plan['own-env'].why, /\.env\.local/);
  for (const s of ['landed: yes', 'tree: DIRTY', 'in use: no', 'disk:', 'Dry run: nothing was changed']) assert.ok(out.includes(s), `report shows "${s}"`);
  assert.deepEqual(branches(), before.b);
  assert.equal(worktreeList(), before.l);
  for (const n of ['landed', 'unlanded', 'dirty', 'own-env']) assert.ok(exists(path.join(dir(n), '.next')), `${n} still has .next`);
});

test('a task session may not apply it', () => {
  const env = { ...process.env, CLAUDECODE: '1' };
  const applied = spawnSync('node', [SCRIPT, '--repo', MAIN, '--no-fetch', '--apply'], { cwd: dir('unlanded'), env, encoding: 'utf8' });
  assert.equal(applied.status, 1);
  assert.match(applied.stderr, /task session never cleans up/);
  assert.ok(exists(dir('landed')), 'nothing was removed');
  const dry = spawnSync('node', [SCRIPT, '--repo', MAIN, '--no-fetch', '--no-sizes'], { cwd: dir('unlanded'), env, encoding: 'utf8' });
  assert.equal(dry.status, 0, 'a dry run is fine from anywhere');
});

test('apply: removes only what is landed, clean and idle; keeps every branch, commit and edit', () => {
  const before = branches();
  const unlandedTip = sh(dir('unlanded'), 'rev-parse', 'HEAD');
  run(['--repo', MAIN, '--no-fetch', '--apply', '--skip', 'skipme'], quiet);

  for (const n of ['landed', 'copied-env', 'locked-dead']) assert.equal(exists(dir(n)), false, `${n} removed`);
  assert.ok(!worktreeList().includes(dir('gone')), 'the stale entry was pruned');
  assert.deepEqual(branches(), before, 'no branch deleted or moved');
  assert.equal(sh(MAIN, 'rev-parse', 'worktree-unlanded'), unlandedTip, 'the unlanded commit is intact');
  assert.equal(fs.readFileSync(path.join(MAIN, 'node_modules', 'next', 'package.json'), 'utf8'), '{"name":"next"}\n',
    'removing a hardlinked node_modules never touches the main checkout');

  for (const n of ['unlanded', 'dirty', 'untracked', 'own-env']) {
    assert.ok(exists(dir(n)), `${n} kept`);
    assert.equal(exists(path.join(dir(n), '.next')), false, `${n} is idle, so its .next is gone`);
  }
  assert.match(fs.readFileSync(path.join(dir('dirty'), 'app.ts'), 'utf8'), /work in progress/, 'the uncommitted edit survives');
  assert.ok(exists(path.join(dir('untracked'), 'notes.md')), 'the untracked file survives');
  assert.equal(fs.readFileSync(path.join(dir('own-env'), '.env.local'), 'utf8'), 'SECRET=only-here\n');

  for (const n of ['busy-proc', 'busy-transcript', 'recent-edit', 'locked-live', 'skipme']) {
    assert.ok(exists(path.join(dir(n), '.next', 'cache', 'turbopack', 'blob')), `${n} is untouched, caches included`);
  }
});

test('a removed worktree comes back from its kept branch', () => {
  sh(MAIN, 'worktree', 'add', '-q', dir('landed'), 'worktree-landed');
  assert.ok(exists(path.join(dir('landed'), 'landed.ts')));
});
