// COMMS-002: taxonomy completeness for types that flow THROUGH the chokepoint.
// chokepoint.test.ts already covers direct inserts; this covers the other half:
// a type literal passed to createNotification in source must be classified, or
// it ships permanently ungoverned without anyone deciding that.
import { describe, it, expect } from 'vitest';
import { classifyNotification } from '../comms/taxonomy';
import { listSourceFiles, readStripped, violation } from './sourceScan';

describe('COMMS-002 — every source-defined notification type is classified', () => {
  it('all string-literal types passed to createNotification exist in NOTIFICATION_TAXONOMY', () => {
    const types = new Map<string, string>(); // type -> first file seen
    for (const f of listSourceFiles('src')) {
      const src = readStripped(f);
      if (!src.includes('createNotification(')) continue;
      for (const m of src.matchAll(/createNotification\(\s*[^,()]+,\s*[^,()]+,\s*'([a-z_]+)'/g)) {
        if (!types.has(m[1])) types.set(m[1], f);
      }
    }
    expect(types.size, 'the scan found no createNotification type literals at all — the call pattern changed and this test is examining nothing').toBeGreaterThan(3);

    const unclassified = [...types.entries()].filter(([t]) => classifyNotification(t) === null);
    expect(
      unclassified.map(([t, f]) => `'${t}' (first seen in ${f})`),
      violation(
        'COMMS-002',
        `source-defined notification type(s) missing from NOTIFICATION_TAXONOMY. Unknown types deliver ungoverned by design (fail-open), but a type written in source must be classified deliberately, not by omission. Add each to src/lib/comms/taxonomy.ts.`,
        { owner: 'src/lib/comms/taxonomy.ts', docs: 'docs/crwn-brain/02-FEATURE-MAP.md' },
      ),
    ).toEqual([]);
  });

  it("the canonical writer's own helper types are classified", () => {
    const src = readStripped('src/lib/notifications.ts');
    const HELPER_TYPES = [
      'new_subscriber',
      'new_purchase',
      'cashout',
      'subscription_canceled',
      'new_track',
      'new_post',
      'new_shop_item',
      'direct_message',
      'new_comment',
    ];
    for (const t of HELPER_TYPES) {
      expect(src.includes(`'${t}'`), `notifications.ts no longer defines helper type '${t}' — update this list if the helper was deliberately removed`).toBe(true);
      expect(classifyNotification(t), violation('COMMS-002', `helper type '${t}' lost its taxonomy classification`, { owner: 'src/lib/comms/taxonomy.ts' })).not.toBeNull();
    }
  });
});
