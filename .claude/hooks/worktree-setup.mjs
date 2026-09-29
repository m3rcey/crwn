#!/usr/bin/env node
// SessionStart hook (wired in .claude/settings.json). Does nothing outside a task worktree.
//
// In a task worktree (docs/PARALLEL_CLAUDE_SESSIONS.md) it:
//   1. gives the worktree a node_modules by HARDLINKING the main checkout's (cp -al: ~4s,
//      ~17 MB of directory entries instead of ~1 GB). A symlink is not an option: Turbopack
//      refuses a node_modules that points outside the project root, so `npm run build` and the
//      build-gate Stop hook would fail in every worktree (verified 2026-09-29).
//   2. tells Claude which task branch it is on and the three rules that keep sessions apart.
//      SessionStart stdout is added to the session's context, so only task sessions pay for it.
//
// Never fails the session: every error path exits 0 with a note.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { repoInfo } from './git-guard.mjs';

function main() {
  if (process.platform === 'win32') return; // task sessions run in WSL (git must, see CLAUDE.md)
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { /* use cwd */ }
  const info = repoInfo(input.cwd || process.cwd());
  if (!info?.linked || !info.mainRoot) return;

  const notes = [];
  const mine = path.join(info.root, 'node_modules');
  const shared = path.join(info.mainRoot, 'node_modules');
  if (!fs.existsSync(mine) && fs.existsSync(shared)) {
    const r = spawnSync('cp', ['-al', shared, mine], { encoding: 'utf8' });
    notes.push(r.status === 0
      ? 'node_modules: hardlinked from the main checkout (no extra disk). If this branch changes package.json, run npm ci here; it replaces the links with real files for this worktree only.'
      : `node_modules: hardlink copy failed (${(r.stderr || '').trim().slice(0, 200)}). Run: cp -al ${shared} ${mine}`);
  }

  const head = fs.readFileSync(path.join(info.gitDir, 'HEAD'), 'utf8').trim().replace(/^ref: refs\/heads\//, '');
  console.log([
    `You are in a CRWN task worktree: ${info.root} on branch ${head}. Other Claude sessions work in the main checkout and in other worktrees at the same time.`,
    'Commit to this branch and push it (git push -u origin HEAD). Never push master: a finished branch is landed by Josh with scripts/dev/crwn land <task>.',
    'Before reporting done: git fetch origin && git merge origin/master, resolve conflicts deliberately, rerun the relevant tests/build, push, and report the branch, worktree path and commit.',
    ...notes,
  ].join('\n'));
}

try { main(); } catch { /* never block a session start */ }
process.exit(0);
