// node --test scripts/dev/worktree-clean.test.mjs   (npm run test:hooks)
//
// Real repositories with a bare origin, swept by the real engine. Checkouts are NOT backdated: a real
// task worktree is always freshly checked out, git always just moved its HEAD, and its transcript
// always names it. The first version of this suite backdated every file two days before sweeping,
// which is exactly why it never noticed that those three facts kept EVERY worktree for 12 hours
// (2026-10-02: 29 worktrees, 17 GB, C: at 0.5 GB). Only the creation record and transcripts are aged.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decide, budget, limits, normalizeCwd, isInside, run, linuxPidDomain, REFUSED } from './worktree-clean.mjs';
import { toLinux, creates } from '../../.claude/hooks/worktree-preflight.mjs';

const SCRIPT = fileURLToPath(new URL('./worktree-clean.mjs', import.meta.url));
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'crwn-clean-')));
Object.assign(process.env, {
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
});
delete process.env.CLAUDECODE; // the test runner may itself be a Claude session
const children = [];
after(() => { for (const c of children) c.kill(); fs.rmSync(tmp, { recursive: true, force: true }); });

const sh = (cwd, ...args) => {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const w = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const exists = (p) => fs.existsSync(p);
const quiet = () => {};
const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000);
const startOf = (pid) => { const s = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); return s.slice(s.lastIndexOf(')') + 2).split(' ')[19]; };
const sleeper = (cwd) => { const c = spawn('sleep', ['300'], { cwd, stdio: 'ignore' }); children.push(c); return c; };
const winForm = (p) => '\\\\wsl.localhost\\Ubuntu' + p.replace(/\//g, '\\');

/** A repository, an origin, two .claude dirs (WSL and Windows) and a fake Windows process table. */
function makeRepo(label) {
  const home = path.join(tmp, label);
  const ORIGIN = path.join(home, 'origin.git');
  const MAIN = path.join(home, 'crwn');
  const WTS = path.join(MAIN, '.claude', 'worktrees');
  const wsl = path.join(home, 'claude-wsl');
  const win = path.join(home, 'claude-win');
  const winProcs = path.join(home, 'win-procs.json');
  fs.mkdirSync(home, { recursive: true });
  sh(home, 'init', '-q', '--bare', '-b', 'master', ORIGIN);
  sh(home, 'clone', '-q', ORIGIN, MAIN);
  w(path.join(MAIN, '.gitignore'), '/node_modules\n/.next/\n.env*.local\nnext-env.d.ts\n/.claude/worktrees/\n');
  w(path.join(MAIN, 'app.ts'), 'export {};\n');
  sh(MAIN, 'add', '.');
  sh(MAIN, 'commit', '-qm', 'base');
  sh(MAIN, 'push', '-q', 'origin', 'HEAD:master');
  sh(MAIN, 'remote', 'set-head', 'origin', 'master');
  w(path.join(MAIN, 'node_modules', 'next', 'package.json'), '{"name":"next"}\n');
  w(path.join(MAIN, '.env.local'), 'SECRET=main\n');
  w(winProcs, '{}');
  const procs = {};
  const r = {
    MAIN, WTS, wsl, win,
    dir: (n) => path.join(WTS, n),
    env: (extra = {}) => ({ ...process.env, CRWN_CLAUDE_DIRS: `${wsl}:${win}`, CRWN_WIN_PROC_FILE: winProcs, CRWN_C_DRIVE: tmp, ...extra }),
    /** A task worktree created `ageHours` ago. landed: its commit is on master. Every one gets a .next. */
    task(name, { landed = true, ageHours = 2, nextKb = 4 } = {}) {
      const d = r.dir(name);
      sh(MAIN, 'worktree', 'add', '-q', '-b', `worktree-${name}`, d, 'origin/master');
      w(path.join(d, `${name}.ts`), `export const x = '${name}';\n`);
      sh(d, 'add', '.');
      sh(d, 'commit', '-qm', name);
      if (landed) {
        sh(d, 'fetch', '-q', 'origin');
        sh(d, 'merge', '-q', '--no-edit', 'origin/master');
        sh(d, 'push', '-q', 'origin', 'HEAD:master', `HEAD:worktree-${name}`);
      }
      w(path.join(d, '.next', 'cache', 'turbopack', 'blob'), 'x'.repeat(nextKb * 1024));
      w(path.join(d, '.next', 'BUILD_ID'), 'b\n');
      spawnSync('cp', ['-al', path.join(MAIN, 'node_modules'), path.join(d, 'node_modules')]);
      w(path.join(d, 'node_modules', '.crwn-hardlinked'), 'linked\n');
      const t = hoursAgo(ageHours);
      fs.utimesSync(path.join(MAIN, '.git', 'worktrees', name, 'commondir'), t, t); // when it was created
      return d;
    },
    /** A transcript under a .claude dir whose last line records `cwd`, last written `hours` ago. */
    transcript(side, sessionId, cwd, hours, sub = null) {
      const base = path.join(side === 'win' ? win : wsl, 'projects', 'proj');
      const f = sub ? path.join(base, sessionId, 'subagents', `${sub}.jsonl`) : path.join(base, `${sessionId}.jsonl`);
      w(f, `{"type":"user","cwd":${JSON.stringify(path.join(MAIN))},"message":"start"}\n` +
        `{"type":"assistant","cwd":${JSON.stringify(cwd)},"message":"work"}\n` +
        // a cwd quoted INSIDE a tool result is text, not where the session ran
        `{"type":"tool_result","content":"{\\"cwd\\":\\"/nowhere\\"}"}\n`);
      fs.utimesSync(f, hoursAgo(hours), hoursAgo(hours));
    },
    /** A sessions/<pid>.json registry entry, the way Claude writes it. */
    session(side, { pid, procStart, sessionId, cwd, name = sessionId }) {
      const pidDomain = side === 'win' ? 'win32:desktop-test' : linuxPidDomain();
      w(path.join(side === 'win' ? win : wsl, 'sessions', `${pid}.json`),
        JSON.stringify({ pid, sessionId, cwd, procStart: String(procStart), pidDomain, kind: 'interactive', name, status: 'idle' }));
    },
    winProcess(pid, name, filetime) { procs[pid] = { name, filetime }; w(winProcs, JSON.stringify(procs)); },
    lock: (name, reason) => sh(MAIN, 'worktree', 'lock', '--reason', reason, r.dir(name)),
    branches: () => sh(MAIN, 'for-each-ref', '--format=%(refname:short) %(objectname)', 'refs/heads').split('\n').sort(),
  };
  return r;
}

// ---------------------------------------------------------------- the rules, pure

test('decide: source and cache have different rules', () => {
  const base = { exists: true, live: { level: 'none', why: [] }, dirty: 0, merged: true, ahead: 0, pushed: true, base: 'master',
    unknownIgnored: [], caches: { '.next': true, node_modules: true } };
  const owned = { level: 'owned', why: ['live Claude session s, pid 1'] };
  assert.equal(decide(base).action, 'remove', 'landed, clean, held by nothing: removed now, whatever its history');
  assert.deepEqual(decide({ ...base, live: { level: 'busy', why: ['process 9 next'] } }).trim, [], 'busy: nothing is touched');
  assert.equal(decide({ ...base, live: { level: 'busy', why: ['x'] } }).action, 'keep');
  assert.equal(decide({ ...base, live: owned }).action, 'keep', 'a live session keeps its source');
  assert.deepEqual(decide({ ...base, live: owned }).trim, ['.next'], 'but a landed, clean task loses its build cache at once');
  assert.deepEqual(decide({ ...base, live: owned, merged: false, ahead: 1 }).trim, [], 'an active unlanded task keeps its warm cache');
  assert.deepEqual(decide({ ...base, live: owned, merged: false, ahead: 1 }, { aggressive: true }).trim, ['.next'], 'unless storage is over budget');
  assert.deepEqual(decide({ ...base, live: owned, dirty: 2 }).trim, [], 'work in progress keeps its cache');
  assert.equal(decide({ ...base, dirty: 1 }).action, 'keep', 'dirty is never removed');
  assert.deepEqual(decide({ ...base, dirty: 1 }).trim, ['.next', 'node_modules'], 'but nobody is using its caches');
  assert.equal(decide({ ...base, merged: false, ahead: 2 }).action, 'keep', 'unlanded commits are never put at risk');
  assert.equal(decide({ ...base, unknownIgnored: ['.env.local'] }).action, 'keep');
  assert.deepEqual(decide({ ...base, skipped: true }), { action: 'keep', trim: [], why: 'skipped (--skip)' });
  assert.equal(decide({ ...base, exists: false }).action, 'prune');
});

test('budget: warning, aggressive, hard limit and C: thresholds', () => {
  const lim = limits({});
  assert.deepEqual([lim.warnMb, lim.aggressiveMb, lim.hardMb, lim.cWarnGb, lim.cCriticalGb], [3072, 4096, 5120, 10, 5], 'the defaults');
  const GB = 1024 ** 3;
  const kb = (mb) => mb * 1024;
  assert.deepEqual(budget(kb(1000), 50 * GB, lim, { preflight: true }), { aggressive: false, warn: [], refuse: [] });
  assert.equal(budget(kb(3200), 50 * GB, lim).warn.length, 1, 'over 3 GB warns');
  assert.equal(budget(kb(3200), 50 * GB, lim).aggressive, false);
  assert.equal(budget(kb(4200), 50 * GB, lim).aggressive, true, 'over 4 GB goes aggressive');
  assert.equal(budget(kb(4600), 50 * GB, lim, { preflight: true }).refuse.length, 1, 'one more ~600 MB worktree would pass 5 GB');
  assert.equal(budget(kb(4600), 50 * GB, lim).refuse.length, 0, 'only a preflight refuses');
  assert.equal(budget(kb(100), 8 * GB, lim, { preflight: true }).warn.length, 1, 'C: under 10 GB warns');
  assert.equal(budget(kb(100), 8 * GB, lim, { preflight: true }).refuse.length, 0);
  assert.match(budget(kb(100), 4 * GB, lim, { preflight: true }).refuse[0], /^C: has 4\.0 GB free/, 'C: under 5 GB refuses');
  assert.equal(budget(kb(100), null, lim, { preflight: true }).refuse.length, 0, 'an unreadable C: is not a refusal');
  assert.equal(limits({ CRWN_WT_HARD_MB: '9000', CRWN_C_CRITICAL_GB: '2' }).hardMb, 9000, 'configurable');
});

test('transcript cwds in every form Claude writes them', () => {
  assert.equal(normalizeCwd('\\\\wsl.localhost\\Ubuntu\\home\\m\\crwn\\.claude\\worktrees\\a'), '/home/m/crwn/.claude/worktrees/a');
  assert.equal(normalizeCwd('//wsl.localhost/Ubuntu/home/m/crwn'), '/home/m/crwn');
  assert.equal(normalizeCwd('\\\\wsl$\\Ubuntu\\home\\m'), '/home/m');
  assert.ok(isInside('/home/m/crwn/.claude/worktrees/a/src', '/home/m/crwn/.claude/worktrees/a'));
  assert.equal(isInside('/home/m/crwn/.claude/worktrees/ab', '/home/m/crwn/.claude/worktrees/a'), false, 'a name prefix is another task');
});

// ---------------------------------------------------------------- the measured failure

test('a day of 30 landed tasks does not survive as 30 cached worktrees', () => {
  const R = makeRepo('day');
  // Every task of the day: created 1 to 12 hours ago, landed, its session finished. Each one holds
  // exactly the evidence the 12-hour rule treated as "in use".
  for (let i = 0; i < 30; i++) {
    const name = `t${i}`;
    const age = 1 + (i % 12);
    R.task(name, { ageHours: age, nextKb: 64 });
    const sid = `s${i}`;
    const side = i % 2 ? 'win' : 'wsl';
    R.transcript(side, sid, side === 'win' ? winForm(R.dir(name)) : R.dir(name), age - 0.5); // last written well within 12h
    if (side === 'win') {
      // its session has exited: the pid is gone, or Windows reused it for something else
      R.session('win', { pid: 5000 + i, procStart: 134000 + i, sessionId: sid, cwd: winForm(R.MAIN) });
      if (i % 4 === 1) R.winProcess(5000 + i, 'svchost', null);
    } else {
      R.session('wsl', { pid: 4000000 + i, procStart: 1, sessionId: sid, cwd: R.dir(name) });
    }
    if (i < 10) R.lock(name, `claude session ${name}`); // what a Windows-side session leaves behind
    else if (i < 15) R.lock(name, `claude session ${name} (pid 3999999 start 7)`); // a dead WSL session's
  }
  // The trap, reproduced: the facts the old engine counted as "in use" are true of all 30.
  const since = Date.now() - 12 * 3600 * 1000;
  for (let i = 0; i < 30; i++) {
    assert.ok(fs.statSync(path.join(R.dir(`t${i}`), 'app.ts')).mtimeMs >= since, 'a fresh checkout reads as "a file changed within 12h"');
    const gitDir = path.join(R.MAIN, '.git', 'worktrees', `t${i}`);
    assert.ok(fs.statSync(path.join(gitDir, 'logs', 'HEAD')).mtimeMs >= since, 'the land reads as "git activity within 12h"');
  }
  const before = R.branches();
  const { usageKb } = run(['--repo', R.MAIN, '--no-fetch', '--auto', '--quiet'], quiet, R.env());
  const left = fs.readdirSync(R.WTS);
  assert.deepEqual(left, [], `all 30 removed (left: ${left.join(', ')})`);
  assert.deepEqual(R.branches(), before, 'every branch is kept');
  assert.ok(usageKb < 64, `nothing of the day remains on disk (${usageKb} KB)`);
});

// ---------------------------------------------------------------- every holder, one at a time

test('apply: removes what nothing holds; keeps live, busy, dirty and unlanded work', () => {
  const R = makeRepo('cases');
  const T = {};
  for (const n of ['landed', 'unlanded', 'dirty', 'untracked', 'own-env', 'copied-env', 'busy', 'session-proc',
    'live-linux', 'live-win', 'reused-pid', 'win-unsure', 'stale-linux', 'live-lock', 'dead-lock', 'pidless-lock',
    'subagent', 'old-transcript', 'recent-transcript', 'fresh', 'skipme', 'gone']) {
    T[n] = R.task(n, { landed: n !== 'unlanded', ageHours: n === 'fresh' ? 0.05 : 3 });
  }
  fs.appendFileSync(path.join(T.dirty, 'app.ts'), '// work in progress\n');
  w(path.join(T.untracked, 'notes.md'), 'not added yet\n');
  w(path.join(T['own-env'], '.env.local'), 'SECRET=only-here\n');
  fs.copyFileSync(path.join(R.MAIN, '.env.local'), path.join(T['copied-env'], '.env.local'));

  sleeper(T.busy); // a build or dev server running in it right now
  const own = sleeper(T['session-proc']); // a WSL Claude session whose own cwd is the worktree
  R.session('wsl', { pid: own.pid, procStart: startOf(own.pid), sessionId: 'sp', cwd: T['session-proc'] });
  const elsewhere = sleeper(tmp); // a live WSL session that cd'd into the worktree after starting
  R.session('wsl', { pid: elsewhere.pid, procStart: startOf(elsewhere.pid), sessionId: 'll', cwd: R.MAIN });
  R.transcript('wsl', 'll', T['live-linux'], 6); // quiet for hours, but alive: still held
  R.session('win', { pid: 28688, procStart: '134355407722614546', sessionId: 'lw', cwd: winForm(R.MAIN) });
  R.winProcess(28688, 'claude', '134355407722614546');
  R.transcript('win', 'lw', winForm(T['live-win']), 9);
  R.session('win', { pid: 3472, procStart: '134351755334569019', sessionId: 'rp', cwd: winForm(T['reused-pid']) });
  R.winProcess(3472, 'svchost', null); // the pid outlived its session and now belongs to a service
  R.session('win', { pid: 6161, procStart: '1', sessionId: 'wu', cwd: winForm(T['win-unsure']) });
  R.winProcess(6161, 'claude', null); // a claude.exe Windows will not give a start time for
  R.session('wsl', { pid: 3999998, procStart: '5', sessionId: 'sl', cwd: T['stale-linux'] });
  R.lock('live-lock', `claude session live-lock (pid ${process.pid} start ${startOf(process.pid)})`);
  R.lock('dead-lock', 'claude session dead-lock (pid 3999997 start 9)');
  R.lock('pidless-lock', 'claude session pidless-lock');
  R.session('win', { pid: 7171, procStart: '77', sessionId: 'sa', cwd: winForm(R.MAIN) });
  R.winProcess(7171, 'claude', '77');
  R.transcript('win', 'sa', winForm(R.MAIN), 0.5);
  R.transcript('win', 'sa', winForm(T.subagent), 0.5, 'agent-1'); // its Agent works in its own worktree
  R.transcript('win', 'ot', winForm(T['old-transcript']), 3); // no live process: history only
  R.transcript('wsl', 'rt', T['recent-transcript'], 0.05); // written 3 minutes ago, no registry entry
  fs.rmSync(T.gone, { recursive: true, force: true }); // deleted by hand: only git's entry remains

  const env = R.env();
  const before = R.branches();
  const unlandedTip = sh(T.unlanded, 'rev-parse', 'HEAD');

  // A dry run changes nothing and says why.
  const lines = [];
  const dry = run(['--repo', R.MAIN, '--no-fetch', '--skip', 'skipme'], (s) => lines.push(s), env);
  const plan = Object.fromEntries(dry.plans.map((p) => [p.f.name, p.plan]));
  assert.match(plan.busy.why, /busy right now \(process \d+ sleep/);
  assert.match(plan['session-proc'].why, /Claude session process \d+ is in it/);
  assert.match(plan['live-win'].why, /live Claude session lw, pid 28688/);
  assert.match(plan['win-unsure'].why, /probably live/);
  assert.match(plan.subagent.why, /live Claude session sa/);
  assert.match(plan['recent-transcript'].why, /transcript was written \d+ min ago/);
  assert.match(plan.fresh.why, /created \d+ min ago/);
  assert.match(plan['live-lock'].why, /git lock held by running process/);
  assert.ok(lines.join('\n').includes('Dry run: nothing was changed'));
  for (const n of Object.keys(T).filter((n) => n !== 'gone')) assert.ok(exists(path.join(T[n], '.next')), `dry run left ${n} alone`);

  run(['--repo', R.MAIN, '--no-fetch', '--auto', '--quiet', '--skip', 'skipme'], quiet, env);

  for (const n of ['landed', 'copied-env', 'reused-pid', 'stale-linux', 'dead-lock', 'pidless-lock', 'old-transcript']) {
    assert.equal(exists(T[n]), false, `${n}: landed, clean, nothing holds it now, so it is removed`);
  }
  assert.ok(!sh(R.MAIN, 'worktree', 'list', '--porcelain').includes(T.gone), 'the stale entry was pruned');

  for (const n of ['session-proc', 'live-linux', 'live-win', 'win-unsure', 'live-lock', 'subagent', 'recent-transcript', 'fresh']) {
    assert.ok(exists(path.join(T[n], `${n}.ts`)), `${n}: held now, so its source stays`);
    assert.equal(exists(path.join(T[n], '.next')), false, `${n}: landed and clean, so its .next is gone anyway`);
    assert.ok(exists(path.join(T[n], 'node_modules')), `${n}: a live task keeps node_modules`);
  }
  assert.ok(exists(path.join(T.busy, '.next', 'cache', 'turbopack', 'blob')), 'busy: untouched, caches included');
  assert.ok(exists(path.join(T.skipme, '.next')), 'skipped: untouched');

  for (const n of ['unlanded', 'dirty', 'untracked', 'own-env']) {
    assert.ok(exists(T[n]), `${n}: kept`);
    for (const d of ['.next', 'node_modules']) assert.equal(exists(path.join(T[n], d)), false, `${n}: nobody holds it, so ${d} is gone`);
  }
  assert.match(fs.readFileSync(path.join(T.dirty, 'app.ts'), 'utf8'), /work in progress/, 'the uncommitted edit survives');
  assert.ok(exists(path.join(T.untracked, 'notes.md')), 'the untracked file survives');
  assert.equal(fs.readFileSync(path.join(T['own-env'], '.env.local'), 'utf8'), 'SECRET=only-here\n', 'the private file survives');
  assert.equal(sh(R.MAIN, 'rev-parse', 'worktree-unlanded'), unlandedTip, 'the unlanded commit is intact');
  assert.deepEqual(R.branches(), before, 'no branch deleted or moved');
  assert.equal(fs.readFileSync(path.join(R.MAIN, 'node_modules', 'next', 'package.json'), 'utf8'), '{"name":"next"}\n',
    'removing a hardlinked node_modules never touches the main checkout');

  // A removed worktree comes back from its kept branch.
  sh(R.MAIN, 'worktree', 'add', '-q', T.landed, 'worktree-landed');
  assert.ok(exists(path.join(T.landed, 'landed.ts')));
});

// ---------------------------------------------------------------- the global budget

test('over the aggressive level, every worktree not busy loses .next, live and unlanded included', () => {
  const R = makeRepo('aggressive');
  const live = R.task('live-unlanded', { landed: false, nextKb: 256 });
  const busy = R.task('busy-unlanded', { landed: false, nextKb: 256 });
  const proc = sleeper(tmp);
  R.session('wsl', { pid: proc.pid, procStart: startOf(proc.pid), sessionId: 'lu', cwd: live });
  sleeper(busy);

  run(['--repo', R.MAIN, '--no-fetch', '--auto', '--quiet'], quiet, R.env());
  assert.ok(exists(path.join(live, '.next')), 'under budget, an active unlanded task keeps its warm cache');

  const out = [];
  run(['--repo', R.MAIN, '--no-fetch', '--auto', '--quiet'], (s) => out.push(s), R.env({ CRWN_WT_WARN_MB: '0.1', CRWN_WT_AGGRESSIVE_MB: '0.2' }));
  assert.equal(exists(path.join(live, '.next')), false, 'over budget, it goes');
  assert.ok(exists(path.join(live, 'live-unlanded.ts')) && exists(path.join(live, 'node_modules')), 'and only the cache goes');
  assert.ok(exists(path.join(busy, '.next', 'BUILD_ID')), 'a busy worktree is never touched, even over budget');
  assert.ok(out.some((l) => /WARNING: \.claude\/worktrees holds/.test(l)), 'the warning is printed even with --quiet');
  assert.ok(out.some((l) => /aggressive level/.test(l)));
});

test('preflight refuses a new worktree past the hard limit, and on critical C:, with the fix', () => {
  const R = makeRepo('preflight');
  R.task('wip', { landed: false, nextKb: 512 });
  const proc = sleeper(tmp);
  R.session('wsl', { pid: proc.pid, procStart: startOf(proc.pid), sessionId: 'wip', cwd: R.dir('wip') });
  R.task('done');

  const okRun = run(['--repo', R.MAIN, '--no-fetch', '--preflight', '--quiet'], quiet, R.env());
  assert.equal(okRun.refused, null, 'within budget: allowed');
  assert.equal(exists(R.dir('done')), false, 'and the finished worktree went first');

  const hard = run(['--repo', R.MAIN, '--no-fetch', '--preflight', '--quiet'], quiet, R.env({ CRWN_WT_HARD_MB: '1', CRWN_WT_NEW_MB: '0.9' }));
  assert.match(hard.refused, /NOT creating another worktree/);
  assert.match(hard.refused, /hard limit/);
  assert.match(hard.refused, /wip: .*live Claude session wip/, 'it names what holds the space and why');
  assert.match(hard.refused, /crwn clean --apply/, 'and the exact cleanup command');
  assert.ok(exists(path.join(R.dir('wip'), 'wip.ts')), 'a refusal never costs source');

  const cli = spawnSync('node', [SCRIPT, '--repo', R.MAIN, '--no-fetch', '--preflight', '--quiet'],
    { encoding: 'utf8', env: R.env({ CRWN_C_CRITICAL_GB: '1000000' }) });
  assert.equal(cli.status, REFUSED, 'critical C: exits 3, which crwn and the EnterWorktree hook turn into a refusal');
  assert.match(cli.stdout, /C: has [\d.]+ GB free, below the 1000000 GB critical level/);
  assert.match(cli.stdout, /wsl --shutdown/);
  assert.match(cli.stdout, /Optimize-VHD/);
});

test('a task session may not hand-apply it, but the lifecycle run is allowed', () => {
  const R = makeRepo('session');
  R.task('mine', { landed: false });
  const env = { ...R.env(), CLAUDECODE: '1' };
  const hand = spawnSync('node', [SCRIPT, '--repo', R.MAIN, '--no-fetch', '--apply'], { cwd: R.dir('mine'), env, encoding: 'utf8' });
  assert.equal(hand.status, 1);
  assert.match(hand.stderr, /never runs a hand cleanup/);
  const auto = spawnSync('node', [SCRIPT, '--repo', R.MAIN, '--no-fetch', '--auto', '--quiet'], { cwd: R.dir('mine'), env, encoding: 'utf8' });
  assert.equal(auto.status, 0, auto.stderr);
  assert.ok(exists(path.join(R.dir('mine'), 'mine.ts')), 'its own unlanded work is untouched');
});

// ---------------------------------------------------------------- the EnterWorktree hook, end to end
// Copied with the engine into a fixture repository laid out like this one, so a create really runs
// the preflight and a refusal really blocks the tool call. Windows-side sessions create worktrees
// through EnterWorktree, never through crwn, so this hook is their only preflight.

const HOOK = fileURLToPath(new URL('../../.claude/hooks/worktree-preflight.mjs', import.meta.url));
const hookHome = path.join(tmp, 'hook');
fs.mkdirSync(hookHome, { recursive: true });
const henv = { ...process.env, CRWN_CLAUDE_DIRS: path.join(hookHome, 'none'), CRWN_C_DRIVE: tmp };
const repo = path.join(hookHome, 'crwn');
sh(hookHome, 'init', '-q', '--bare', '-b', 'master', path.join(hookHome, 'origin.git'));
sh(hookHome, 'clone', '-q', path.join(hookHome, 'origin.git'), repo);
w(path.join(repo, 'a.txt'), 'a\n');
sh(repo, 'add', '.');
sh(repo, 'commit', '-qm', 'a');
sh(repo, 'push', '-q', 'origin', 'HEAD:master');
sh(repo, 'remote', 'set-head', 'origin', 'master');
w(path.join(repo, '.claude', 'hooks', 'worktree-preflight.mjs'), fs.readFileSync(HOOK, 'utf8'));
w(path.join(repo, 'scripts', 'dev', 'worktree-clean.mjs'), fs.readFileSync(SCRIPT, 'utf8'));
const hook = (input, extra = {}) => spawnSync('node', [path.join(repo, '.claude', 'hooks', 'worktree-preflight.mjs')],
  { input: JSON.stringify(input), encoding: 'utf8', env: { ...henv, ...extra }, timeout: 60000 });

test('paths and inputs', () => {
  assert.deepEqual(toLinux('\\\\wsl.localhost\\Ubuntu\\home\\m\\crwn'), { distro: 'Ubuntu', linux: '/home/m/crwn' });
  assert.deepEqual(toLinux('//wsl$/Ubuntu-22.04/home/m'), { distro: 'Ubuntu-22.04', linux: '/home/m' });
  assert.deepEqual(toLinux('/home/m/crwn'), { distro: null, linux: '/home/m/crwn' });
  assert.equal(creates({ tool_input: { name: 'fix-x' } }), true);
  assert.equal(creates({ tool_input: {} }), true, 'Claude picks the name: still a create');
  assert.equal(creates({ tool_input: { path: '/home/m/crwn/.claude/worktrees/a' } }), false, 'entering an existing one creates nothing');
});

test('a create on critically low C: is blocked, with the reason and the fix', () => {
  const r = hook({ tool_name: 'EnterWorktree', tool_input: { name: 'next-task' } }, { CRWN_C_CRITICAL_GB: '1000000' });
  assert.equal(r.status, 2, 'exit 2 blocks the tool call');
  assert.match(r.stderr, /NOT creating another worktree/);
  assert.match(r.stderr, /crwn clean --apply/);
  assert.match(r.stderr, /EnterWorktree was blocked by the disk preflight/);
});

test('a create within budget is allowed; entering an existing worktree never runs the engine', () => {
  const ok = hook({ tool_name: 'EnterWorktree', tool_input: { name: 'next-task' } });
  assert.equal(ok.status, 0, ok.stderr);
  const enter = hook({ tool_name: 'EnterWorktree', tool_input: { path: path.join(repo, '.claude', 'worktrees', 'x') } }, { CRWN_C_CRITICAL_GB: '1000000' });
  assert.equal(enter.status, 0);
  assert.equal(enter.stdout + enter.stderr, '');
});
