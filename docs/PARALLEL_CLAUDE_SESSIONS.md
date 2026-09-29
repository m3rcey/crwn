# Parallel Claude sessions: one task, one worktree

Every task session gets its own folder (a git worktree) and its own branch. Edits, commits, pushes
and dependency installs in one session never touch another. The main checkout (`~/workspace-crwn`)
is the integration checkout: it stays on `master`, and finished branches reach master only
through `crwn land`.

## Starting parallel sessions

In one VS Code terminal (PowerShell is fine):

    wsl scripts/dev/crwn manychat-fix

At the same time, in a second terminal:

    wsl scripts/dev/crwn instagram-dms

Other ways to start one:
- From a WSL shell, drop the `wsl` prefix.
- Leave the name off and Claude picks one.
- Terminal > Run Task > **CRWN: new Claude task**.

To type plain `crwn` in WSL, run this once:

    ln -s ~/workspace-crwn/scripts/dev/crwn ~/.local/bin/crwn

It has to run in WSL, because Windows-side git corrupts this repo (its colon-named files).

Each task gets:
- the folder `~/workspace-crwn/.claude/worktrees/<task>`;
- the branch `worktree-<task>`, cut from a freshly fetched `origin/master`.

A name that is already in use is refused, with the reason.

## Useful commands

The commands below are shown as `wsl scripts/dev/crwn ...`. With the symlink, `crwn ...` does
the same.

| Command | What it does |
|---|---|
| `wsl scripts/dev/crwn ls` | Every worktree: branch, commits ahead/behind master, uncommitted files, pushed or not |
| `wsl scripts/dev/crwn resume <task>` | Reopen a task you kept, in a new terminal |
| `wsl scripts/dev/crwn land <task>` | Fast-forward the REMOTE master to that finished task (asks first) |
| `wsl scripts/dev/crwn sync` | Fast-forward your LOCAL main checkout to the remote master |
| `wsl scripts/dev/crwn rm <task>` | Remove a finished task's folder (the branch is kept) |

## Dependencies (`node_modules`)

A new task hardlinks the main checkout's `node_modules`: about 4 seconds and 17 MB, instead of
copying about 1 GB.

When Claude runs an npm command that changes dependencies there, the guard first gives that
worktree its own full copy, automatically. That covers `install`/`i`/`add`, `uninstall`/`rm`,
`update`, `rebuild`, `dedupe`, `prune`, `link` and `audit fix`. The copy takes about 5 seconds and
1 GB, then the command runs. Nothing to do on your side.

- Other sessions and the main checkout keep exactly what they had.
- If the copy fails (for example, a full disk), the npm command is blocked rather than run on
  shared files.
- `npm ci` needs no copy: it replaces `node_modules` outright.
- Builds and test runs never need a copy.

Why this design (measured, 2026-09-29):
- npm and `next build` write new files and never edit an installed file, so sharing is safe for them.
- npm's own install record (`node_modules/.package-lock.json`) and vitest's cache
  (`node_modules/.vite`) are edited in place, so every worktree gets private copies of those.

Anything else that writes inside `node_modules` directly (say, hand-editing a package file) is
not covered, so do not do that in a task.

## Instagram MCP

It works in every task session automatically; there is no setup.
- `.mcp.json` names the server by a relative path, which works from both Windows and WSL.
- The server reads the one token in the main checkout's `.env.instagram`, and refreshes it there.
- Worktrees get no copy of the token.

Tools are read-only. The first use in a session still asks permission, as it does today.

## Integration: how work reaches master

A task session never pushes master; the guard blocks it. When it finishes, it does these steps:
1. Commits to its branch.
2. Runs `git fetch origin && git merge origin/master`, and resolves any conflicts deliberately.
3. Reruns the tests and build.
4. Runs `git push -u origin HEAD`.
5. Reports the branch, folder and commit.

Then you land it:

    wsl scripts/dev/crwn land manychat-fix

**When `land` refuses:**
- the task has uncommitted files;
- the branch is not pushed as-is;
- master moved on since the task reconciled (it prints the merge the task must run).

Otherwise it shows the commits and any deleted files, asks, and pushes to master as a **plain
fast-forward**. If master moved in the meantime, GitHub rejects it. It never forces, and a
failure changes nothing. Production deploys from master.

**What `land` does not touch:** your local main checkout. Update it when no session there is
mid-task:

    wsl scripts/dev/crwn sync

`sync` refuses, changing nothing, in any of these cases:
- the update would overwrite one of your uncommitted files;
- master starts tracking a file you hold locally as an ignored file;
- local master has commits that are not pushed.

Otherwise your uncommitted files stay exactly as they are.

Land one task at a time. The next one will be behind master: reconcile it in its session, then land it.

## Cleanup: ending, keeping and removing

There are three separate things to finish, in this order:

1. **Ending the Claude session.** Type `/exit` or close the terminal. Nothing is deleted.
   Claude then asks whether to keep the worktree:
   - **Keep**: always pick this until the task has landed. `wsl scripts/dev/crwn resume <task>`
     reopens it later.
   - **Remove**: deletes the folder AND the branch, including commits that exist nowhere else.
     Pick it only for a task you are abandoning, or one that `crwn ls` shows fully landed.
2. **Removing the folder** once it has landed:

       wsl scripts/dev/crwn rm manychat-fix

   This refuses while that task's session is running, and git refuses if anything is uncommitted
   (it is never forced). The branch is kept, and it tells you whether it is pushed and landed.
3. **Deleting the branch** (optional, landed branches only):

       git branch -d worktree-manychat-fix

   `-d` refuses unless the branch is merged, so it cannot lose work.

Disk: about 120 MB per worktree, plus about 400 MB after a build, plus about 1 GB if it changed
dependencies. C: is tight, so `rm` finished tasks.

## The safeguard

`.claude/settings.json` runs `.claude/hooks/git-guard.mjs` before every Bash and PowerShell command
in every session. This is code, not an instruction.

**Blocked from a task session:**
- a push to master (or `main`, or `origin/HEAD`'s branch);
- `gh pr merge`;
- `crwn land` and `crwn sync`;
- any git write into a checkout that is not its own.

**Blocked from anywhere:**
- a force push, delete or mirror of master;
- `worktree remove --force`;
- `branch -D`.

**Blocked in the shared main checkout:** `reset --hard`, `clean -f`, `checkout -- <paths>`,
`restore`, `stash drop` and `stash clear`.

It also runs the dependency isolation described above.

Commits, pushes of the session's own branch (even `--force-with-lease`), merges, tests and builds
pass untouched. `npm run test:hooks` runs its tests. It guards Claude's commands only, not what you
type yourself.
