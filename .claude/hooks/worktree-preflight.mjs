#!/usr/bin/env node
// PreToolUse hook for EnterWorktree (wired in .claude/settings.json).
//
// Windows-side sessions create task worktrees with the EnterWorktree tool, never through
// `crwn <task>`, so the disk preflight there never ran for them: 29 worktrees and 17 GB piled up in
// one day (2026-10-02). This runs the same preflight before EnterWorktree CREATES a worktree:
// finished worktrees and caches are swept, the storage budget is enforced, and the call is
// BLOCKED (exit 2, the reason goes to Claude) when one more worktree would pass the hard limit or C:
// is critically low. Entering an existing worktree creates nothing and is let through.
//
// The engine always runs INSIDE WSL (Windows git corrupts this repo). An engine failure lets the
// call through with a visible warning: a crash is not evidence the disk is full.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REFUSED = 3; // scripts/dev/worktree-clean.mjs

/** \\wsl.localhost\<distro>\home\... (or //wsl$/...) -> { distro, linux }. */
export function toLinux(p) {
  const s = String(p).replace(/\\/g, '/');
  const m = /^\/\/wsl(?:\.localhost|\$)\/([^/]+)(\/.*)$/i.exec(s);
  return m ? { distro: m[1], linux: m[2] } : { distro: null, linux: s };
}

/** Does this EnterWorktree call create a worktree? A `path` means entering one that exists. */
export function creates(input) {
  const ti = input?.tool_input || {};
  return !ti.path;
}

function main() {
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { /* treat as a create */ }
  if (!creates(input)) return 0;

  const self = fileURLToPath(import.meta.url);
  const repo = path.resolve(path.dirname(self), '..', '..');
  const engineArgs = ['--preflight', '--quiet'];
  let r;
  if (process.platform === 'win32') {
    const { distro, linux } = toLinux(repo);
    const args = [...(distro ? ['-d', distro] : []), '-e', 'node', `${linux}/scripts/dev/worktree-clean.mjs`, '--repo', linux, ...engineArgs];
    r = spawnSync('wsl.exe', args, { encoding: 'utf8', timeout: 110000, windowsHide: true });
  } else {
    r = spawnSync(process.execPath, [path.join(repo, 'scripts', 'dev', 'worktree-clean.mjs'), '--repo', repo, ...engineArgs], { encoding: 'utf8', timeout: 110000 });
  }
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
  if (r.status === REFUSED) {
    process.stderr.write(`${out}\n\nEnterWorktree was blocked by the disk preflight (.claude/hooks/worktree-preflight.mjs). Do not create the worktree another way; free the space first.\n`);
    return 2;
  }
  if (r.status !== 0) {
    console.log(JSON.stringify({ systemMessage: `Disk preflight could not run (exit ${r.status ?? r.error?.code}), so disk use was NOT checked before this worktree. ${out.slice(0, 400)}` }));
    return 0;
  }
  const warnings = out.split('\n').filter((l) => /WARNING|crwn clean: /.test(l));
  if (warnings.length) console.log(JSON.stringify({ systemMessage: `Disk preflight: ${warnings.join(' ')}` }));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  let code = 0;
  try { code = main(); } catch (e) { console.log(JSON.stringify({ systemMessage: `Disk preflight hook error: ${String(e.message).slice(0, 200)}` })); }
  process.exit(code);
}
