// Drift gate for the Claude Code subagents in `.claude/agents/**.md`.
//
// WHY THIS EXISTS. These twelve files are development agents, not runtime product code, so no
// gate in this repo looked at them. That is exactly how Marcus, whose entire job is verifying the
// build, drifted into running `npm run build` in an environment where it FAKE-PASSES: he would
// report a clean build on code that does not compile, and nothing could have caught it. The same
// blind spot let Orion keep instructing an agent to rebuild the cross-artist prompt injection
// that Z10 deliberately removed, and to read two modules that no longer exist.
//
// WHAT THIS TESTS, AND WHAT IT DELIBERATELY DOES NOT. Prose cannot be usefully asserted, so this
// file tests only FALSIFIABLE OPERATIONAL CLAIMS: does the file exist, does the command exist,
// does the referenced path exist, does the agent repeat a fact the repo has since retired. There
// is deliberately no "every agent must contain the same paragraph" test, no sentence equality and
// no regex for vague words like "secure": those pass while meaning nothing, which is the failure
// mode this whole drift system was built to avoid.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync as fsExists } from 'node:fs';
import { join, relative } from 'node:path';
import { violation } from './sourceScan';

const ROOT = process.cwd();
const AGENT_DIR = join(ROOT, '.claude', 'agents');

function listAgentFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listAgentFiles(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

const FILES = listAgentFiles(AGENT_DIR);
const AGENTS = FILES.map(f => ({
  path: relative(ROOT, f).replace(/\\/g, '/'),
  name: /^name:\s*(\S+)/m.exec(readFileSync(f, 'utf8'))?.[1] ?? '',
  body: readFileSync(f, 'utf8'),
}));

// Derived from disk, so adding an agent does not require touching a registry. What IS pinned is
// the set that must never silently disappear: losing the build verifier or the migration
// reviewer removes a safety net without any test going red.
const REQUIRED_AGENTS = ['marcus', 'priya', 'sage', 'devon', 'kai', 'amara'];

describe('AGENT-001 the subagent inventory is intact', () => {
  it('every agent file parses and declares a name in its frontmatter', () => {
    expect(AGENTS.length, 'no agent files found; the path or the directory moved').toBeGreaterThan(0);
    for (const a of AGENTS) {
      expect(a.name, violation('REGISTRY', `${a.path} has no \`name:\` in its frontmatter, so Claude Code cannot address it`, { file: a.path })).not.toBe('');
    }
  });

  it('agent names are unique and match their filename', () => {
    const names = AGENTS.map(a => a.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes, `duplicate agent names: ${dupes.join(', ')}`).toHaveLength(0);
    for (const a of AGENTS) {
      const file = a.path.split('/').pop()!.replace('.md', '');
      expect(a.name, `${a.path} declares name "${a.name}" but is filed as "${file}"`).toBe(file);
    }
  });

  it('no required agent has been deleted', () => {
    const names = new Set(AGENTS.map(a => a.name));
    for (const req of REQUIRED_AGENTS) {
      expect(
        names.has(req),
        violation('REGISTRY', `required agent "${req}" is missing from .claude/agents. Deleting a build/migration/security agent removes a safety net; if that was intentional, remove it from REQUIRED_AGENTS in the same commit.`, { file: '.claude/agents' }),
      ).toBe(true);
    }
  });

  it('every agent declares its tools and model explicitly', () => {
    for (const a of AGENTS) {
      expect(/^tools:\s*\S/m.test(a.body), `${a.path} must declare tools (least privilege is a choice, not a default)`).toBe(true);
      expect(/^model:\s*\S/m.test(a.body), `${a.path} must declare a model`).toBe(true);
    }
  });
});

describe('AGENT-002 commands an agent claims to run must actually work', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };

  it('every `npm run <script>` named by an agent exists in package.json', () => {
    for (const a of AGENTS) {
      for (const m of a.body.matchAll(/npm run ([a-z:]+)/g)) {
        expect(
          pkg.scripts[m[1]] !== undefined,
          violation('REGISTRY', `${a.path} tells the agent to run \`npm run ${m[1]}\`, which is not a script in package.json. An agent that runs a nonexistent command reports a failure it cannot explain, or worse, treats the error as a pass.`, { file: a.path }),
        ).toBe(true);
      }
    }
  });

  // The Marcus lesson, generalized. `npm run build` from the Bash tool in this environment exits
  // 0 without really compiling, so any agent that CLAIMS to verify the build must invoke it
  // through WSL. Scoped to build/verify scripts on purpose: not every command needs this, and
  // blanket-prepending wsl.exe would be cargo cult.
  it('any agent that runs the build or the architecture gate invokes it through WSL', () => {
    for (const a of AGENTS) {
      for (const script of ['build', 'verify:architecture', 'test']) {
        const idx = a.body.indexOf(`npm run ${script}`);
        if (idx === -1) continue;
        const context = a.body.slice(Math.max(0, idx - 200), idx);
        expect(
          context.includes('wsl.exe'),
          violation('REGISTRY', `${a.path} runs \`npm run ${script}\` without a nearby wsl.exe invocation. Directly from the Bash tool this can exit 0 without really running, which is how a build agent certifies a build it never performed.`, { file: a.path }),
        ).toBe(true);
      }
    }
  });

  it('every concrete src/ path an agent cites still exists', () => {
    for (const a of AGENTS) {
      for (const m of a.body.matchAll(/`(src\/[^`]+\.(?:ts|tsx))`/g)) {
        const p = m[1];
        if (p.includes('[')) continue; // a route template, not a real path
        expect(
          fsExists(join(ROOT, p)),
          violation('REGISTRY', `${a.path} sends the agent to ${p}, which does not exist. A dead pointer wastes the agent's first turn and invites it to invent the file's contents.`, { file: a.path }),
        ).toBe(true);
      }
    }
  });
});

describe('AGENT-003 no agent teaches a fact the repository has retired', () => {
  const forbidden: [RegExp, string][] = [
    // Stripe Express pays automatically; the weekly-payout cron was retired 2026-08-11 having
    // never created a payout. Scoped to payout-adjacent text so an unrelated weekly ritual is fine.
    [/payout[^.\n]{0,80}every Monday/i, 'the retired weekly/Monday payout schedule'],
    [/every Monday[^.\n]{0,80}payout/i, 'the retired weekly/Monday payout schedule'],
    [/weekly payouts/i, 'the retired weekly payout schedule'],
    // Founder call 2026-07-15: nothing sets is_founding_artist anymore.
    [/founding[- ]artist (override|fee|rate)/i, 'the retired founding-artist fee override'],
    // NOTE: the deleted modules (crossArtistPatterns, snapshotMetrics) are deliberately NOT
    // banned by name here. Orion and Reese must be able to say "this was deleted, do not
    // recreate it", and a rule that forbids naming a thing also forbids warning about it. The
    // harmful case is being SENT there, and the path-existence test above already catches that:
    // a dead destination is written as a backticked src/ path, a warning is not.
    // SMS was removed 2026-07-31 (A2P compliance cost).
    [/\bTwilio\b/i, 'Twilio, which was removed with SMS'],
    // `empire` is dead; resolveTierKey aliases stray values to `scale`.
    [/\bempire\b/i, 'the dead `empire` plan tier'],
    // A secret must never be public.
    [/NEXT_PUBLIC_CRON_SECRET/, 'a cron secret in a NEXT_PUBLIC_ var'],
  ];

  it('none of the retired claims appear in any agent', () => {
    for (const a of AGENTS) {
      for (const [re, what] of forbidden) {
        expect(
          re.test(a.body),
          violation('REGISTRY', `${a.path} still teaches ${what}. An agent repeating a retired fact is worse than one that says nothing: it is confidently wrong, and it will defend it.`, { file: a.path }),
        ).toBe(false);
      }
    }
  });

  it('no agent hardcodes a test-count total', () => {
    // Guaranteed drift: the coding-agent manual once said "820 tests across 50 files" while the
    // suite really ran far more. Instructions must say to run the command and report the result.
    for (const a of AGENTS) {
      expect(
        /\b\d{3,}\s+tests\b/i.test(a.body),
        violation('REGISTRY', `${a.path} hardcodes a test total, which is stale the moment anyone adds a test. Tell the agent to run the command and report the current number.`, { file: a.path }),
      ).toBe(false);
    }
  });

  it('no agent claims CRWN funds a collaborator share', () => {
    // Team Splits are ARTIST-funded. CRWN platform revenue never subsidizes a collaborator.
    for (const a of AGENTS) {
      expect(
        /CRWN\s+(pays|funds|covers|subsidi[sz]es)[^.\n]{0,40}(collaborator|split)/i.test(a.body),
        violation('MONEY', `${a.path} suggests CRWN funds collaborator economics. Team Splits are artist-funded; platform revenue never subsidizes a share.`, { file: a.path }),
      ).toBe(false);
    }
  });

  it('no agent describes autonomous Manager as active', () => {
    for (const a of AGENTS) {
      expect(
        /autonomous manager (is |remains )?(active|enabled|running|live)/i.test(a.body),
        violation('REGISTRY', `${a.path} describes autonomous Manager as active. It is DORMANT by founder decision; re-enabling it is not a cleanup.`, { file: a.path }),
      ).toBe(false);
    }
  });
});

describe('AGENT-004 the agents whose job IS a safety net still describe it correctly', () => {
  const byName = (n: string) => AGENTS.find(a => a.name === n)!;

  it('the migration reviewer carries the current migration/security contract', () => {
    const priya = byName('priya').body;
    // Each of these was a real, expensive lesson; a migration reviewer that does not know them
    // will approve a migration that certifies nothing.
    expect(priya, 'must require a self-verify block').toMatch(/self-verif/i);
    expect(priya, 'must require asserting privileges, not object existence').toMatch(/relrowsecurity|privilege/i);
    expect(priya, 'must know REVOKE FROM PUBLIC leaves per-role grants').toMatch(/FROM PUBLIC/);
    expect(priya, 'must require enforcement to match assertion').toMatch(/ENFORCE/);
    expect(priya, 'must know the inverted security-probe semantics').toMatch(/42501/);
  });

  it('the cross-artist agents keep their output away from artists', () => {
    for (const n of ['orion', 'reese']) {
      const body = byName(n).body;
      expect(body, `${n} must name the canonical cross-artist path`).toMatch(/crossArtistEvidence/);
      expect(body, `${n} must forbid artist-facing injection of cross-artist material`).toMatch(/[Nn]ever[\s\S]{0,80}artist-facing|must never be[\s\S]{0,20}injected/);
    }
  });

  it('the pricing agent points at the canonical ladder rather than quoting a number', () => {
    const nadia = byName('nadia').body;
    expect(nadia, 'must defer to tierTemplate.ts').toMatch(/tierTemplate/);
    expect(
      /free\s*\/\s*\$15/i.test(nadia),
      violation('REGISTRY', 'nadia still quotes the "Free / $15 / $30" ladder, which was never shipped. The ladder is Bronze/Silver/Gold/Platinum in tierTemplate.ts.', { file: '.claude/agents/retention/nadia.md' }),
    ).toBe(false);
  });
});
