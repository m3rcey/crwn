import { describe, it, expect } from 'vitest';
import { participantKey, mergedResults, perShowResults } from './publicParticipant';

const SECRET = 'test-service-role-key';
const OPTIONS = [
  { id: 'a', label: '"I Like" - Guy' },
  { id: 'b', label: '"Outstanding" - The GAP Band' },
];

describe('participantKey', () => {
  it('is stable for the same address, so one person cannot vote twice', () => {
    const a = participantKey('mary@example.com', SECRET);
    const b = participantKey('  MARY@Example.com ', SECRET);
    expect(a).toBe(b);
  });

  it('differs per address', () => {
    expect(participantKey('mary@example.com', SECRET))
      .not.toBe(participantKey('mary2@example.com', SECRET));
  });

  it('stores no readable address: the key is an opaque digest', () => {
    const key = participantKey('mary@example.com', SECRET)!;
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain('mary');
    expect(key).not.toContain('example');
  });

  it('is keyed, so the digest cannot be reproduced without the server secret', () => {
    expect(participantKey('mary@example.com', SECRET))
      .not.toBe(participantKey('mary@example.com', 'a-different-secret'));
  });

  it('fails closed with no secret or no address', () => {
    expect(participantKey('mary@example.com', undefined)).toBeNull();
    expect(participantKey('', SECRET)).toBeNull();
    expect(participantKey('   ', SECRET)).toBeNull();
  });
});

describe('mergedResults', () => {
  it('counts account votes and public votes as one tally', () => {
    const r = mergedResults(OPTIONS, [{ option_id: 'a' }], [{ option_id: 'a' }, { option_id: 'b' }]);
    expect(r.total).toBe(3);
    expect(r.options.find((o) => o.id === 'a')!.votes).toBe(2);
    expect(r.options.find((o) => o.id === 'b')!.votes).toBe(1);
  });

  it('percentages always sum to exactly 100 (no 54/47 on a phone)', () => {
    for (const [a, b] of [[1, 2], [2, 1], [7, 6], [1, 0], [0, 1], [5, 5], [33, 67], [1, 1]]) {
      const r = mergedResults(
        OPTIONS,
        Array.from({ length: a }, () => ({ option_id: 'a' })),
        Array.from({ length: b }, () => ({ option_id: 'b' })),
      );
      expect(r.options.reduce((s, o) => s + o.percent, 0), `${a} vs ${b}`).toBe(100);
    }
  });

  it('sums to 100 across three and four way ballots too', () => {
    const four = [
      { id: 'a', label: 'A' }, { id: 'b', label: 'B' },
      { id: 'c', label: 'C' }, { id: 'd', label: 'D' },
    ];
    const votes = [
      ...Array.from({ length: 1 }, () => ({ option_id: 'a' })),
      ...Array.from({ length: 1 }, () => ({ option_id: 'b' })),
      ...Array.from({ length: 1 }, () => ({ option_id: 'c' })),
    ];
    const r = mergedResults(four, votes, []);
    expect(r.options.reduce((s, o) => s + o.percent, 0)).toBe(100);
    expect(r.options.find((o) => o.id === 'd')!.percent).toBe(0);
  });

  it('an empty ballot is all zeroes, never a divide by zero', () => {
    const r = mergedResults(OPTIONS, [], []);
    expect(r.total).toBe(0);
    expect(r.options.every((o) => o.votes === 0 && o.percent === 0)).toBe(true);
  });

  it('ignores votes for options that are no longer on the ballot', () => {
    const r = mergedResults(OPTIONS, [{ option_id: 'zz' }], [{ option_id: 'a' }]);
    expect(r.total).toBe(1);
    expect(r.options.find((o) => o.id === 'a')!.percent).toBe(100);
  });

  it('keeps ballot order, so the screen matches the buttons the fan just tapped', () => {
    const r = mergedResults(OPTIONS, [{ option_id: 'b' }], []);
    expect(r.options.map((o) => o.id)).toEqual(['a', 'b']);
  });
});

describe("perShowResults (the artist live view)", () => {
  const show1 = {
    id: "s1", project_id: "night", stage_label: "Show 1", status: "open",
    options: OPTIONS, closes_at: "2026-09-27T00:00:00.000Z",
  };
  const show2 = {
    id: "s2", project_id: "night", stage_label: "Show 2", status: "open",
    options: [{ id: "a", label: "Bad Boy" }, { id: "b", label: "Never Too Much" }],
    opens_at: "2026-09-27T00:30:00.000Z", closes_at: "2026-09-27T03:00:00.000Z",
  };

  it("counts PUBLIC votes too, so the artist and the fan see the same room", () => {
    // The bug this exists to fix: the artist view read only account votes.
    const r = perShowResults(
      [show1],
      [{ decision_id: "s1", option_id: "a" }, { decision_id: "s1", option_id: "a" }],
      [{ decision_id: "s1", option_id: "b" }],
    );
    expect(r[0].votes).toBe(3);
    expect(r[0].options.find((o) => o.id === "a")).toMatchObject({ votes: 2, percent: 67 });
    expect(r[0].options.find((o) => o.id === "b")).toMatchObject({ votes: 1, percent: 33 });
  });

  it("matches the fan success screen exactly, because it IS the same merge", () => {
    const account = [{ option_id: "a" }, { option_id: "b" }, { option_id: "b" }];
    const pub = [{ option_id: "a" }];
    const fanScreen = mergedResults(OPTIONS, account, pub);
    const artistView = perShowResults(
      [show1],
      account.map((v) => ({ ...v, decision_id: "s1" })),
      pub.map((v) => ({ ...v, decision_id: "s1" })),
    )[0];
    expect(artistView.votes).toBe(fanScreen.total);
    expect(artistView.options).toEqual(fanScreen.options);
  });

  it("never lets a Show 1 vote leak into Show 2", () => {
    const r = perShowResults(
      [show1, show2],
      [{ decision_id: "s1", option_id: "a" }, { decision_id: "s1", option_id: "a" }],
      [{ decision_id: "s2", option_id: "b" }],
    );
    const s1 = r.find((x) => x.id === "s1")!;
    const s2 = r.find((x) => x.id === "s2")!;
    expect(s1.votes).toBe(2);
    expect(s2.votes).toBe(1);
    expect(s2.options.find((o) => o.id === "a")!.votes).toBe(0);
  });

  it("orders shows by scheduled close, so Show 1 reads before Show 2", () => {
    const r = perShowResults([show2, show1], [], []);
    expect(r.map((x) => x.stageLabel)).toEqual(["Show 1", "Show 2"]);
  });

  it("a show nobody has voted in is zeroes, never a divide by zero", () => {
    const r = perShowResults([show2], [], []);
    expect(r[0].votes).toBe(0);
    expect(r[0].options.every((o) => o.votes === 0 && o.percent === 0)).toBe(true);
  });

  it("percentages still sum to 100 per show", () => {
    const r = perShowResults(
      [show1],
      Array.from({ length: 7 }, () => ({ decision_id: "s1", option_id: "a" })),
      Array.from({ length: 6 }, () => ({ decision_id: "s1", option_id: "b" })),
    );
    expect(r[0].options.reduce((s, o) => s + o.percent, 0)).toBe(100);
  });

  it("reports what a show is ACTUALLY doing when given the clock, so 8:01 PM never says open", () => {
    // Show 1 is stored as open with an 8:00 PM ET close (00:00Z). At 8:01 PM ET it is closed.
    const at801 = new Date("2026-09-27T00:01:00.000Z");
    const r = perShowResults([show1, show2], [], [], at801);
    expect(r.find((x) => x.id === "s1")!.status).toBe("closed");
    // Show 2 opens 8:30 PM ET, so at 8:01 it is scheduled, not open.
    expect(r.find((x) => x.id === "s2")!.status).toBe("scheduled");
    // At 9:00 PM ET, Show 2 is open.
    const at900 = new Date("2026-09-27T01:00:00.000Z");
    expect(perShowResults([show2], [], [], at900)[0].status).toBe("open");
  });

  it("a hand-closed show stays closed whatever the clock says", () => {
    const r = perShowResults([{ ...show1, status: "closed" }], [], [], new Date("2026-09-26T20:00:00.000Z"));
    expect(r[0].status).toBe("closed");
  });

  it("without a clock it returns the stored status unchanged", () => {
    expect(perShowResults([show1], [], [])[0].status).toBe("open");
  });
});
