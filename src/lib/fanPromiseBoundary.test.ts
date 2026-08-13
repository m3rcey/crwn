import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isFanPromiseEvent, onlyFanPromises, summarizePromiseHealth } from './fulfillment';

// Z12: a promise is work the artist owes someone who PAID. A Revenue Ramp step is work they owe
// themselves. The two live in the same tables on purpose (the ramp puts dated work where the artist
// already looks) and must never be counted together.
//
// This was not theoretical. On production, 93 of 97 `fulfillment_events` rows were ramp steps, and
// the Constraint Engine's named "overdue promise to your supporters" was
// "Connect Stripe so fans can actually pay you". Because FULFILLMENT is evaluated first and
// outranks every growth stage, that single row could suppress REACH and FIRST_PAID indefinitely,
// which also gates the Virality Engine off.

const rampStep = (title: string, over = true) => ({
  title,
  status: 'pending',
  due_at: over ? '2026-01-01T00:00:00.000Z' : '2099-01-01T00:00:00.000Z',
  completed_at: null,
  metadata: { ramp_step_key: 'connect_stripe', ramp_phase: 'foundation' },
});

const fanPromise = (title: string, over = true) => ({
  title,
  status: 'pending',
  due_at: over ? '2026-01-01T00:00:00.000Z' : '2099-01-01T00:00:00.000Z',
  completed_at: null,
  metadata: { source: 'tier_benefit_sync' },
});

describe('a ramp step is not a promise to a fan', () => {
  it('recognises a ramp step by its own marker', () => {
    expect(isFanPromiseEvent(rampStep('Connect Stripe'))).toBe(false);
    expect(isFanPromiseEvent(fanPromise('Monthly Vault unlock'))).toBe(true);
  });

  it('treats a missing, null or empty marker as a real promise', () => {
    expect(isFanPromiseEvent({ metadata: null })).toBe(true);
    expect(isFanPromiseEvent({})).toBe(true);
    expect(isFanPromiseEvent({ metadata: {} })).toBe(true);
    expect(isFanPromiseEvent({ metadata: { ramp_step_key: '' } })).toBe(true);
    // Fails OPEN toward "this is a promise": a mislabelled row should be over-reported to the
    // artist rather than silently dropped from their obligations.
    expect(isFanPromiseEvent({ metadata: { ramp_step_key: 42 } })).toBe(true);
  });

  it('filters a mixed list down to fan promises only', () => {
    const mixed = [rampStep('Connect Stripe'), fanPromise('Monthly Vault unlock'), rampStep('Import contacts')];
    expect(onlyFanPromises(mixed).map((e) => e.title)).toEqual(['Monthly Vault unlock']);
  });

  it('changes the overdue count the engine acts on', () => {
    const now = new Date('2026-08-11T00:00:00.000Z');
    const mixed = [rampStep('a'), rampStep('b'), rampStep('c'), fanPromise('real')];
    const overdue = (rows: typeof mixed) =>
      rows.filter((e) => e.status === 'pending' && new Date(e.due_at) < now).length;
    expect(overdue(mixed)).toBe(4);
    expect(overdue(onlyFanPromises(mixed))).toBe(1);
  });

  it('does NOT filter inside summarizePromiseHealth, because the calendar shows ramp steps', () => {
    const now = new Date('2026-08-11T00:00:00.000Z');
    const justDue = '2026-08-10T00:00:00.000Z';
    const mixed = [
      { ...rampStep('a'), due_at: justDue },
      { ...fanPromise('real'), due_at: justDue },
    ];
    // Both are still counted when the caller passes everything: the filtering decision belongs to
    // the caller, so the Promise Calendar keeps rendering the artist's dated plan.
    expect(summarizePromiseHealth(mixed, now).overdueWithinGrace).toBe(2);
    expect(summarizePromiseHealth(onlyFanPromises(mixed), now).overdueWithinGrace).toBe(1);
  });
});

describe('every reader that means "owed to a fan" applies the boundary', () => {
  const read = (p: string) => readFileSync(p, 'utf8');

  it('the Constraint Engine assembler filters before diagnosing', () => {
    const src = read('src/lib/constraint/assembler.ts');
    expect(src).toContain('onlyFanPromises');
    // It must also SELECT the column the filter reads, or the filter is a no-op that passes.
    // `id` joined the list on 2026-08-13 so the corrective action can deep-link to the exact
    // overdue obligation; `metadata` is the one the boundary itself depends on.
    expect(src).toMatch(/select\('id, title, status, due_at, completed_at, metadata'\)/);
  });

  it('the Manager fulfillment insights filter before telling the artist fans are owed', () => {
    const src = read('src/lib/ai/fulfillmentInsights.ts');
    expect(src).toContain('onlyFanPromises');
    expect(src).toMatch(/select\('id, title, metadata'\)/);
  });

  it('the Roadmap promise steps exclude ramp rows on both tables', () => {
    const src = read('src/app/api/artist/roadmap/route.ts');
    expect(src).toContain('fanObligations');
    expect(src).toContain('fanPromiseEvents');
    expect(src).toContain("metadata->>ramp_step_key");
    // The OR form, not `.neq`: `benefit_type <> 'ramp_step'` is NULL for a NULL benefit_type and
    // would silently drop every obligation that has no benefit type.
    expect(src).toContain('benefit_type.is.null,benefit_type.neq.');
    expect(src).not.toMatch(/\.neq\('benefit_type'/);
  });

  it('the Promise Calendar itself is NOT filtered, so the artist keeps their dated plan', () => {
    const src = read('src/components/artist/PromiseCalendar.tsx');
    expect(src).not.toContain('onlyFanPromises');
  });
});
