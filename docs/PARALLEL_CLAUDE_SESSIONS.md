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

### Why the first cleaner still let it run away (2026-10-03)

The first cleaner (2026-10-02) called a worktree "in use" for 12 hours after any trace of
activity, and an in-use worktree kept EVERYTHING, caches included. Every trace fires on a
finished task:
- a fresh checkout stamps every file with its creation time, so "a file changed within 12h" was
  true of every worktree for the first 12 hours of its life;
- the land itself moves HEAD, so "git activity within 12h";
- the session's transcript names it, so "a Claude session worked in it within 12h";
- a Windows-side session's lock is `claude session <task>` with no pid, and a pid-less lock
  counted as in use forever;
- and the post-land sweep never ran for a task that landed itself: run from inside the worktree it
  skipped by design, and run from a task session the engine refused `--apply`.

Windows-side sessions also create worktrees with `EnterWorktree`, never through `crwn <task>`, so
the pre-create sweep never ran for them. Result on 2026-10-03: 29 worktrees, 17 GB, C: from 19.4
GB free to 0.5 GB in one day. The test suite missed it because it backdated every file two days
before sweeping, which no real worktree ever is. History is not liveness.

### What "held" means now: current liveness only

- **Busy**: a process that is not a Claude session has its cwd inside it right now (a build, a dev
  server, a test run). Nothing at all is touched.
- **Held by a live session**: any one of these, checked at the moment of the sweep:
  - a Claude session whose process is alive NOW has its cwd there. Claude writes
    `sessions/<pid>.json` (pid, process start time, cwd) for every session, WSL-side in
    `~/.claude` and Windows-side in `C:\Users\<you>\.claude`. A pid alone proves nothing (a crashed
    session's file stays behind, and on 2026-10-03 one dead session's Windows pid belonged to a
    svchost), so the process's start time must equal the recorded one: `/proc/<pid>/stat` for WSL,
    one PowerShell `Get-Process` call (about 0.6 s) for Windows. The cwd is the registry's and the
    LAST one in that session's transcript and its subagents' transcripts (`EnterWorktree` moves a
    session after it starts). If Windows cannot answer, the session counts as held;
  - a live session's own recent tool calls (the commands it ran, the files it read or edited, in the
    last MB of its transcript) point into it. A Windows session on the main checkout works in a
    worktree through `wsl.exe ... cd <worktree>` and `\\wsl.localhost` paths, so its cwd never
    moves (2026-10-02: a land emptied such a worktree's `node_modules` mid-task). Only tool INPUTS
    count: a tool result such as `git worktree list` names every worktree and is not work in any;
  - a git lock naming a pid that is alive now (with a matching start time when the lock records
    one). A pid-less lock is not evidence of anything by itself;
  - the shell running the sweep is inside it (`crwn land` run from the task's own worktree);
  - it was created in the last 20 minutes (a session still starting has not recorded its cwd yet),
    or a transcript with no live registry entry recorded it as its cwd in the last 20 minutes.
    Minutes, never hours (`CRWN_GRACE_MINUTES`).
- **Nothing**: everything else, however recently it was used.

**Source and cache have different rules.** A held worktree keeps its files, but once its task is
landed and clean its `.next` goes immediately, live session or not: a wrong guess about liveness
may cost a rebuild, never gigabytes. `node_modules` stays while a session holds it (it is a 17 MB
hardlink, and a follow-up test run needs it).

### The lifecycle

1. **Start**: `crwn <task>` (WSL terminal) or `EnterWorktree` (a Windows-side session) creates the
   worktree. Both run the disk preflight first (below). The SessionStart hook hardlinks
   `node_modules`.
2. **Work**: the build gate keeps `.next` while the task is active, so builds stay fast (85 s
   cold, 15 to 30 s warm). The Turbopack cache is capped at 768 MB per worktree as a secondary
   bound (`CRWN_BUILD_CACHE_CAP_MB`); the global budget below is the primary one.
3. **Land**: `crwn land` sweeps every worktree. The landed task loses its `.next` at once, even
   while its session is still open, and every other finished worktree nothing holds is removed.
4. **Session ends**: the next sweep (any land, any new task) removes the landed worktree. When
   Claude asks on exit whether to keep the worktree, pick **Keep** until the task has landed:
   **Remove** deletes the folder AND the branch, including commits that exist nowhere else.
5. **Never removed automatically**: dirty, unlanded, or holding a private ignored file. If nothing
   holds such a worktree, it still loses `.next` and `node_modules`; both come back on their own
   (the hook re-links `node_modules`, the next build rebuilds `.next`). **The branch is always
   kept.**

### The storage budget and the C: guard

Every sweep that applies measures `.claude/worktrees` (disk not shared with the main checkout's
`node_modules`) and the free space on C:, where the WSL disk lives.

| Threshold | Default | Override | What happens |
|---|---|---|---|
| warning | 3 GB | `CRWN_WT_WARN_MB` | a WARNING line, even in quiet runs |
| aggressive | 4 GB | `CRWN_WT_AGGRESSIVE_MB` | `.next` also goes from every worktree that is not busy, live and unlanded ones included |
| hard limit | 5 GB | `CRWN_WT_HARD_MB` | a new worktree is refused if the total plus one more (`CRWN_WT_NEW_MB`, 600 MB) would pass it |
| C: warning | 20 GB free | `CRWN_C_WARN_GB` | a WARNING line |
| C: critical | 12 GB free | `CRWN_C_CRITICAL_GB` | a new worktree is refused |

**Before every new worktree** (`crwn <task>`, and the `EnterWorktree` PreToolUse hook
`.claude/hooks/worktree-preflight.mjs` for Windows-side sessions): sweep, apply the budget,
re-measure, and only then allow it. A refusal (exit 3, which the hook turns into a blocked tool
call) names every worktree still holding space and why, and gives the exact cleanup and VHDX
compaction steps. A crash of the engine itself lets the worktree through with a loud warning: a
bug is not evidence the disk is full.

**C: does not recover by itself.** The WSL disk file is not sparse, so space freed inside WSL is
only returned to Windows by compacting it (every session closed, an Administrator PowerShell). That
is why the C: guard refuses early instead of trusting a cleanup to fix it.

### When the sweep runs

- **After every `crwn land`**, across all worktrees.
- **Before every new worktree**: `crwn <task>` and `EnterWorktree` (refused when still unsafe).
- **By hand**, `crwn clean` (see below).

### What the sweep never does

- **It never touches a busy worktree**, and never removes one a live session holds.
- **It never removes a worktree with an uncommitted or untracked file.** Git refuses that by
  itself as well, because the sweep never passes `--force`.
- **It never removes an unlanded worktree**, pushed or not.
- **It never removes a worktree holding an ignored file that is not a cache.** `git worktree
  remove` deletes ignored files silently, so a private `.env.local` (one that differs from the main
  checkout's) or a render output blocks removal. A byte-identical copy of the main checkout's file
  does not.
- **It never deletes a branch.**
- **It re-reads every fact just before each deletion**, sessions included. A worktree that became
  busy in between is left alone.

### Running it by hand

Dry run. It changes nothing and shows each worktree's branch, landed or not, pushed or not, dirty
or clean, held now (and by what), disk use, the plan, and the storage budget:

    wsl scripts/dev/crwn clean

Then do what it listed:

    wsl scripts/dev/crwn clean --apply

Options:
- `--skip <task>` never touches that task (repeatable).
- `--only <task>` handles just that one.
- `--no-sizes` skips the disk measurement.
- `--no-fetch` judges against the cached `origin/master`.

A task session may run the dry run. A hand `--apply` is refused there (by the script and by
git-guard): broad cleanup is the main checkout's call. The lifecycle runs (`--auto` from
`crwn land`, `--preflight` from `crwn <task>` and the EnterWorktree hook) are allowed from
anywhere, because what they may do is decided by the liveness rules, not by who runs them.

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
