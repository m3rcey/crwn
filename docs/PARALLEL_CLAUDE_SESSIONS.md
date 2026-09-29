# Parallel Claude sessions: one task, one worktree

Run as many Claude Code sessions as you like. Each gets its own folder (a git worktree) and its own
branch, so their edits, commits and pushes never touch each other. The main checkout
(`~/workspace-crwn`) is the integration checkout: it stays on `master`, and finished branches land
there as fast-forwards.

## Start a task

In a VS Code terminal (PowerShell is fine):

    wsl scripts/dev/crwn manychat-fix

In a second terminal, at the same time:

    wsl scripts/dev/crwn instagram-dms

From a WSL shell, drop the `wsl`: `scripts/dev/crwn manychat-fix`. With no name
(`wsl scripts/dev/crwn`), Claude picks one such as `bright-running-fox`. With no typing at all:
Terminal > Run Task > **CRWN: new Claude task**.

Optional, once, to type just `crwn` (inside WSL):

    ln -s ~/workspace-crwn/scripts/dev/crwn ~/.local/bin/crwn

It has to run in WSL: Windows-side git corrupts this repo (it cannot write the colon-named files),
so the launcher refuses to run anywhere else.

## Where things live

| | |
|---|---|
| Worktree | `~/workspace-crwn/.claude/worktrees/<task>` (gitignored) |
| Branch | `worktree-<task>`, cut from a freshly fetched `origin/master` |
| `node_modules` | hardlinked from the main checkout on first start (about 4s, about 17 MB) |
| `.env.local`, `.env.instagram` | copied in by Claude Code from `.worktreeinclude`; never committed |
| `settings.local.json`, skills | read from the main checkout, so permissions and Stop hooks still apply |

Cost per worktree: about 120 MB of files, plus about 400 MB of `.next` once it builds. C: is nearly
full, so remove finished worktrees.

## See what is running

    wsl scripts/dev/crwn ls

This lists every worktree with its branch, commits ahead and behind master (`+3 -1`), uncommitted
file count, and whether the branch is pushed.

## When a task finishes

The session:
1. Commits to its branch.
2. Runs `git fetch origin && git merge origin/master` and resolves any conflicts deliberately.
3. Reruns the tests and build.
4. Pushes with `git push -u origin HEAD`.
5. Reports the branch, the worktree path and the commit.

It never pushes master.

When you close the session, Claude asks whether to keep the worktree. **Keep it** until the branch
has landed. "Remove" deletes the branch too.

## Land it (you, from any terminal)

    wsl scripts/dev/crwn land manychat-fix

`land` refuses in each of these cases:
- the worktree has uncommitted files;
- the branch is not pushed as-is;
- master has moved on since the branch was reconciled (it prints the merge to run in the task).

Otherwise it shows the commits and any deleted files, asks, and pushes the branch tip to master as a
**plain fast-forward**. If master moved in the meantime, GitHub rejects the push; it never forces.
Production deploys from master.

Then sync the main checkout when nothing is mid-task there:
`git -C ~/workspace-crwn merge --ff-only origin/master`.

Land one branch at a time. The second one will be "behind": reconcile it in its session, then land it.

## Remove a finished worktree

    wsl scripts/dev/crwn rm manychat-fix

This refuses while its Claude session is still running. It never uses `--force`, so git refuses if
work is uncommitted. The branch is kept. Delete a landed one with `git branch -d worktree-manychat-fix`
(`-d` refuses unless it is merged).

## The safeguard

`.claude/settings.json` runs `.claude/hooks/git-guard.mjs` before every Bash and PowerShell command
in every session. This is code, not a prompt instruction. It blocks:

- a push to master (or `main`, or whatever `origin/HEAD` names) from a task worktree;
- `gh pr merge` from a task worktree;
- a force push, a delete or a mirror of master, from anywhere;
- any git write into a checkout that is not the session's own (read-only commands such as
  `status`, `log`, `diff` and `fetch` pass);
- in the shared main checkout: `reset --hard`, `clean -f`, `checkout -- <paths>`, `restore`,
  `stash drop` and `stash clear`;
- anywhere: `worktree remove --force` and `branch -D`.

Commits, feature-branch pushes (including `--force-with-lease` on the session's own branch), merges,
tests and builds all pass untouched. `npm run test:hooks` runs its tests.

It is a seatbelt against accidents, not a security boundary: a human in a terminal is not affected.
`crwn land` refuses to run from a Claude session inside a task worktree.
