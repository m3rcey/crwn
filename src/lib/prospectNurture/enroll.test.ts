// Gate tests for enroll/exit. A tiny hand-rolled Supabase mock exercises the decision logic
// (consent, suppression, dedup, exit-on-account) without a real database.

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { enrollProspect, exitProspectNurtureForUser } from './enroll';

interface Cfg {
  suppressed?: boolean;
  existingActive?: { id: string } | null;
  insertResult?: { data: { id: string } | null; error: unknown };
  convertedLeads?: { email: string }[];
  canceledRows?: { id: string }[];
}

function makeAdmin(cfg: Cfg) {
  const calls: { table: string; op: string; row?: unknown }[] = [];
  function make(table: string) {
    let inserted = false;
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      ilike: () => b,
      in: () => b,
      is: () => b,
      not: () => b,
      update: (row: unknown) => {
        calls.push({ table, op: 'update', row });
        return b;
      },
      insert: (row: unknown) => {
        inserted = true;
        calls.push({ table, op: 'insert', row });
        return b;
      },
      maybeSingle: async () => {
        if (table === 'email_suppressions') return { data: cfg.suppressed ? { email: 'x' } : null };
        if (table === 'prospect_nurture_enrollments') return { data: cfg.existingActive ?? null };
        return { data: null };
      },
      single: async () => {
        if (table === 'prospect_nurture_enrollments' && inserted) {
          return cfg.insertResult ?? { data: { id: 'new-id' }, error: null };
        }
        return { data: null, error: null };
      },
      // Awaited builder (update chains, select-lists).
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        let result: unknown = { data: null, error: null };
        if (table === 'lead_magnet_leads') result = { data: cfg.convertedLeads ?? [] };
        if (table === 'prospect_nurture_enrollments' && cfg.canceledRows) result = { data: cfg.canceledRows };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return b;
  }
  return { admin: { from: make } as unknown as SupabaseClient, calls };
}

describe('enrollProspect gates', () => {
  it('refuses without marketing consent and touches no table', async () => {
    const { admin, calls } = makeAdmin({});
    const out = await enrollProspect(admin, { leadId: 'l1', email: 'a@b.com', toolSlug: 'vault-revenue-planner', resultId: 'r1', emailConsent: false });
    expect(out).toEqual({ enrolled: false, reason: 'no_consent' });
    expect(calls.length).toBe(0);
  });

  it('refuses a globally suppressed address', async () => {
    const { admin } = makeAdmin({ suppressed: true });
    const out = await enrollProspect(admin, { leadId: 'l1', email: 'a@b.com', toolSlug: 'vault-revenue-planner', resultId: 'r1', emailConsent: true });
    expect(out).toEqual({ enrolled: false, reason: 'suppressed' });
  });

  it('creates an enrollment with a scheduled first send when none is active', async () => {
    const { admin, calls } = makeAdmin({ suppressed: false, existingActive: null, insertResult: { data: { id: 'e1' }, error: null } });
    const out = await enrollProspect(admin, { leadId: 'l1', email: 'A@B.com', toolSlug: 'vault-revenue-planner', resultId: 'r1', emailConsent: true });
    expect(out).toEqual({ enrolled: true, action: 'created', enrollmentId: 'e1' });
    const insert = calls.find((c) => c.table === 'prospect_nurture_enrollments' && c.op === 'insert');
    expect(insert).toBeTruthy();
    const row = insert!.row as Record<string, unknown>;
    expect(row.email).toBe('a@b.com'); // normalized
    expect(row.next_send_at).toBeTruthy();
    expect(row.unsub_token).toBeTruthy();
  });

  it('refreshes an existing active enrollment instead of creating a duplicate', async () => {
    const { admin, calls } = makeAdmin({ existingActive: { id: 'e0' } });
    const out = await enrollProspect(admin, { leadId: 'l2', email: 'a@b.com', toolSlug: 'share-to-earn-planner', resultId: 'r9', emailConsent: true });
    expect(out).toEqual({ enrolled: true, action: 'refreshed', enrollmentId: 'e0' });
    const update = calls.find((c) => c.table === 'prospect_nurture_enrollments' && c.op === 'update');
    expect((update!.row as Record<string, unknown>).tool_slug).toBe('share-to-earn-planner');
    expect(calls.some((c) => c.op === 'insert' && c.table === 'prospect_nurture_enrollments')).toBe(false);
  });
});

describe('exitProspectNurtureForUser', () => {
  it('cancels active enrollments for the verified email on account creation', async () => {
    const { admin, calls } = makeAdmin({ canceledRows: [{ id: 'e1' }] });
    const out = await exitProspectNurtureForUser(admin, { userId: 'u1', email: 'a@b.com' });
    expect(out.exited).toBe(1);
    const update = calls.find((c) => c.table === 'prospect_nurture_enrollments' && c.op === 'update');
    expect((update!.row as Record<string, unknown>).exit_reason).toBe('account_created');
  });

  it('does nothing when there is no email and no converted lead', async () => {
    const { admin, calls } = makeAdmin({ convertedLeads: [] });
    const out = await exitProspectNurtureForUser(admin, { userId: 'u1', email: null });
    expect(out.exited).toBe(0);
    expect(calls.some((c) => c.op === 'update')).toBe(false);
  });
});
