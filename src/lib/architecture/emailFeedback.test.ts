/**
 * The email feedback loop must stay closed.
 *
 * Context: the post-signup lifecycle sequences emailed real artists for four and a half months and
 * left no record of it. The cron incremented a step counter and sent. There was no send ledger, no
 * identifying header, and therefore nothing the signed Resend webhook could attribute a delivery,
 * bounce, open or click to. The failure was silent by construction: every individual piece worked,
 * and the only symptom was that no question about those emails had an answer.
 *
 * These assertions pin the two halves that must agree. A send that sets no id header is
 * unattributable, and a webhook that reads an id nobody sets is dead code. Either half drifting
 * alone puts the system back where it started, which is why they are asserted together.
 */
import { describe, it, expect } from 'vitest';
import { readStripped, readOptional } from './sourceScan';
import { EXPECTED_MIGRATION_STATE } from './invariants';

const PLATFORM_CRON = 'src/app/api/cron/platform-sequences/route.ts';
const NURTURE_CRON = 'src/app/api/cron/prospect-nurture/route.ts';
const WEBHOOK = 'src/app/api/webhooks/resend/route.ts';
const MIGRATION = 'schema-phase2-platform-sequence-sends.sql';

/** Every marketing sender that keeps a ledger, and the header that ties a send to it. */
const ATTRIBUTED_SENDERS: ReadonlyArray<{ label: string; file: string; header: string; table: string }> = [
  {
    label: 'platform sequences (post-signup lifecycle)',
    file: PLATFORM_CRON,
    header: 'X-Platform-Send-Id',
    table: 'platform_sequence_sends',
  },
  {
    label: 'prospect nurture (pre-signup)',
    file: NURTURE_CRON,
    header: 'X-Prospect-Send-Id',
    table: 'prospect_nurture_sends',
  },
];

describe('email feedback loop', () => {
  describe.each(ATTRIBUTED_SENDERS)('$label', ({ file, header, table }) => {
    it('writes a ledger row, so a send leaves evidence behind', () => {
      const src = readStripped(file);
      expect(src, `${file} must insert into ${table}`).toContain(`.from('${table}')`);
      expect(src, `${file} must INSERT a send row, not only read one`).toMatch(
        new RegExp(`from\\('${table}'\\)\\s*\\.insert`),
      );
    });

    it('sends the ledger id as a header, so the webhook can attribute the outcome', () => {
      const src = readStripped(file);
      expect(src, `${file} must set ${header} on the send`).toContain(header);
    });

    it('is read back by the Resend webhook', () => {
      const hook = readStripped(WEBHOOK);
      expect(hook, `the webhook must extract ${header}`).toContain(header);
      expect(hook, `the webhook must write outcomes to ${table}`).toContain(`.from('${table}')`);
    });
  });

  it('records every outcome the webhook can observe, for both ledgers', () => {
    const hook = readStripped(WEBHOOK);
    // Delivery is not the interesting one. A bounce protects the sending domain, and an open or a
    // click is the only signal that says the email did anything at all.
    for (const event of ['email.bounced', 'email.delivered', 'email.opened', 'email.clicked']) {
      expect(hook, `the webhook must handle ${event}`).toContain(event);
    }

    // Asserted PER STATUS, per table, not as a count of references. An earlier version of this
    // test counted `.from(table)` occurrences and required more than two, which a mutation proved
    // worthless: deleting the whole `opened` branch left three references and the test still
    // passed. A ledger that never records an open answers no question worth asking, so each
    // status is now pinned to its own table individually.
    for (const { table } of ATTRIBUTED_SENDERS) {
      for (const status of ['bounced', 'delivered', 'opened', 'clicked']) {
        expect(
          hook,
          `the webhook must write status '${status}' to ${table}`,
        ).toMatch(new RegExp(`from\\('${table}'\\)[\\s\\S]{0,200}status: '${status}'`));
      }
      // The timestamp columns the admin reader computes open and click rates from.
      for (const column of ['opened_at', 'clicked_at']) {
        expect(
          hook,
          `the webhook must set ${column} on ${table}`,
        ).toMatch(new RegExp(`from\\('${table}'\\)[\\s\\S]{0,200}${column}:`));
      }
    }
  });

  it('fails soft before the migration runs, so a missing table cannot stop a live send', () => {
    const src = readStripped(PLATFORM_CRON);
    // 23505 is a unique violation, which is the ONLY error that means "already sent". Anything
    // else (42P01 above all) means the ledger is unavailable and the email must still go out.
    // Without this the cron would break every lifecycle email until the founder ran SQL.
    expect(src, 'the cron must treat only 23505 as already-sent').toContain('23505');
  });

  it('rolls the ledger row back when the send fails, so a retry is still possible', () => {
    const src = readStripped(PLATFORM_CRON);
    expect(src, 'a failed send must delete its ledger row').toMatch(
      new RegExp(`from\\('platform_sequence_sends'\\)[\\s\\S]{0,120}\\.delete\\(\\)`),
    );
  });

  it('registers the migration, so verify:migrations can tell applied from pending', () => {
    const row = EXPECTED_MIGRATION_STATE.find((m) => m.file === MIGRATION);
    expect(row, `${MIGRATION} must appear in EXPECTED_MIGRATION_STATE`).toBeDefined();

    const probe = readOptional('scripts/probe-migrations.mjs');
    expect(probe, 'the migration needs a live probe line').toContain(MIGRATION);
  });
});
