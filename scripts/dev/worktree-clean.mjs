#!/usr/bin/env node
// crwn clean: the lifecycle sweep for Claude task worktrees (.claude/worktrees/<task>).
// Operating guide: docs/PARALLEL_CLAUDE_SESSIONS.md, "Cleanup".
//
//   crwn clean                      dry run: every worktree, what it holds, what would happen
//   crwn clean --apply              do it
//   crwn clean --apply --only <t>   just one task (crwn land runs this after landing it)
//   crwn clean --skip <t>           never touch that task, even with --apply (repeatable)
//   --active-hours N                how recent counts as "in use" (default 12, or CRWN_ACTIVE_HOURS)
//   --no-fetch / --no-sizes / --quiet
//
// Why it exists (measured 2026-10-02): the Stop build gate runs `next build` in every worktree,
// Next 16.3 keeps a Turbopack build cache in .next/cache by default (about 405 MB of .next after
// one build, growing with every build after), and node_modules stops being a cheap hardlink the
// moment a task changes dependencies or the main checkout reinstalls. Nothing ever removed any of
// it, so .claude/worktrees reached 6.4 GB in three days.
//
// What it does, and the rules it will not break:
//   * A worktree that is IN USE is never touched at all: a live process has its cwd inside it, a
//     Claude transcript written in the last N hours has its cwd inside it (Windows-side sessions
//     are invisible to /proc, but their transcripts are not), a tracked file changed in the last N
//     hours, or git holds a lock on it (a lock whose pid is dead is stale and does not count).
//   * A worktree with ANY uncommitted or untracked file is never removed.
//   * A worktree is removed only when it is clean, inactive, every commit on it is already in
//     origin/master (nothing can be lost), and it holds no ignored file that is not a cache or an
//     exact copy of the main checkout's (git worktree remove deletes ignored files silently).
//     Removal is `git worktree remove` WITHOUT --force, so git refuses anything dirty by itself.
//   * Branches are never deleted. A removed worktree comes back with `crwn resume <task>`.
//   * Every other inactive worktree keeps its checkout and loses only its caches: the top-level
//     .next and node_modules, each verified ignored and untracked before it is deleted. Both come
//     back on their own (the SessionStart hook re-links node_modules, the next build rebuilds .next).
//   * Every fact that permits a deletion is re-read immediately before that deletion.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const CACHE_DIRS = ['.next', 'node_modules'];
// Ignored paths that are regenerable, so a worktree holding them may still be removed.
const REGENERABLE = [/(^|\/)node_modules$/, /^\.next$/, /^next-env\.d\.ts$/, /\.tsbuildinfo$/];
const MARKER = '.crwn-hardlinked'; // .claude/hooks/deps.mjs

// ---------------------------------------------------------------- the decision (pure)

/**
 * One worktree's facts -> what the sweep may do with it.
 * Returns { action: 'keep' | 'remove' | 'prune', trim: string[], why: string }.
 * `trim` lists the cache directories to delete when the worktree is kept.
 */
export function decide(f) {
  if (f.skipped) return { action: 'keep', trim: [], why: 'skipped (--skip)' };
  if (!f.exists) return { action: 'prune', trim: [], why: 'its folder is gone; git worktree prune drops the stale entry (the branch stays)' };
  if (f.active.length) return { action: 'keep', trim: [], why: `in use: ${f.active.join('; ')}` };
  const trim = CACHE_DIRS.filter((d) => f.caches?.[d]);
  if (f.dirty > 0) return { action: 'keep', trim, why: `${f.dirty} uncommitted file(s), so it is never removed` };
  if (!f.merged) {
    return { action: 'keep', trim, why: `not landed: ${f.ahead} commit(s) not in origin/${f.base}${f.pushed ? '' : ', and the branch is not pushed'}` };
  }
  if (f.unknownIgnored.length) {
    const list = f.unknownIgnored.slice(0, 5).join(', ') + (f.unknownIgnored.length > 5 ? ', ...' : '');
    return { action: 'keep', trim, why: `landed, but it holds ignored files that are not caches (${list}); removing the worktree would delete them. Check them, then crwn rm it` };
  }
  return { action: 'remove', trim: [], why: `landed (every commit is in origin/${f.base}), clean and not in use` };
}

/** A transcript cwd, in any of the forms Claude writes, as a Linux path. */
export function normalizeCwd(p) {
  return String(p).replace(/\\/g, '/').replace(/^\/\/wsl(\.localhost|\$)\/[^/]+/i, '');
}

export const isInside = (p, dir) => {
  const a = normalizeCwd(p).replace(/\/+$/, '').toLowerCase();
  const b = dir.replace(/\/+$/, '').toLowerCase();
  return a === b || a.startsWith(b + '/');
};

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

const pidAlive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
};

/** pid + command of every process whose cwd is inside `dir`. */
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
    hits.push(`${e} ${comm}`);
  }
  return hits;
}

export function defaultTranscriptRoots() {
  const roots = [path.join(os.homedir(), '.claude', 'projects')];
  try {
    for (const u of fs.readdirSync('/mnt/c/Users')) roots.push(path.join('/mnt/c/Users', u, '.claude', 'projects'));
  } catch { /* not WSL, or C: not mounted */ }
  return roots;
}

/** Every cwd recorded by a Claude transcript modified since `sinceMs`. Read once per run. */
export function recentTranscriptCwds(roots, sinceMs) {
  const cwds = new Set();
  const re = /[{,]"cwd":"((?:[^"\\]|\\.)*)"/g;
  for (const r of roots) {
    let projects = [];
    try { projects = fs.readdirSync(r); } catch { continue; }
    for (const p of projects) {
      let files = [];
      try { files = fs.readdirSync(path.join(r, p)); } catch { continue; }
      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue;
        const file = path.join(r, p, f);
        try {
          if (fs.statSync(file).mtimeMs < sinceMs) continue;
          const text = fs.readFileSync(file, 'utf8');
          for (const m of text.matchAll(re)) {
            try { cwds.add(JSON.parse(`"${m[1]}"`)); } catch { /* malformed escape */ }
          }
        } catch { /* unreadable: skip */ }
      }
    }
  }
  return cwds;
}

/** Has any file in the checkout (caches and .git excluded) changed since `sinceMs`? */
function recentlyEdited(dir, sinceMs) {
  const r = spawnSync('find', [dir, '(', '-path', path.join(dir, 'node_modules'), '-o', '-path', path.join(dir, '.next'),
    '-o', '-name', '.git', ')', '-prune', '-o', '-type', 'f', '-newermt', `@${Math.floor(sinceMs / 1000)}`, '-print', '-quit'], { encoding: 'utf8' });
  if (r.status !== 0 && !r.stdout) return null; // find failed: say "unknown", which counts as in use
  return r.stdout.trim() || '';
}

/** The ways this worktree is in use right now. Empty means inactive. */
export function activity(wt, ctx) {
  const why = [];
  if (wt.locked) {
    const pid = Number((/pid (\d+)/.exec(wt.locked) || [])[1]);
    if (!pid) why.push(`git lock: ${wt.locked}`);
    else if (pidAlive(pid)) why.push(`locked by running process ${pid}`);
  }
  for (const p of processesIn(wt.path, ctx.procDir)) why.push(`process ${p} is running in it`);
  if ([...ctx.cwds].some((c) => isInside(c, wt.path))) why.push(`a Claude session worked in it within ${ctx.activeHours}h`);
  const gitDir = git(wt.path, ['rev-parse', '--path-format=absolute', '--git-dir'], { allowFail: true })?.trim();
  for (const f of gitDir ? ['HEAD', 'logs/HEAD'] : []) {
    try { if (fs.statSync(path.join(gitDir, f)).mtimeMs >= ctx.since) { why.push(`git activity within ${ctx.activeHours}h`); break; } } catch { /* absent */ }
  }
  const edited = recentlyEdited(wt.path, ctx.since);
  if (edited === null) why.push('could not check recent edits');
  else if (edited) why.push(`${path.relative(wt.path, edited)} changed within ${ctx.activeHours}h`);
  return why;
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
  if (!f.exists || f.skipped) return { ...f, active: [], dirty: 0, unknownIgnored: [] };
  f.active = activity(wt, ctx);
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
  const r = spawnSync('du', ['-sk', '--', ...args], { encoding: 'utf8', maxBuffer: 16 << 20 });
  const kb = new Map();
  for (const line of (r.stdout || '').split('\n')) {
    const m = /^(\d+)\s+(.+)$/.exec(line);
    if (m) kb.set(m[2], Number(m[1]));
  }
  for (const f of facts) {
    if (!f.exists) continue;
    f.size = { checkout: kb.get(f.path) || 0 };
    for (const d of CACHE_DIRS) f.size[d] = kb.get(path.join(f.path, d)) || 0;
    f.size.total = f.size.checkout + CACHE_DIRS.reduce((s, d) => s + f.size[d], 0);
  }
}

const human = (kb) => (kb >= 1024 * 1024 ? `${(kb / 1024 / 1024).toFixed(1)} GB` : `${Math.round(kb / 1024)} MB`);

// ---------------------------------------------------------------- the run

function parseArgs(argv) {
  const o = { apply: false, only: new Set(), skip: new Set(), fetch: true, sizes: true, quiet: false, repo: null,
    activeHours: Number(process.env.CRWN_ACTIVE_HOURS || 12) };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') o.apply = true;
    else if (a === '--dry-run') o.apply = false;
    else if (a === '--only') o.only.add(argv[++i]);
    else if (a === '--skip') o.skip.add(argv[++i]);
    else if (a === '--active-hours') o.activeHours = Number(argv[++i]);
    else if (a === '--no-fetch') o.fetch = false;
    else if (a === '--no-sizes') o.sizes = false;
    else if (a === '--quiet') o.quiet = true;
    else if (a === '--repo') o.repo = argv[++i];
    else throw new Error(`unknown option ${a} (see: crwn help)`);
  }
  if (!(o.activeHours >= 0)) throw new Error('--active-hours needs a number');
  return o;
}

function inTaskSession() {
  if (!process.env.CLAUDECODE) return false;
  const gd = git(process.cwd(), ['rev-parse', '--path-format=absolute', '--git-dir'], { allowFail: true });
  const cd = git(process.cwd(), ['rev-parse', '--path-format=absolute', '--git-common-dir'], { allowFail: true });
  return !!gd && !!cd && gd.trim() !== cd.trim();
}

export function run(argv, log = console.log) {
  const o = parseArgs(argv);
  if (o.apply && inTaskSession()) {
    throw new Error('a task session never cleans up other checkouts. Run crwn clean --apply from the main checkout or a plain terminal.');
  }
  const here = o.repo || path.dirname(fileURLToPath(import.meta.url));
  const common = git(here, ['rev-parse', '--path-format=absolute', '--git-common-dir']).trim();
  const root = path.dirname(common);
  const worktreesDir = path.join(root, '.claude', 'worktrees');
  const base = (git(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { allowFail: true }) || 'origin/master').trim().replace(/^origin\//, '');
  const notes = [];
  if (o.fetch && !ok(root, ['fetch', '--quiet', 'origin', base])) notes.push(`fetch failed, so "landed" is judged against the cached origin/${base}`);
  const baseRef = `refs/remotes/origin/${base}`;
  if (!ok(root, ['rev-parse', '--verify', '--quiet', baseRef])) throw new Error(`no ${baseRef}; cannot tell what has landed`);

  const now = Date.now();
  const since = now - o.activeHours * 3600 * 1000;
  const transcriptRoots = process.env.CRWN_TRANSCRIPT_DIRS ? process.env.CRWN_TRANSCRIPT_DIRS.split(':').filter(Boolean) : defaultTranscriptRoots();
  const ctx = { root, worktreesDir, base, baseRef, since, activeHours: o.activeHours, skip: o.skip,
    procDir: process.env.CRWN_PROC_DIR || '/proc', cwds: recentTranscriptCwds(transcriptRoots, since) };

  const all = listWorktrees(root).filter((w) => w.path.startsWith(worktreesDir + path.sep));
  const picked = o.only.size ? all.filter((w) => o.only.has(path.relative(worktreesDir, w.path)) || (w.branch && o.only.has(w.branch))) : all;
  const facts = picked.map((w) => ({ wt: w, f: gatherFacts(w, ctx) }));
  if (o.sizes) measure(facts.map((x) => x.f), root);

  const registered = new Set(all.map((w) => w.path));
  const orphans = o.only.size ? [] : (fs.existsSync(worktreesDir) ? fs.readdirSync(worktreesDir) : [])
    .map((d) => path.join(worktreesDir, d)).filter((p) => fs.statSync(p).isDirectory() && !registered.has(p));

  let freeKb = 0;
  const plans = facts.map(({ wt, f }) => {
    const plan = decide(f);
    if (f.size) freeKb += plan.action === 'remove' ? f.size.total : plan.trim.reduce((s, d) => s + (f.size[d] || 0), 0);
    return { wt, f, plan };
  });

  if (!o.quiet) {
    log(`${o.apply ? 'Cleaning' : 'Dry run of'} ${plans.length} task worktree(s) in ${worktreesDir} (in use = activity within ${o.activeHours}h)`);
    for (const n of notes) log(`  note: ${n}`);
    for (const { f, plan } of plans) {
      log('');
      log(`${f.name}  (branch ${f.branch})`);
      if (!f.exists) { log(`  plan: ${plan.why}`); continue; }
      if (f.skipped) { log('  skipped: not inspected, not touched'); continue; }
      log(`  landed: ${f.merged ? 'yes' : `no, ${f.ahead} commit(s) ahead`}   pushed: ${f.pushed ? 'yes' : 'no'}   tree: ${f.dirty ? `DIRTY (${f.dirty} file(s))` : 'clean'}`);
      log(`  in use: ${f.active.length ? f.active.join('; ') : 'no'}`);
      if (f.size) log(`  disk: ${human(f.size.total)} (checkout ${human(f.size.checkout)}, .next ${human(f.size['.next'])}, node_modules ${human(f.size.node_modules)}: ${f.nodeModules})`);
      const verb = plan.action === 'remove' ? 'REMOVE the worktree (branch kept)' : plan.trim.length ? `keep, delete ${plan.trim.join(' and ')}` : 'keep as is';
      log(`  plan: ${verb}. ${f.active.length ? 'Nothing is touched while it is in use.' : plan.why}`);
    }
    for (const p of orphans) log(`\n${path.relative(worktreesDir, p)}: a folder git does not know as a worktree. Left alone; look at it yourself.`);
    log('');
  }

  const done = [];
  if (o.apply) {
    for (const { wt, f, plan } of plans) {
      if (plan.action === 'prune' || plan.action === 'keep' && !plan.trim.length) continue;
      // Re-read everything that permitted this, right before acting on it.
      const fresh = gatherFacts(wt, { ...ctx, cwds: recentTranscriptCwds(transcriptRoots, since) });
      const again = decide(fresh);
      if (again.action !== plan.action) { done.push(`${f.name}: left alone, its state changed (${again.why})`); continue; }
      if (plan.action === 'remove') {
        if (wt.locked) git(root, ['worktree', 'unlock', wt.path], { allowFail: true }); // only reachable for a dead-pid lock
        const r = spawnSync('git', ['-C', root, 'worktree', 'remove', wt.path], { encoding: 'utf8' }); // never --force
        done.push(r.status === 0
          ? `${f.name}: removed. Branch ${f.branch} is kept; reopen it any time with crwn resume ${f.name}`
          : `${f.name}: git refused to remove it, so it stays (${(r.stderr || '').trim().slice(0, 200)})`);
      } else {
        const gone = [];
        for (const d of again.trim) {
          if (!deletableCache(wt.path, d)) continue;
          fs.rmSync(path.join(wt.path, d), { recursive: true, force: true }); // a hardlinked tree loses links, not the main checkout's files
          gone.push(d);
        }
        if (gone.length) done.push(`${f.name}: deleted ${gone.join(' and ')} (kept the worktree: ${plan.why})`);
      }
    }
    git(root, ['worktree', 'prune']);
    for (const { f, plan } of plans) if (plan.action === 'prune') done.push(`${f.name}: dropped the stale worktree entry (its folder was already gone; branch kept)`);
  }

  if (o.apply) {
    if (done.length || !o.quiet) for (const d of done) log(`crwn clean: ${d}`);
    if (!o.quiet && !done.length) log('crwn clean: nothing to do.');
  } else {
    const n = plans.filter((p) => p.plan.action === 'remove').length;
    const t = plans.filter((p) => p.plan.action === 'keep' && p.plan.trim.length).length;
    const stale = (git(root, ['worktree', 'prune', '--dry-run', '-v'], { allowFail: true }) || '').trim();
    log(`Would remove ${n} worktree(s) and delete caches in ${t}${o.sizes ? `, freeing about ${human(freeKb)}` : ''}.`);
    if (stale) log(`git worktree prune would drop: ${stale.replace(/\n/g, '; ')}`);
    log('Dry run: nothing was changed. To do it: crwn clean --apply');
  }
  return { plans, done };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try { run(process.argv.slice(2)); } catch (e) { console.error(`crwn clean: ${e.message}`); process.exit(1); }
}
