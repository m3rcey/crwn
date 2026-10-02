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
| `wsl scripts/dev/crwn land <task>` | Fast-forward the REMOTE master to that finished task. Each session runs this itself with `--yes`; you only need it for a branch no session owns |
| `wsl scripts/dev/crwn sync` | Fast-forward your LOCAL main checkout to the remote master |
| `wsl scripts/dev/crwn rm <task>` | Remove a finished task's folder (the branch is kept) |
| `wsl scripts/dev/crwn clean` | Every task worktree: landed or not, dirty or clean, in use or idle, disk. A dry run: changes nothing |
| `wsl scripts/dev/crwn clean --apply` | Do what the dry run listed (see "Cleanup") |

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
- A worktree whose `package-lock.json` differs from the main checkout's is NOT linked (it would
  get the wrong packages). The session is told to run `npm ci` there instead.

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

A task session never pushes master directly; the guard blocks it. It lands its own branch
through `crwn land` instead (since 2026-10-02; before that, you ran every land by hand). When it
finishes, it does these steps:
1. Commits to its branch.
2. Runs `git fetch origin && git merge origin/master`, and resolves any conflicts deliberately.
3. Reruns the tests and build.
4. Runs `git push -u origin HEAD`.
5. Runs `scripts/dev/crwn land <task> --yes`, then does any follow-up that needs the code live.
6. Reports the commit now on master.

**When `land` refuses:**
- the task has uncommitted files;
- the branch is not pushed as-is;
- master moved on since the task reconciled (it prints the merge the task must run);
- the branch changes the app and its last build (`.next/BUILD_ID` in that worktree) is older than
  its last commit, or missing. Changes to only docs, `.claude/`, `scripts/dev/` and `videos/`
  skip this check, because they do not feed the build.

Otherwise it shows the commits and any deleted files and pushes to master as a **plain
fast-forward**. If master moved in the meantime, GitHub rejects it. It never forces, and a
failure changes nothing. Production deploys from master. Without `--yes` it asks first, which is
what you get when you run it yourself.

**What `land` does not touch:** your local main checkout. Update it when no session there is
mid-task:

    wsl scripts/dev/crwn sync

`sync` refuses, changing nothing, in any of these cases:
- the update would overwrite one of your uncommitted files;
- master starts tracking a file you hold locally as an ignored file;
- local master has commits that are not pushed.

Otherwise your uncommitted files stay exactly as they are.

Lands happen one at a time. A session whose land is refused because another one landed first
merges master again, rebuilds, pushes and retries.

## Cleanup: the worktree lifecycle

### What a worktree costs, and why it used to run away

Measured 2026-10-02:
- **The checkout itself**: about 125 MB.
- **`.next`**: about 405 MB after one build, 285 MB of it the Turbopack build cache in
  `.next/cache/turbopack`. The Stop build gate runs `next build` in every worktree on every
  turn that touches code, and Next 16.3 keeps that cache by default. It grows with every build
  after (about 3 to 4 MB per small build, much more after a merge).
- **`node_modules`**: about 17 MB while it is hardlinked to the main checkout. It becomes a real
  1 GB in two cases: a task changes dependencies (it gets its own copy), or the main checkout
  reinstalls (the worktree keeps the OLD files alive, and `crwn clean` reports that as a "stale
  link").

Nothing ever removed any of it, so `.claude/worktrees` reached 6.4 GB in three days and the WSL
disk filled C:.

### The lifecycle

1. **Start**: `crwn <task>` creates the worktree. The SessionStart hook hardlinks `node_modules`.
2. **Work**: the build gate keeps `.next` while the task is active, so builds stay fast (85 s
   cold, 15 to 30 s warm). The Turbopack cache is capped at 768 MB: past that it is deleted after
   a passing build, and the next build is cold once. To change the cap, set
   `CRWN_BUILD_CACHE_CAP_MB`.
3. **End the session**: type `/exit` or close the terminal. Claude asks whether to keep the
   worktree:
   - **Keep**: always pick this until the task has landed.
   - **Remove**: deletes the folder AND the branch, including commits that exist nowhere else.
     Pick it only for a task you are abandoning.
4. **Idle**: after 12 hours with no use, the next sweep deletes the worktree's `.next` and
   `node_modules`. Its files and commits stay exactly as they are. Both caches come back on their
   own when you resume: the hook re-links `node_modules`, and the next build rebuilds `.next`.
5. **Landed**: once every commit on the branch is in `origin/master`, the worktree is clean, and
   it is idle, the sweep removes the worktree. **The branch is always kept.**

### When the sweep runs

- **After `crwn land <task>`, for that task only.** If its session is still open (the usual
  case), it says so and leaves the worktree. A later sweep removes it.
- **Every time `crwn <task>` starts a new task**, across all worktrees. Quiet unless it acts.
- **By hand**, `crwn clean` (see below).

### What the sweep never does

- **It never touches a worktree that is in use.** Any one of these counts:
  - a running process has its cwd inside it (a WSL Claude session, a dev server, a build);
  - a Claude transcript written in the last 12 hours records a cwd inside it. This is how it sees
    Windows-side sessions, which WSL cannot see as processes;
  - a file in it changed in the last 12 hours, or git moved its HEAD in that time;
  - git holds a lock on it with a live pid (a lock whose pid has died is stale and does not count).
- **It never removes a worktree with an uncommitted or untracked file.** Git refuses that by
  itself as well, because the sweep never passes `--force`.
- **It never removes an unlanded worktree**, pushed or not.
- **It never removes a worktree holding an ignored file that is not a cache.** `git worktree
  remove` deletes ignored files silently, so a private `.env.local` (one that differs from the main
  checkout's) or a render output blocks removal. A byte-identical copy of the main checkout's file
  does not.
- **It never deletes a branch.**
- **It re-reads every fact just before each deletion.** A worktree that became busy in between is
  left alone.

Change the 12 hours with `--active-hours N` or `CRWN_ACTIVE_HOURS`.

### Running it by hand

Dry run. It changes nothing and shows each worktree's branch, landed or not, pushed or not, dirty
or clean, in use (and why), disk use, and the plan:

    wsl scripts/dev/crwn clean

Then do what it listed:

    wsl scripts/dev/crwn clean --apply

Options:
- `--skip <task>` never touches that task (repeatable).
- `--only <task>` handles just that one.
- `--no-sizes` skips the disk measurement.
- `--no-fetch` judges against the cached `origin/master`.

A task session may run the dry run. `--apply` is refused there (by the script and by git-guard),
because it changes other sessions' checkouts.

`crwn rm <task>` still removes one finished worktree directly. It refuses while that task's
session is running, and git refuses if anything is uncommitted.

### Reopening a removed or unmerged task

    wsl scripts/dev/crwn resume <task>

- If the folder is gone, this recreates it from the kept branch, commits intact.
- If the local branch was deleted but the branch is on origin, it recreates the branch from
  `origin/worktree-<task>` first.

Through plain git (from the main checkout):

    git worktree add .claude/worktrees/<task> worktree-<task>

Deleting a branch is optional, and only for landed branches:

    git branch -d worktree-<task>

`-d` refuses unless the branch is merged, so it cannot lose work. `git branch -D` is blocked by
the guard.

### Getting the space back on C:

Deleting files inside WSL does NOT shrink
`C:\Users\Josh\AppData\Local\Packages\CanonicalGroupLimited.Ubuntu_79rhkp1fndgsc\LocalState\ext4.vhdx`.
The file only grows. When C: runs low, compact it by hand. This stops every WSL session.

- **Never use sparse mode.** `wsl --manage Ubuntu --set-sparse true` is refused on this WSL build
  ("potential data corruption"), and `--allow-unsafe` is not worth the risk.
- `Optimize-VHD` is not installed here, so use `diskpart`, which ships with Windows. Its steps are
  saved in `C:\Users\Josh\compact-wsl-disk.txt`: attach read-only, compact, detach.

The steps:
1. Close VS Code and every Claude session. Anything open on `\\wsl.localhost` restarts WSL.
2. In an admin PowerShell, run these three lines. Do not type the diskpart steps into PowerShell
   yourself: PowerShell reads them as its own commands.

       wsl -u root fstrim -av
       wsl --shutdown
       diskpart /s C:\Users\Josh\compact-wsl-disk.txt

3. It should end with "DiskPart successfully detached the virtual disk file."
   - "File in use" means WSL restarted. Run the last two lines again.
   - On any other error, restart Windows, which detaches the disk.

The first run, on 2026-10-02, took the vhdx from 20.56 GB to 17.19 GB with 14 GB in use. The
vhdx always sits about 3 GB above what `df` reports, because ext4's own structures live there too.

## The safeguard

`.claude/settings.json` runs `.claude/hooks/git-guard.mjs` before every Bash and PowerShell command
in every session. This is code, not an instruction.

**Blocked from a task session:**
- a push to master (or `main`, or `origin/HEAD`'s branch);
- `gh pr merge`;
- `crwn sync` and `crwn clean --apply` (`crwn land` is allowed: it is how a session lands its own branch);
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
