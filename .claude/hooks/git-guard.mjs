#!/usr/bin/env node
// PreToolUse guard (wired in .claude/settings.json for Bash and PowerShell).
//
// Parallel Claude sessions each work in their own git worktree (docs/PARALLEL_CLAUDE_SESSIONS.md).
// This guard keeps them from damaging each other's git state or shipping around integration.
// It blocks (exit 2, reason on stderr, which Claude reads):
//
//   1. A push that targets the integration branch (origin/HEAD, plus master and main) from an
//      implementation session, meaning a session whose checkout is a linked worktree. Land a
//      finished branch with `scripts/dev/crwn land <task>` instead, which only fast-forwards.
//   2. A force push, a delete, or a mirror of the integration branch, from anywhere.
//   3. `gh pr merge` from an implementation session (that is also a write to master).
//   4. Any git WRITE aimed at a checkout the session does not own (another worktree, or the main
//      checkout from a worktree session). Read-only commands (status, log, diff, fetch...) pass.
//   5. Discarding work in the MAIN checkout, which other sessions share: reset --hard, clean -f,
//      checkout/restore of paths, stash drop/clear. Plus, anywhere: worktree remove --force and
//      branch -D, the two commands that delete another session's work without asking.
//
// Everything else passes, including commits and pushes of the session's own feature branch.
// It FAILS OPEN on any internal error: it is a seatbelt against accidents, not an authorization
// boundary, and it must never brick the Bash tool.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const READ_ONLY = new Set([
  'status', 'log', 'diff', 'show', 'fetch', 'rev-parse', 'rev-list', 'ls-files', 'ls-tree',
  'ls-remote', 'grep', 'blame', 'describe', 'shortlog', 'cat-file', 'merge-base', 'for-each-ref',
  'show-ref', 'name-rev', 'check-ignore', 'count-objects', 'help', 'version', 'var', 'whatchanged',
  'range-diff', 'diff-tree', 'diff-files', 'diff-index', 'cherry', 'annotate', 'verify-commit',
]);
const NOT_A_GIT_CALL = new Set(['echo', 'printf', 'grep', 'egrep', 'fgrep', 'rg', 'man', 'which', 'type']);
const SHELL_SCRIPT_FLAGS = new Set(['-c', '-lc', '-ic', '-lic', '-cl', '-Command', '-command']);

// ---------------------------------------------------------------- shell-ish tokenizer
// Splits a command line into simple commands (arrays of words). Quotes group, operators split.
// Not a full shell parser: it only has to find git invocations reliably, including ones nested
// inside `bash -lc '...'` or `wsl.exe -e bash -lc '...'`, which is how Windows-side sessions run git.
export function tokenize(src) {
  const segs = [];
  let cur = [];
  let tok = null;
  const flush = () => { if (tok !== null) { cur.push(tok); tok = null; } };
  const end = () => { flush(); if (cur.length) segs.push(cur); cur = []; };
  for (let i = 0; i < src.length;) {
    const c = src[i];
    if (c === "'") {
      const j = src.indexOf("'", i + 1);
      tok = (tok ?? '') + (j < 0 ? src.slice(i + 1) : src.slice(i + 1, j));
      i = j < 0 ? src.length : j + 1;
    } else if (c === '"') {
      let s = '';
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < src.length && '"\\$`'.includes(src[i + 1])) { s += src[i + 1]; i += 2; }
        else s += src[i++];
      }
      i++;
      tok = (tok ?? '') + s;
    } else if (c === '\\' && i + 1 < src.length && src[i + 1] !== '\n') {
      tok = (tok ?? '') + src[i + 1];
      i += 2;
    } else if (c === '\n' || ';&|()`'.includes(c)) {
      end();
      i++;
    } else if (/\s/.test(c)) {
      flush();
      i++;
    } else {
      tok = (tok ?? '') + c;
      i++;
    }
  }
  end();
  return segs;
}

// ---------------------------------------------------------------- filesystem facts (no git needed)
// A main checkout has a `.git` DIRECTORY; a linked worktree has a `.git` FILE pointing at
// <common>/worktrees/<name>. Reading these directly keeps the guard fast and lets it run from a
// Windows-side session against the \\wsl.localhost share, where spawning git is unsafe.

function uncPrefixOf(p) {
  const m = /^(\\\\wsl(?:\.localhost|\$)\\[^\\]+)/i.exec(p || '');
  return m ? m[1] : null;
}

function makeResolver(sessionCwd) {
  const unc = process.platform === 'win32' ? uncPrefixOf(sessionCwd) : null;
  const toLocal = (p) => {
    if (!p) return null;
    if (process.platform === 'win32' && p.startsWith('/')) return unc ? unc + p.replace(/\//g, '\\') : null;
    return p;
  };
  const resolveDir = (base, p) => {
    if (!p) return base;
    if (p === '~' || p.startsWith('~/')) return process.platform === 'win32' ? null : path.join(os.homedir(), p.slice(1));
    const local = toLocal(p);
    if (p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\')) return local;
    return base ? path.resolve(base, p) : null;
  };
  return { toLocal, resolveDir };
}

function readText(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

export function repoInfo(dir, toLocal = (p) => p) {
  if (!dir) return null;
  let d = path.resolve(dir);
  for (let n = 0; n < 64; n++) {
    const dotgit = path.join(d, '.git');
    let st = null;
    try { st = fs.statSync(dotgit); } catch { /* keep walking */ }
    if (st?.isDirectory()) {
      return { root: d, linked: false, gitDir: dotgit, commonDir: dotgit, mainRoot: d };
    }
    if (st?.isFile()) {
      const m = /^gitdir:\s*(.+)$/m.exec(readText(dotgit) || '');
      const gitDir = m ? toLocal(m[1].trim()) : null;
      let commonDir = null;
      if (gitDir) {
        const rel = (readText(path.join(gitDir, 'commondir')) || '').trim();
        commonDir = rel ? path.resolve(gitDir, rel) : path.resolve(gitDir, '..', '..');
      }
      const mainRoot = commonDir && path.basename(commonDir) === '.git' ? path.dirname(commonDir) : null;
      return { root: d, linked: true, gitDir, commonDir, mainRoot };
    }
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
  return null;
}

function currentBranch(info) {
  const head = info?.gitDir && readText(path.join(info.gitDir, 'HEAD'));
  const m = head && /^ref:\s*refs\/heads\/(.+)$/m.exec(head);
  return m ? m[1].trim() : null;
}

function protectedBranches(info) {
  const set = new Set(['master', 'main']);
  const head = info?.commonDir && readText(path.join(info.commonDir, 'refs', 'remotes', 'origin', 'HEAD'));
  const m = head && /refs\/remotes\/origin\/(.+)$/m.exec(head);
  if (m) set.add(m[1].trim());
  return set;
}

const sameDir = (a, b) => !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

// ---------------------------------------------------------------- git argument analysis

function parseGit(seg, idx, dir, resolveDir) {
  let i = idx + 1;
  let target = dir;
  while (i < seg.length && seg[i].startsWith('-')) {
    const a = seg[i];
    if (a === '-C') { target = resolveDir(target, seg[i + 1]); i += 2; }
    else if (a === '--git-dir' || a === '--work-tree') { target = resolveDir(target, seg[i + 1]); i += 2; }
    else if (a.startsWith('--work-tree=') || a.startsWith('--git-dir=')) { target = resolveDir(target, a.slice(a.indexOf('=') + 1)); i += 1; }
    else if (a === '-c' || a === '--namespace' || a === '--exec-path' || a === '--config-env') { i += 2; }
    else i += 1;
  }
  const args = seg.slice(i + 1).filter((a) => !/^\d*[<>]/.test(a));
  return { sub: seg[i], args, target };
}

function hasShortFlag(args, letter) {
  return args.some((a) => /^-[a-zA-Z]+$/.test(a) && a.includes(letter));
}

function pushTargets(args, branchOfTarget, allBranchesProtected) {
  const pos = [];
  let force = false, del = false, mirror = false, all = false, dry = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') continue;
    if (a.startsWith('--')) {
      if (a === '--force' || a.startsWith('--force-with-lease') || a === '--force-if-includes') force = true;
      else if (a === '--delete') del = true;
      else if (a === '--mirror') mirror = true;
      else if (a === '--all' || a === '--branches') all = true;
      else if (a === '--dry-run') dry = true;
      else if (a === '--repo' || a === '--push-option' || a === '--receive-pack' || a === '--exec') i++;
      continue;
    }
    if (/^-[a-zA-Z]+$/.test(a)) {
      if (a.includes('f')) force = true;
      if (a.includes('d')) del = true;
      if (a.includes('n')) dry = true;
      if (a.endsWith('o')) i++;
      continue;
    }
    pos.push(a);
  }
  const refspecs = pos.slice(1);
  const targets = [];
  for (let rs of refspecs) {
    if (rs.startsWith('+')) { force = true; rs = rs.slice(1); }
    let src = rs, dst = rs;
    if (rs.includes(':')) {
      [src, dst] = rs.split(/:(.*)/s);
      if (src === '') del = true;
    }
    if (dst === 'HEAD' || dst === '@' || dst === '') dst = (src === 'HEAD' || src === '@' || src === '') ? branchOfTarget : src;
    if (dst) targets.push(dst.replace(/^refs\/heads\//, ''));
  }
  if (!refspecs.length && branchOfTarget) targets.push(branchOfTarget);
  return { targets, force, del, mirror, all: all || allBranchesProtected, dry };
}

function destructiveReason(sub, args) {
  if (sub === 'reset' && args.includes('--hard')) return 'git reset --hard discards uncommitted work';
  if (sub === 'clean' && !args.includes('-n') && !args.includes('--dry-run') && (args.includes('--force') || hasShortFlag(args, 'f'))) {
    return 'git clean -f deletes untracked files';
  }
  if (sub === 'checkout' && (args.includes('--') || args.includes('.') || args.includes('--force') || hasShortFlag(args, 'f'))) {
    return 'git checkout of paths (or -f) overwrites uncommitted edits';
  }
  if (sub === 'restore') {
    const staged = args.includes('--staged') || hasShortFlag(args, 'S');
    const worktree = args.includes('--worktree') || hasShortFlag(args, 'W');
    if (!staged || worktree) return 'git restore overwrites uncommitted edits';
  }
  if (sub === 'switch' && (args.includes('--discard-changes') || args.includes('--force') || hasShortFlag(args, 'f'))) {
    return 'git switch --discard-changes/-f overwrites uncommitted edits';
  }
  if (sub === 'stash' && (args[0] === 'drop' || args[0] === 'clear')) return `git stash ${args[0]} deletes stashed work`;
  return null;
}

function deletesOthersWork(sub, args) {
  if (sub === 'worktree' && args[0] === 'remove' && (args.includes('--force') || hasShortFlag(args.slice(1), 'f'))) {
    return 'git worktree remove --force deletes a worktree with uncommitted work (without --force, git refuses a dirty tree, which is the protection)';
  }
  if (sub === 'branch' && (args.includes('-D') || (args.some((a) => a === '--delete' || hasShortFlag([a], 'd')) && (args.includes('--force') || hasShortFlag(args, 'f'))))) {
    return 'git branch -D deletes a branch even when its commits exist nowhere else (git branch -d refuses unless merged)';
  }
  return null;
}

// ---------------------------------------------------------------- the decision

export function evaluate(input, env = process.env) {
  if (!input || !['Bash', 'PowerShell'].includes(input.tool_name)) return null;
  const command = input.tool_input?.command;
  if (typeof command !== 'string' || !/\b(git|gh)(\.exe)?\b/.test(command)) return null;

  const cwd = input.cwd || process.cwd();
  const { toLocal, resolveDir } = makeResolver(cwd);
  // Git Bash rewrites an inherited \\wsl.localhost\... variable to \wsl.localhost\... (one slash).
  let projectDir = env.CLAUDE_PROJECT_DIR || '';
  if (process.platform === 'win32' && /^\\[^\\]/.test(projectDir)) projectDir = '\\' + projectDir;
  const session = repoInfo(projectDir ? toLocal(projectDir) || cwd : cwd, toLocal);
  const here = repoInfo(cwd, toLocal);
  // An implementation session is one whose checkout is a linked worktree.
  const implementation = !!(session?.linked || here?.linked);
  const sessionRoot = session?.root || here?.root || null;
  const guarded = protectedBranches(session || here);

  const walk = (text, startDir) => {
    let dir = startDir;
    for (const seg of tokenize(text)) {
      // nested scripts: bash -lc '...', wsl.exe -e bash -lc '...', powershell -Command '...'
      let segDir = dir;
      const cdAt = seg.indexOf('--cd');
      if (cdAt >= 0 && seg[cdAt + 1]) segDir = resolveDir(dir, seg[cdAt + 1]);
      for (let k = 0; k < seg.length - 1; k++) {
        if (SHELL_SCRIPT_FLAGS.has(seg[k])) {
          const hit = walk(seg[k + 1], segDir);
          if (hit) return hit;
        }
      }
      const head = path.basename(seg[0] || '').replace(/\.exe$/i, '');
      if ((head === 'cd' || head === 'pushd' || head === 'Set-Location') && seg.length <= 2) {
        dir = resolveDir(dir, seg[1] || '~');
        continue;
      }
      if (NOT_A_GIT_CALL.has(head)) continue;

      const ghAt = seg.findIndex((t) => path.basename(t).replace(/\.exe$/i, '') === 'gh');
      if (ghAt >= 0 && seg[ghAt + 1] === 'pr' && seg[ghAt + 2] === 'merge' && implementation) {
        return 'gh pr merge from a task worktree writes to the integration branch. Push your branch and report it; integration is `scripts/dev/crwn land <task>`, run from the main checkout.';
      }

      const gitAt = seg.findIndex((t) => path.basename(t).replace(/\.exe$/i, '') === 'git');
      if (gitAt < 0) continue;
      const { sub, args, target } = parseGit(seg, gitAt, segDir, resolveDir);
      if (!sub) continue;
      const targetInfo = repoInfo(target, toLocal) || here;
      const targetRoot = targetInfo?.root || null;
      const notOwned = !!(sessionRoot && targetRoot && !sameDir(sessionRoot, targetRoot));
      const targetIsMain = targetInfo ? !targetInfo.linked : false;

      if (sub === 'push') {
        const p = pushTargets(args, currentBranch(targetInfo), false);
        if (p.dry) continue;
        const hitsGuarded = p.mirror || p.all || p.targets.some((t) => guarded.has(t));
        if (hitsGuarded && (p.force || p.del || p.mirror)) {
          return `force-pushing, deleting or mirroring the integration branch (${[...guarded].join('/')}) is never allowed from Claude.`;
        }
        if (hitsGuarded && implementation) {
          return `this session is a task worktree, and task sessions never push to the integration branch (${[...guarded].join('/')}). Push your own branch instead: git push -u origin HEAD. Then report the branch; it lands with \`scripts/dev/crwn land <task>\`, which only fast-forwards.`;
        }
      }
      if (notOwned && !READ_ONLY.has(sub) && !(sub === 'stash' && args[0] === 'list') && !(sub === 'worktree' && args[0] === 'list') && !(sub === 'branch' && args.every((a) => a.startsWith('-') && !/^-[dDmMcCf]/.test(a) && a !== '--delete'))) {
        return `git ${sub} here targets ${targetRoot}, which is not this session's checkout (${sessionRoot}). Another session may be working there. Only read-only git commands may reach into another checkout.`;
      }
      const discard = destructiveReason(sub, args);
      if (discard && (targetIsMain || notOwned)) {
        return `${discard}, and ${targetIsMain ? 'the main checkout is shared by every session (the uncommitted files there may be someone else\'s work)' : 'that checkout belongs to another session'}. Revert your own edits by editing the files back, or do this inside your own task worktree.`;
      }
      const loss = deletesOthersWork(sub, args);
      if (loss) return `${loss}. Finished task worktrees are removed with \`scripts/dev/crwn rm <task>\`, which keeps the branch.`;
    }
    return null;
  };

  return walk(command, cwd);
}

// ---------------------------------------------------------------- hook entry point

function main() {
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch { process.exit(0); }
  let reason = null;
  try { reason = evaluate(JSON.parse(raw)); } catch { process.exit(0); }
  if (!reason) process.exit(0);
  process.stderr.write(`git-guard blocked this command: ${reason}\n(See docs/PARALLEL_CLAUDE_SESSIONS.md. The guard is .claude/hooks/git-guard.mjs.)\n`);
  process.exit(2);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
