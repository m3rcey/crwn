// REACH-001/002/003/005: feature reachability + cron schedule discipline +
// educational truth on architecture-sensitive tours.
//
// The FEATURES registry is the STATIC contract (what code must exist); it never
// asserts a production flag VALUE — that belongs to read-only probes.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { FEATURES } from './invariants';
import { UNSCHEDULED_CRON_EXCEPTIONS } from './exceptions';
import { existsSync, readStripped, violation } from './sourceScan';

describe('REACH-001 — every registered feature keeps its gate and delivery surface', () => {
  it.each(FEATURES.map(f => [f.key, f] as const))('%s', (_key, feature) => {
    if (feature.gateModule) {
      expect(existsSync(feature.gateModule), violation('REACH-001', `${feature.key}: gate module ${feature.gateModule} is gone`, { docs: 'docs/crwn-brain/13-CURRENT-STATE.md' })).toBe(true);
      if (feature.flag) {
        expect(
          readStripped(feature.gateModule).includes(feature.flag),
          violation('REACH-001', `${feature.key}: ${feature.gateModule} no longer reads the '${feature.flag}' flag — the feature is either ungated or gated elsewhere; update the registry to match reality`, { file: feature.gateModule }),
        ).toBe(true);
      }
    }
    for (const s of feature.surfaces) {
      expect(existsSync(s.file), violation('REACH-001', `${feature.key}: delivery surface ${s.file} is gone — a correct feature nobody can reach is dark by accident (the F-05 class)`, { file: s.file })).toBe(true);
      expect(
        readStripped(s.file).includes(s.mustContain),
        violation('REACH-001', `${feature.key}: ${s.file} no longer contains ${JSON.stringify(s.mustContain)} — its delivery surface was disconnected`, { file: s.file }),
      ).toBe(true);
    }
    if (feature.migration) {
      expect(
        existsSync(`supabase/${feature.migration}`),
        violation('REACH-001', `${feature.key}: migration file supabase/${feature.migration} is gone`),
      ).toBe(true);
    }
  });
});

describe('REACH-002 — announcement flags are announceable', () => {
  it("every flag-gated pop-up's flag is in ANNOUNCEABLE_FLAGS, or its gate reads false forever", () => {
    const registry = readStripped('src/lib/popups/registry.ts');
    const route = readStripped('src/app/api/popups/route.ts');
    // Pop-up gating is written as audience closures reading c.featureFlags.<flag>.
    const flags = new Set([...registry.matchAll(/featureFlags\.([a-z_]+)/g)].map(m => m[1]));
    expect(flags.size, 'no featureFlags found in the pop-up registry — the field was renamed and this scan is examining nothing').toBeGreaterThan(0);
    for (const flag of flags) {
      expect(
        new RegExp(`ANNOUNCEABLE_FLAGS[^\\]]*'${flag}'`).test(route),
        violation('REACH-002', `pop-up flag '${flag}' is missing from ANNOUNCEABLE_FLAGS in src/app/api/popups/route.ts — its gate reads false forever and the pop-up can never fire`, {
          file: 'src/app/api/popups/route.ts',
          docs: 'docs/crwn-brain/02-FEATURE-MAP.md',
        }),
      ).toBe(true);
    }
  });
});

describe('REACH-003 — cron schedule discipline', () => {
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
    crons?: Array<{ path: string; schedule: string }>;
  };
  const crons = vercel.crons ?? [];

  it('every cron route on disk is scheduled (except registered manual-trigger exceptions)', () => {
    const scheduled = new Set(crons.map(c => c.path));
    const excepted = new Set(
      UNSCHEDULED_CRON_EXCEPTIONS.map(e => e.subject.replace('src/app', '').replace('/route.ts', '')),
    );
    const onDisk = readdirSync('src/app/api/cron', { withFileTypes: true })
      .filter(d => d.isDirectory() && existsSync(`src/app/api/cron/${d.name}/route.ts`))
      .map(d => `/api/cron/${d.name}`);
    expect(onDisk.length, 'the cron directory scan found nothing — layout changed').toBeGreaterThan(15);
    const unscheduled = onDisk.filter(p => !scheduled.has(p) && !excepted.has(p));
    expect(
      unscheduled,
      violation('REACH-003', `cron route(s) exist but are not scheduled in vercel.json: ${unscheduled.join(', ')}. A route that exists but never runs is the dead-cron class; schedule it or register a manual-trigger exception.`, {
        file: 'vercel.json',
      }),
    ).toEqual([]);
  });

  it('no schedule runs more than once per day (Vercel Hobby blocks ALL deployments otherwise)', () => {
    for (const c of crons) {
      const [minute, hour] = c.schedule.trim().split(/\s+/);
      const fixed = (v: string) => /^\d+$/.test(v);
      expect(
        fixed(minute) && fixed(hour),
        violation('REACH-003', `${c.path} schedule "${c.schedule}" can fire more than once per day (minute and hour must be fixed integers). More-frequent-than-daily crons BLOCK ALL Vercel deployments on the Hobby plan.`, {
          file: 'vercel.json',
          docs: 'CLAUDE.md (Vercel Hobby Plan Limits)',
        }),
      ).toBe(true);
    }
  });

  it('stale unscheduled-cron exceptions are detected', () => {
    for (const e of UNSCHEDULED_CRON_EXCEPTIONS) {
      expect(existsSync(e.subject), `${e.subject} is excepted but no longer exists — remove the exception`).toBe(true);
      const asPath = e.subject.replace('src/app', '').replace('/route.ts', '');
      expect(
        crons.some(c => c.path === asPath),
        `${e.subject} is excepted as manual-trigger-only but IS scheduled — remove the stale exception`,
      ).toBe(false);
    }
  });
});

describe('REACH-005 — tours teach the real architecture boundary', () => {
  // Each pin is the sentence that carries the boundary concept. Changing the
  // copy is fine; changing it to claim the OPPOSITE architecture is not —
  // update the tour and this pin together with the underlying invariant.
  const PINS: Array<[string, string, string]> = [
    ['src/lib/managerTourSteps.ts', 'not a second opinion', 'PRIORITY-005: Manager explains priority, never owns it'],
    ['src/lib/promiseCalendarTourSteps.ts', 'Only promises to paying fans', 'PROMISE-001: the calendar holds fan promises only'],
    ['src/lib/teamSplitsTourSteps.ts', 'Stripe still pays you on its own schedule', 'MONEY-007/MONEY-001: splits allocate; they are not a payout rail'],
    ['src/lib/fanDrivesTourSteps.ts', 'recognition, not cash', 'MONEY-006: Fan Drives V1 is non-cash and canonical-rail-derived'],
  ];

  it.each(PINS)('%s keeps its boundary sentence', (file, phrase, concept) => {
    expect(existsSync(file), `${file} is gone — if the tour moved, update this pin`).toBe(true);
    expect(
      readStripped(file).includes(phrase),
      violation('REACH-005', `${file} lost the boundary teaching "${phrase}" (${concept}). Tour copy is product behavior: if the architecture deliberately changed, update the invariant, the tour, and this pin together.`, { file }),
    ).toBe(true);
  });
});
