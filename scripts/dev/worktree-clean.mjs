#!/usr/bin/env node
// crwn clean: the lifecycle sweep and disk budget for Claude task worktrees (.claude/worktrees/<task>).
// Operating guide: docs/PARALLEL_CLAUDE_SESSIONS.md, "Cleanup".
//
//   crwn clean                      dry run: every worktree, what it holds, what would happen
//   crwn clean --apply              do it (refused inside a task session: see --auto)
//   crwn clean --apply --only <t>   just one task
//   crwn clean --skip <t>           never touch that task, even with --apply (repeatable)
//   --auto                          the lifecycle run (crwn land, crwn <task>): applies, from anywhere
//   --preflight                     before creating a worktree: sweep, enforce the budget, then
//                                   exit 3 (and say why) if another worktree would be unsafe
//   --no-fetch / --no-sizes / --quiet
//
// WHY IT IS BUILT ON CURRENT LIVENESS (2026-10-03). The first version (2026-10-02) called a
// worktree "in use" for 12 hours after ANY trace of activity, and an in-use worktree kept
// everything, caches included. Every trace fired on a finished task: a fresh checkout stamps every
// file with its creation time (so "a file changed within 12h" was true of EVERY new worktree), the
// land itself moves HEAD (so "git activity"), the session's transcript names it (so "a Claude
// session worked in it"), and a Windows-side session's lock carries no pid (so "git lock", forever).
// Josh runs 20-30 tasks a day, each about 560 MB once built: 29 worktrees and 17 GB in one day, C:
// from 19.4 GB free to 0.5 GB. History is not liveness. What counts now is only what is true NOW:
//
//   BUSY   a process other than a Claude session has its cwd inside it right now (a build, a dev
//          server, a test run). Nothing at all is touched.
//   OWNED  a Claude session whose process is alive right now (verified by pid AND process start
//          time, because Windows reuses pids) has its cwd there, or a git lock names a live pid,
//          or the shell running this sweep is inside it, or it was created minutes ago (a session
//          still starting has not written its cwd anywhere yet). The SOURCE is preserved. The
//          build cache is not: once the task is landed and clean its .next goes immediately.
//   NONE   everything else, however recently it was used.
//
// Source and cache have different rules on purpose. Source work (uncommitted or untracked files,
// unlanded commits, private ignored files, the branch) is never removed automatically. .next and
// node_modules are regenerable, so an uncertain liveness answer protects the files, never the cache.
//
// And a GLOBAL budget, because per-worktree caps do not bound 30 worktrees: over the warning size
// it says so, over the aggressive size it also deletes .next from every worktree that is not busy
// (unlanded ones included: a rebuild is the cost, nothing is lost). --preflight then refuses a new
// worktree when the projected total would pass the hard limit or C: is critically low.
//
// Rules it will not break: never --force; never a dirty, unlanded or private-file worktree; never a
// branch; every fact that permits a deletion is re-read right before it.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const CACHE_DIRS = ['.next', 'node_modules'];
// Ignored paths that are regenerable, so a worktree holding them may still be removed.
const REGENERABLE = [/(^|\/)node_modules$/, /^\.next$/, /^next-env\.d\.ts$/, /\.tsbuildinfo$/];
const MARKER = '.crwn-hardlinked'; // .claude/hooks/deps.mjs
export const REFUSED = 3; // exit code of a --preflight that refuses a new worktree

const num = (v, d) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);

/** Every threshold, overridable by environment. Sizes in MB, C: in GB. */
export function limits(env = process.env) {
  return {
    warnMb: num(env.CRWN_WT_WARN_MB, 3072),           // say so
    aggressiveMb: num(env.CRWN_WT_AGGRESSIVE_MB, 4096), // also delete .next from every worktree not busy
    hardMb: num(env.CRWN_WT_HARD_MB, 5120),           // a new worktree may not push the total past this
    newMb: num(env.CRWN_WT_NEW_MB, 600),              // what one more worktree costs once built (measured ~560)
    cWarnGb: num(env.CRWN_C_WARN_GB, 10),
    cCriticalGb: num(env.CRWN_C_CRITICAL_GB, 5),      // refuse a new worktree below this
    graceMinutes: num(env.CRWN_GRACE_MINUTES, 20),    // a new worktree, or a transcript just written
  };
}

// ---------------------------------------------------------------- the decision (pure)

/**
 * One worktree's facts -> what the sweep may do with it.
 * f.live = { level: 'busy' | 'owned' | 'none', why: string[] }.
 * Returns { action: 'keep' | 'remove' | 'prune', trim: string[], why: string }.
 */
export function decide(f, { aggressive = false } = {}) {
  if (f.skipped) return { action: 'keep', trim: [], why: 'skipped (--skip)' };
  if (!f.exists) return { action: 'prune', trim: [], why: 'its folder is gone; git worktree prune drops the stale entry (the branch stays)' };
  const live = f.live || { level: 'none', why: [] };
  if (live.level === 'busy') return { action: 'keep', trim: [], why: `busy right now (${live.why.join('; ')}), so nothing is touched` };
  const has = (d) => !!f.caches?.[d];
  if (live.level === 'owned') {
    const finished = f.merged && f.dirty === 0;
    const trim = (finished || aggressive) && has('.next') ? ['.next'] : [];
    const tail = finished ? 'its task is landed and clean, so its build cache goes now'
      : aggressive ? 'storage is over budget, so its build cache goes (the next build recreates it)'
        : 'it is still working, so its caches stay';
    return { action: 'keep', trim, why: `a live session holds it (${live.why.join('; ')}); ${tail}` };
  }
  const trim = CACHE_DIRS.filter(has);
  if (f.dirty > 0) return { action: 'keep', trim, why: `${f.dirty} uncommitted file(s), so it is never removed` };
  if (!f.merged) {
    return { action: 'keep', trim, why: `not landed: ${f.ahead} commit(s) not in origin/${f.base}${f.pushed ? '' : ', and the branch is not pushed'}` };
  }
  if (f.unknownIgnored.length) {
    const list = f.unknownIgnored.slice(0, 5).join(', ') + (f.unknownIgnored.length > 5 ? ', ...' : '');
    return { action: 'keep', trim, why: `landed, but it holds ignored files that are not caches (${list}); removing the worktree would delete them. Check them, then crwn rm it` };
  }
  return { action: 'remove', trim: [], why: `landed (every commit is in origin/${f.base}), clean, and nothing holds it now` };
}

/**
 * The storage budget, given the total after the normal sweep (KB) and C: free (bytes or null).
 * Pure, so the thresholds are tested without filling a disk.
 */
export function budget(totalKb, cFreeBytes, lim, { preflight = false } = {}) {
  const mb = totalKb / 1024;
  const gb = cFreeBytes == null ? null : cFreeBytes / 1024 ** 3;
  const warn = [];
  const refuse = [];
  if (mb > lim.warnMb) warn.push(`.claude/worktrees holds ${fmtMb(mb)}, over the ${fmtMb(lim.warnMb)} warning level`);
  if (gb != null && gb < lim.cWarnGb) warn.push(`C: has only ${gb.toFixed(1)} GB free (warning below ${lim.cWarnGb} GB)`);
  if (preflight) {
    if (mb + lim.newMb > lim.hardMb) {
      refuse.push(`.claude/worktrees holds ${fmtMb(mb)} after cleanup; one more worktree (about ${fmtMb(lim.newMb)} once built) would pass the ${fmtMb(lim.hardMb)} hard limit`);
    }
    if (gb != null && gb < lim.cCriticalGb) refuse.push(`C: has ${gb.toFixed(1)} GB free, below the ${lim.cCriticalGb} GB critical level`);
  }
  return { aggressive: mb > lim.aggressiveMb, warn, refuse };
}

const fmtMb = (mb) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`);
const human = (kb) => fmtMb(kb / 1024);

/** A transcript cwd, in any of the forms Claude writes, as a Linux path. */
export function normalizeCwd(p) {
  return String(p).replace(/\\/g, '/').replace(/^\/\/wsl(\.localhost|\$)\/[^/]+/i, '');
}

export const isInside = (p, dir) => {
  const a = normalizeCwd(p).replace(/\/+$/, '').toLowerCase();
  const b = dir.replace(/\/+$/, '').toLowerCase();
  return a === b || a.startsWith(b + '/');
};

// ---------------------------------------------------------------- liveness: what is true NOW

function procStartTime(pid, procDir = '/proc') {
  try {
    const s = fs.readFileSync(path.join(procDir, String(pid), 'stat'), 'utf8');
    return s.slice(s.lastIndexOf(')') + 2).split(' ')[19] || null; // field 22, starttime
  } catch { return null; }
}

/** This distro's pid domain, in the form Claude writes into sessions/<pid>.json. */
export function linuxPidDomain() {
  try {
    const ns = fs.readlinkSync('/proc/self/ns/pid'); // pid:[4026532212]
    const id = fs.readFileSync('/etc/machine-id', 'utf8').trim();
    return `linux:${id}:${ns}`;
  } catch { return null; }
}

/** The pid of this process and every ancestor: the shell that ran the sweep is not "busy". */
function ancestry() {
  const pids = new Set();
  let pid = process.pid;
  for (let i = 0; i < 64 && pid > 1; i++) {
    pids.add(pid);
    try { pid = Number(fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ')[1]); } catch { break; }
  }
  return pids;
}

/** pid, command and cwd of every process whose cwd is inside `dir`. */
export function processesIn(dir, procDir = '/proc') {
  const hits = [];
  let entries = [];
  try { entries = fs.readdirSync(procDir); } catch { return hits; }
  for (const e of entries) {
    if (!/^\d+$/.test(e) || Number(e) === process.pid) continue;
    let cwd;
    try { cwd = fs.readlinkSync(path.join(procDir, e, 'cwd')); } catch { continue; }
    if (!isInside(cwd, dir)) continue;
    let comm = '?';
    try { comm = fs.readFileSync(path.join(procDir, e, 'comm'), 'utf8').trim(); } catch { /* gone */ }
    hits.push({ pid: Number(e), comm });
  }
  return hits;
}

/** The .claude directories to read (sessions/ and projects/): WSL's own, and every Windows user's. */
export function defaultClaudeDirs() {
  const dirs = [path.join(os.homedir(), '.claude')];
  try {
    for (const u of fs.readdirSync('/mnt/c/Users')) dirs.push(path.join('/mnt/c/Users', u, '.claude'));
  } catch { /* not WSL, or C: not mounted */ }
  return dirs.filter((d) => fs.existsSync(d));
}

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

/** The last cwd a transcript recorded (its tail only: a session's latest position). */
export function lastCwd(file) {
  let text;
  try {
    const fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, 1 << 20);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    fs.closeSync(fd);
    text = buf.toString('utf8');
  } catch { return null; }
  let last = null;
  // [{,] anchors it to a key of the line's own object: a cwd quoted inside a tool result is text.
  for (const m of text.matchAll(/[{,]"cwd":"((?:[^"\\]|\\.)*)"/g)) {
    try { last = JSON.parse(`"${m[1]}"`); } catch { /* malformed escape */ }
  }
  return last;
}

/** A session's transcripts: the main one and its subagents' (an Agent may run in its own worktree). */
function sessionTranscripts(claudeDir, sessionId) {
  const out = [];
  const projects = path.join(claudeDir, 'projects');
  let dirs = [];
  try { dirs = fs.readdirSync(projects); } catch { return out; }
  for (const p of dirs) {
    const main = path.join(projects, p, `${sessionId}.jsonl`);
    if (fs.existsSync(main)) out.push(main);
    const sub = path.join(projects, p, sessionId, 'subagents');
    try { for (const f of fs.readdirSync(sub)) if (f.endsWith('.jsonl')) out.push(path.join(sub, f)); } catch { /* none */ }
  }
  return out;
}

/**
 * Start times of Windows processes, read from WSL. Map pid -> { name, filetime } (filetime null when
 * Windows will not say), or null when the question could not be asked at all.
 * CRWN_WIN_PROC_FILE (a JSON { pid: { name, filetime } }) stands in for Windows in tests.
 */
export function windowsProcesses(pids, env = process.env) {
  if (!pids.length) return new Map();
  if (env.CRWN_WIN_PROC_FILE) {
    const j = readJson(env.CRWN_WIN_PROC_FILE);
    return j ? new Map(Object.entries(j).map(([k, v]) => [Number(k), v])) : null;
  }
  const ps = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
  if (!fs.existsSync(ps)) return null;
  const cmd = `Get-Process -Id ${pids.join(',')} -ErrorAction SilentlyContinue | ForEach-Object { $t = ''; try { $t = $_.StartTime.ToFileTimeUtc() } catch {}; "$($_.Id) $($_.ProcessName) $t" }`;
  const r = spawnSync(ps, ['-NoProfile', '-NonInteractive', '-Command', cmd], { encoding: 'utf8', timeout: 20000, cwd: '/mnt/c' });
  if (r.error || r.status === null) return null;
  const out = new Map();
  for (const line of (r.stdout || '').split(/\r?\n/)) {
    const m = /^(\d+)\s+(\S+)\s*(\d*)\s*$/.exec(line.trim());
    if (m) out.set(Number(m[1]), { name: m[2], filetime: m[3] || null });
  }
  return out;
}

/**
 * Every Claude session alive right now, read from each .claude/sessions/<pid>.json registry and
 * verified against the process table. A registry file outlives a crashed session and Windows reuses
 * pids (a dead session's pid was a svchost on 2026-10-03), so a pid alone proves nothing: the
 * process's start time must equal the one recorded. Returns
 * { owners: [{ cwd, why }], sessionPids: Set } where sessionPids are live WSL session processes.
 */
export function liveSessions(claudeDirs, { env = process.env, procDir = '/proc', now = Date.now(), graceMinutes = 20 } = {}) {
  const owners = [];
  const sessionPids = new Set();
  const myDomain = linuxPidDomain();
  const entries = [];
  for (const dir of claudeDirs) {
    let files = [];
    try { files = fs.readdirSync(path.join(dir, 'sessions')); } catch { continue; }
    for (const f of files) {
      if (!/^\d+\.json$/.test(f)) continue;
      const s = readJson(path.join(dir, 'sessions', f));
      if (s && s.pid && s.sessionId) entries.push({ ...s, claudeDir: dir });
    }
  }
  const winPids = entries.filter((s) => String(s.pidDomain || '').startsWith('win32')).map((s) => s.pid);
  const win = windowsProcesses([...new Set(winPids)], env);
  const seen = new Set();
  for (const s of entries) {
    let state; // 'live' | 'uncertain' | 'dead'
    if (String(s.pidDomain || '').startsWith('win32')) {
      if (win === null) state = 'uncertain';
      else {
        const p = win.get(Number(s.pid));
        if (!p) state = 'dead';
        else if (p.filetime) state = String(p.filetime) === String(s.procStart) ? 'live' : 'dead';
        else state = /^claude/i.test(p.name || '') ? 'uncertain' : 'dead';
      }
    } else if (s.pidDomain && myDomain && s.pidDomain !== myDomain) {
      state = 'dead'; // another pid namespace: a previous WSL boot, whose processes are all gone
    } else {
      const st = procStartTime(s.pid, procDir);
      state = st && String(st) === String(s.procStart) ? 'live' : 'dead';
      if (state === 'live') sessionPids.add(Number(s.pid));
    }
    if (state === 'dead') continue;
    seen.add(s.sessionId);
    const label = `${state === 'live' ? 'live' : 'probably live (Windows would not confirm)'} Claude session ${s.name || s.sessionId.slice(0, 8)}, pid ${s.pid}`;
    const cwds = new Set([s.cwd]);
    for (const t of sessionTranscripts(s.claudeDir, s.sessionId)) { const c = lastCwd(t); if (c) cwds.add(c); }
    for (const c of cwds) if (c) owners.push({ cwd: c, why: label });
  }
  // A transcript written in the last few minutes by a session with no live registry entry: one that
  // just ended, or a Claude that stopped writing registries. Minutes, never hours.
  const since = now - graceMinutes * 60 * 1000;
  for (const dir of claudeDirs) {
    const projects = path.join(dir, 'projects');
    let ps = [];
    try { ps = fs.readdirSync(projects); } catch { continue; }
    for (const p of ps) {
      let files = [];
      try { files = fs.readdirSync(path.join(projects, p)); } catch { continue; }
      for (const f of files) {
        if (!f.endsWith('.jsonl') || seen.has(f.slice(0, -6))) continue;
        const file = path.join(projects, p, f);
        let m;
        try { m = fs.statSync(file).mtimeMs; } catch { continue; }
        if (m < since) continue;
        const c = lastCwd(file);
        if (c) owners.push({ cwd: c, why: `a Claude transcript was written ${Math.max(0, Math.round((now - m) / 60000))} min ago` });
      }
    }
  }
  return { owners, sessionPids };
}

/** A git lock: who wrote it, and is that process alive now? */
function lockState(locked, procDir) {
  const m = /pid (\d+)(?: start (\d+))?/.exec(locked || '');
  if (!m) return 'no-pid';
  const st = procStartTime(Number(m[1]), procDir);
  if (!st) return 'dead';
  return !m[2] || m[2] === st ? 'live' : 'dead';
}

/** How this worktree is held right now. */
export function liveness(wt, ctx) {
  const busy = [];
  const owned = [];
  for (const p of processesIn(wt.path, ctx.procDir)) {
    if (ctx.sessionPids.has(p.pid)) owned.push(`Claude session process ${p.pid} is in it`);
    else if (ctx.ancestry.has(p.pid)) owned.push(`the shell running this (pid ${p.pid}) is in it`);
    else busy.push(`process ${p.pid} ${p.comm} is running in it`);
  }
  if (busy.length) return { level: 'busy', why: busy };
  if (wt.locked && lockState(wt.locked, ctx.procDir) === 'live') owned.push(`git lock held by running process (${wt.locked})`);
  const seen = new Set();
  for (const o of ctx.owners) {
    if (isInside(o.cwd, wt.path) && !seen.has(o.why)) { seen.add(o.why); owned.push(o.why); }
  }
  // A brand-new worktree: its session has not recorded a cwd yet. The admin dir's creation time.
  const born = ctx.createdMs?.(wt);
  if (born && ctx.now - born < ctx.graceMinutes * 60 * 1000) owned.push(`created ${Math.round((ctx.now - born) / 60000)} min ago`);
  return owned.length ? { level: 'owned', why: owned } : { level: 'none', why: [] };
}

// ---------------------------------------------------------------- facts

function git(cwd, args, { allowFail = false } = {}) {
  const r = spawnSync('git', ['--no-optional-locks', '-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 256 << 20 });
  if (r.status === 0) return r.stdout;
  if (allowFail) return null;
  throw new Error(`git ${args.join(' ')}: ${(r.stderr || '').trim().slice(0, 300)}`);
}
const ok = (cwd, args) => git(cwd, args, { allowFail: true }) !== null;

export function listWorktrees(root) {
  const out = [];
  let cur = null;
  for (const line of git(root, ['worktree', 'list', '--porcelain']).split('\n')) {
    if (line.startsWith('worktree ')) { cur = { path: line.slice(9), branch: null, locked: null }; out.push(cur); }
    else if (!cur) continue;
    else if (line.startsWith('HEAD ')) cur.head = line.slice(5);
    else if (line.startsWith('branch ')) cur.branch = line.slice(7).replace(/^refs\/heads\//, '');
    else if (line === 'locked' || line.startsWith('locked ')) cur.locked = line.slice(7) || '(no reason given)';
  }
  return out;
}

function sameBytes(a, b) {
  try {
    const sa = fs.statSync(a), sb = fs.statSync(b);
    if (!sa.isFile() || !sb.isFile() || sa.size !== sb.size) return false;
    return fs.readFileSync(a).equals(fs.readFileSync(b));
  } catch { return false; }
}

/** A cache directory that may be deleted: present, ignored, and nothing under it is tracked. */
function deletableCache(dir, d) {
  if (!fs.existsSync(path.join(dir, d))) return false;
  return ok(dir, ['check-ignore', '-q', d]) && git(dir, ['ls-files', '--', d], { allowFail: true }) === '';
}

function nodeModulesState(dir, root) {
  const nm = path.join(dir, 'node_modules');
  if (!fs.existsSync(nm)) return 'none';
  if (!fs.existsSync(path.join(nm, MARKER))) return 'own copy';
  try {
    const s = 'next/package.json';
    return fs.statSync(path.join(nm, s)).ino === fs.statSync(path.join(root, 'node_modules', s)).ino
      ? 'hardlinked to main' : 'stale link (main reinstalled, so these files are real disk now)';
  } catch { return 'hardlinked'; }
}

export function gatherFacts(wt, ctx) {
  const name = path.relative(ctx.worktreesDir, wt.path);
  const f = { name, path: wt.path, branch: wt.branch || '(detached)', base: ctx.base, exists: fs.existsSync(wt.path) };
  f.skipped = ctx.skip.has(name) || (wt.branch && ctx.skip.has(wt.branch));
  if (!f.exists || f.skipped) return { ...f, live: { level: 'none', why: [] }, dirty: 0, unknownIgnored: [] };
  f.live = liveness(wt, ctx);
  f.dirty = git(wt.path, ['status', '--porcelain', '--untracked-files=all']).split('\n').filter(Boolean).length;
  const tip = git(wt.path, ['rev-parse', 'HEAD']).trim();
  f.merged = ok(ctx.root, ['merge-base', '--is-ancestor', tip, ctx.baseRef]);
  f.ahead = Number(git(ctx.root, ['rev-list', '--count', `${ctx.baseRef}..${tip}`], { allowFail: true }) || 0);
  f.pushed = !!wt.branch && (git(ctx.root, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${wt.branch}`], { allowFail: true }) || '').trim() === tip;
  f.unknownIgnored = git(wt.path, ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory'])
    .split('\n').filter(Boolean).map((p) => p.replace(/\/$/, ''))
    .filter((p) => !REGENERABLE.some((re) => re.test(p)) && !sameBytes(path.join(wt.path, p), path.join(ctx.root, p)));
  f.caches = Object.fromEntries(CACHE_DIRS.map((d) => [d, deletableCache(wt.path, d)]));
  f.nodeModules = nodeModulesState(wt.path, ctx.root);
  return f;
}

/** Disk each worktree uses on its own, in KB. One du run, so hardlinks are counted once. */
function measure(facts, root) {
  const args = [];
  const mainNm = path.join(root, 'node_modules');
  if (fs.existsSync(mainNm)) args.push(mainNm); // first, so files shared with it are not charged to a worktree
  for (const f of facts) {
    if (!f.exists) continue;
    for (const d of CACHE_DIRS) if (fs.existsSync(path.join(f.path, d))) args.push(path.join(f.path, d));
    args.push(f.path);
  }
  if (!args.length) return;
  const kb = du(args);
  for (const f of facts) {
    if (!f.exists) continue;
    f.size = { checkout: kb.get(f.path) || 0 };
    for (const d of CACHE_DIRS) f.size[d] = kb.get(path.join(f.path, d)) || 0;
    f.size.total = f.size.checkout + CACHE_DIRS.reduce((s, d) => s + f.size[d], 0);
  }
}

function du(args) {
  const r = spawnSync('du', ['-sk', '--', ...args], { encoding: 'utf8', maxBuffer: 16 << 20 });
  const kb = new Map();
  for (const line of (r.stdout || '').split('\n')) {
    const m = /^(\d+)\s+(.+)$/.exec(line);
    if (m) kb.set(m[2], Number(m[1]));
  }
  return kb;
}

/** What .claude/worktrees costs the disk, KB: everything under it not shared with main's node_modules. */
export function worktreesUsageKb(root, worktreesDir) {
  if (!fs.existsSync(worktreesDir)) return 0;
  const mainNm = path.join(root, 'node_modules');
  return du([...(fs.existsSync(mainNm) ? [mainNm] : []), worktreesDir]).get(worktreesDir) || 0;
}

/** Free bytes on the Windows drive the WSL disk lives on (or CRWN_C_DRIVE), null if unknown. */
export function cFreeBytes(env = process.env) {
  const p = env.CRWN_C_DRIVE || '/mnt/c';
  try { const s = fs.statfsSync(p); return s.bavail * s.bsize; } catch { return null; }
}

/** The WSL virtual disk file, for the "how to get C: back" line. */
function findVhdx() {
  const hits = [];
  let users = [];
  try { users = fs.readdirSync('/mnt/c/Users'); } catch { return hits; }
  for (const u of users) {
    const pk = path.join('/mnt/c/Users', u, 'AppData', 'Local', 'Packages');
    let pkgs = [];
    try { pkgs = fs.readdirSync(pk).filter((p) => /ubuntu|canonical/i.test(p)); } catch { continue; }
    for (const p of pkgs) {
      const f = path.join(pk, p, 'LocalState', 'ext4.vhdx');
      try { hits.push({ file: f, bytes: fs.statSync(f).size }); } catch { /* none */ }
    }
  }
  return hits;
}
const winPath = (p) => p.replace(/^\/mnt\/([a-z])\//, (_, d) => `${d.toUpperCase()}:\\`).replace(/\//g, '\\');

// ---------------------------------------------------------------- the run

function parseArgs(argv) {
  const o = { apply: false, auto: false, preflight: false, only: new Set(), skip: new Set(), fetch: true, sizes: true, quiet: false, repo: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') o.apply = true;
    else if (a === '--auto') { o.apply = true; o.auto = true; }
    else if (a === '--preflight') { o.apply = true; o.auto = true; o.preflight = true; }
    else if (a === '--dry-run') o.apply = false;
    else if (a === '--only') o.only.add(argv[++i]);
    else if (a === '--skip') o.skip.add(argv[++i]);
    else if (a === '--no-fetch') o.fetch = false;
    else if (a === '--no-sizes') o.sizes = false;
    else if (a === '--quiet') o.quiet = true;
    else if (a === '--repo') o.repo = argv[++i];
    else if (a === '--active-hours') { i++; } // retired with the 12-hour rule; accepted so old calls do not fail
    else throw new Error(`unknown option ${a} (see: crwn help)`);
  }
  if (o.preflight && o.only.size) throw new Error('--preflight sweeps every worktree; it does not take --only');
  return o;
}

function inTaskSession() {
  if (!process.env.CLAUDECODE) return false;
  const gd = git(process.cwd(), ['rev-parse', '--path-format=absolute', '--git-dir'], { allowFail: true });
  const cd = git(process.cwd(), ['rev-parse', '--path-format=absolute', '--git-common-dir'], { allowFail: true });
  return !!gd && !!cd && gd.trim() !== cd.trim();
}

export function run(argv, log = console.log, env = process.env) {
  const o = parseArgs(argv);
  // A hand-run --apply from a task session is refused (and git-guard blocks it): broad cleanup is
  // the main checkout's call. The lifecycle runs (--auto from crwn land / crwn <task>, --preflight
  // from the EnterWorktree hook) are allowed anywhere, because what they may do is decided by the
  // liveness rules above, not by who runs them.
  if (o.apply && !o.auto && inTaskSession()) {
    throw new Error('a task session never runs a hand cleanup of other checkouts. crwn land and new tasks clean up on their own; a hand crwn clean --apply runs from the main checkout.');
  }
  const lim = limits(env);
  const here = o.repo || path.dirname(fileURLToPath(import.meta.url));
  const common = git(here, ['rev-parse', '--path-format=absolute', '--git-common-dir']).trim();
  const root = path.dirname(common);
  const worktreesDir = path.join(root, '.claude', 'worktrees');
  const base = (git(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { allowFail: true }) || 'origin/master').trim().replace(/^origin\//, '');
  const notes = [];
  if (o.fetch && !ok(root, ['fetch', '--quiet', 'origin', base])) notes.push(`fetch failed, so "landed" is judged against the cached origin/${base}`);
  const baseRef = `refs/remotes/origin/${base}`;
  if (!ok(root, ['rev-parse', '--verify', '--quiet', baseRef])) throw new Error(`no ${baseRef}; cannot tell what has landed`);

  const claudeDirs = env.CRWN_CLAUDE_DIRS ? env.CRWN_CLAUDE_DIRS.split(':').filter(Boolean) : defaultClaudeDirs();
  const procDir = env.CRWN_PROC_DIR || '/proc';
  const createdMs = (wt) => {
    try { return fs.statSync(path.join(common, 'worktrees', path.basename(wt.path), 'commondir')).mtimeMs; } catch { return null; }
  };
  const makeCtx = () => {
    const now = Date.now();
    const s = liveSessions(claudeDirs, { env, procDir, now, graceMinutes: lim.graceMinutes });
    return { root, worktreesDir, base, baseRef, skip: o.skip, procDir, now, graceMinutes: lim.graceMinutes,
      owners: s.owners, sessionPids: s.sessionPids, ancestry: ancestry(), createdMs };
  };
  let ctx = makeCtx();

  const listMine = () => listWorktrees(root).filter((w) => w.path.startsWith(worktreesDir + path.sep));
  const all = listMine();
  const pick = (list) => (o.only.size ? list.filter((w) => o.only.has(path.relative(worktreesDir, w.path)) || (w.branch && o.only.has(w.branch))) : list);
  const plansFor = (list, mode) => list.map((wt) => { const f = gatherFacts(wt, ctx); return { wt, f, plan: decide(f, mode) }; });

  let plans = plansFor(pick(all), {});
  if (o.sizes && !o.quiet) measure(plans.map((x) => x.f), root);

  const registered = new Set(all.map((w) => w.path));
  const orphans = o.only.size ? [] : (fs.existsSync(worktreesDir) ? fs.readdirSync(worktreesDir) : [])
    .map((d) => path.join(worktreesDir, d)).filter((p) => fs.statSync(p).isDirectory() && !registered.has(p));

  if (!o.quiet) {
    log(`${o.apply ? 'Cleaning' : 'Dry run of'} ${plans.length} task worktree(s) in ${worktreesDir}`);
    for (const n of notes) log(`  note: ${n}`);
    for (const { f, plan } of plans) {
      log('');
      log(`${f.name}  (branch ${f.branch})`);
      if (!f.exists) { log(`  plan: ${plan.why}`); continue; }
      if (f.skipped) { log('  skipped: not inspected, not touched'); continue; }
      log(`  landed: ${f.merged ? 'yes' : `no, ${f.ahead} commit(s) ahead`}   pushed: ${f.pushed ? 'yes' : 'no'}   tree: ${f.dirty ? `DIRTY (${f.dirty} file(s))` : 'clean'}`);
      log(`  held now: ${f.live.level === 'none' ? 'no' : `${f.live.level === 'busy' ? 'BUSY' : 'yes'}: ${f.live.why.join('; ')}`}`);
      if (f.size) log(`  disk: ${human(f.size.total)} (checkout ${human(f.size.checkout)}, .next ${human(f.size['.next'])}, node_modules ${human(f.size.node_modules)}: ${f.nodeModules})`);
      const verb = plan.action === 'remove' ? 'REMOVE the worktree (branch kept)' : plan.trim.length ? `keep, delete ${plan.trim.join(' and ')}` : 'keep as is';
      log(`  plan: ${verb}. ${plan.why}`);
    }
    for (const p of orphans) log(`\n${path.relative(worktreesDir, p)}: a folder git does not know as a worktree. Left alone; look at it yourself.`);
    log('');
  }

  const done = [];
  const execute = (list, mode) => {
    ctx = makeCtx(); // sessions re-read right before acting
    const current = new Map(listMine().map((w) => [w.path, w]));
    for (const { wt, f, plan } of list) {
      if (plan.action === 'prune' || (plan.action === 'keep' && !plan.trim.length)) continue;
      const now = current.get(wt.path);
      if (!now) continue;
      // Re-read everything that permitted this, right before acting on it.
      const fresh = gatherFacts(now, ctx);
      const again = decide(fresh, mode);
      if (again.action !== plan.action) { done.push(`${f.name}: left alone, its state changed (${again.why})`); continue; }
      if (plan.action === 'remove') {
        if (now.locked) git(root, ['worktree', 'unlock', now.path], { allowFail: true }); // no live holder, checked above
        const r = spawnSync('git', ['-C', root, 'worktree', 'remove', now.path], { encoding: 'utf8' }); // never --force
        done.push(r.status === 0
          ? `${f.name}: removed. Branch ${f.branch} is kept; reopen it any time with crwn resume ${f.name}`
          : `${f.name}: git refused to remove it, so it stays (${(r.stderr || '').trim().slice(0, 200)})`);
      } else {
        const gone = [];
        for (const d of again.trim) {
          if (!deletableCache(now.path, d)) continue;
          fs.rmSync(path.join(now.path, d), { recursive: true, force: true }); // a hardlinked tree loses links, not the main checkout's files
          gone.push(d);
        }
        if (gone.length) done.push(`${f.name}: deleted ${gone.join(' and ')} (kept the worktree: ${again.why})`);
      }
    }
  };

  let usageKb = null;
  let cFree = null;
  let verdict = null;
  if (o.apply) {
    execute(plans, {});
    git(root, ['worktree', 'prune']);
    for (const { f, plan } of plans) if (plan.action === 'prune') done.push(`${f.name}: dropped the stale worktree entry (its folder was already gone; branch kept)`);
  }
  if (o.apply || o.sizes) {
    usageKb = worktreesUsageKb(root, worktreesDir);
    cFree = cFreeBytes(env);
    verdict = budget(usageKb, cFree, lim, { preflight: o.preflight });
    if (verdict.aggressive && o.apply) {
      // Over budget: every worktree that is not busy loses .next, unlanded and live ones included.
      ctx = makeCtx();
      execute(plansFor(listMine(), { aggressive: true }), { aggressive: true });
      usageKb = worktreesUsageKb(root, worktreesDir);
      verdict = budget(usageKb, cFree, lim, { preflight: o.preflight });
      done.push(`storage was over the ${fmtMb(lim.aggressiveMb)} aggressive level, so every worktree not busy lost its .next; now ${human(usageKb)}`);
    }
  }

  if (o.apply) {
    for (const d of done) log(`crwn clean: ${d}`);
    if (!o.quiet && !done.length) log('crwn clean: nothing to do.');
  } else {
    const n = plans.filter((p) => p.plan.action === 'remove').length;
    const t = plans.filter((p) => p.plan.action === 'keep' && p.plan.trim.length).length;
    const freeKb = plans.reduce((s, { f, plan }) => s + (!f.size ? 0 : plan.action === 'remove' ? f.size.total : plan.trim.reduce((a, d) => a + (f.size[d] || 0), 0)), 0);
    const stale = (git(root, ['worktree', 'prune', '--dry-run', '-v'], { allowFail: true }) || '').trim();
    log(`Would remove ${n} worktree(s) and delete caches in ${t}${o.sizes ? `, freeing about ${human(freeKb)}` : ''}.`);
    if (stale) log(`git worktree prune would drop: ${stale.replace(/\n/g, '; ')}`);
    if (verdict?.aggressive) log(`Storage is over the ${fmtMb(lim.aggressiveMb)} aggressive level, so --apply would also delete .next from every worktree that is not busy.`);
    log('Dry run: nothing was changed. To do it: crwn clean --apply');
  }

  if (verdict) {
    if (!o.quiet || verdict.warn.length || verdict.refuse.length) {
      log(`Worktree storage: ${human(usageKb)} (warn ${fmtMb(lim.warnMb)}, aggressive cleanup ${fmtMb(lim.aggressiveMb)}, hard limit ${fmtMb(lim.hardMb)}). C: free: ${cFree == null ? 'unknown' : `${(cFree / 1024 ** 3).toFixed(1)} GB`} (warn below ${lim.cWarnGb} GB, no new worktree below ${lim.cCriticalGb} GB).`);
    }
    for (const w of verdict.warn) log(`crwn clean: WARNING: ${w}`);
  }

  let refused = null;
  if (o.preflight && verdict?.refuse.length) {
    const held = plansFor(listMine(), {}).filter(({ f }) => f.exists);
    measure(held.map((x) => x.f), root);
    held.sort((a, b) => (b.f.size?.total || 0) - (a.f.size?.total || 0));
    const vhdx = findVhdx();
    const lines = [
      'NOT creating another worktree. Cleanup already ran, and this is still unsafe:',
      ...verdict.refuse.map((r) => `  - ${r}`),
      '',
      'What still holds .claude/worktrees (biggest first):',
      ...held.slice(0, 12).map(({ f, plan }) => `  ${f.name}: ${human(f.size?.total || 0)}. ${plan.why}`),
      '',
      'To free it:',
      '  1. See every worktree and why it is kept:   wsl ~/workspace-crwn/scripts/dev/crwn clean',
      '  2. Finish or close the sessions named above (a landed worktree goes the moment its session ends), then:',
      '                                             wsl ~/workspace-crwn/scripts/dev/crwn clean --apply',
    ];
    if (verdict.refuse.some((r) => r.startsWith('C:'))) {
      const v = vhdx[0];
      lines.push(
        '  3. C: only gets space back when the WSL disk is compacted: this VHDX is not sparse, so deleting files',
        `     inside WSL does not return it to Windows${v ? ` (${winPath(v.file)} is ${(v.bytes / 1024 ** 3).toFixed(1)} GB)` : ''}.`,
        '     Close every WSL terminal and VSCode window, then in an Administrator PowerShell:',
        '       wsl --shutdown',
        `       Optimize-VHD -Path "${v ? winPath(v.file) : '<path to ext4.vhdx>'}" -Mode Full`,
        '     (no Hyper-V module: diskpart, select vdisk file=..., attach vdisk readonly, compact vdisk, detach vdisk)',
      );
    }
    refused = lines.join('\n');
    log(refused);
  }
  return { plans, done, usageKb, cFree, verdict, refused };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const r = run(process.argv.slice(2));
    if (r.refused) process.exit(REFUSED);
  } catch (e) { console.error(`crwn clean: ${e.message}`); process.exit(1); }
}
