import { describe, it, expect } from "vitest";
import { pickTrack, recordUse, findTrackByName } from "./lib/music.mjs";
import { selectSegment, downbeatCandidates } from "./lib/audioAnalysis.mjs";

const lib = () => [
  { name: "p1.mp3", tier: "primary", path: "/m/primary/p1.mp3" },
  { name: "p2.mp3", tier: "primary", path: "/m/primary/p2.mp3" },
  { name: "s1.mp3", tier: "secondary", path: "/m/secondary/s1.mp3" },
  { name: "t1.wav", tier: "tertiary", path: "/m/tertiary/t1.wav" },
];

function seeded(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("pickTrack", () => {
  it("weighted rotation favors primary over many picks", () => {
    const counts = { primary: 0, secondary: 0, tertiary: 0 };
    let x = 42;
    const rand = () => {
      // deterministic LCG
      x = (x * 48271) % 2147483647;
      return x / 2147483647;
    };
    for (let i = 0; i < 400; i++) {
      const t = pickTrack(lib(), { recent: [], tracks: {} }, rand);
      counts[t.tier]++;
    }
    expect(counts.primary).toBeGreaterThan(counts.secondary);
    expect(counts.secondary).toBeGreaterThan(counts.tertiary);
  });

  it("never repeats the previous video's track when an alternative exists", () => {
    const state = { recent: ["/m/primary/p1.mp3"], tracks: {} };
    // rand 0 forces the primary tier and the first eligible track.
    const t = pickTrack(lib(), state, seeded([0, 0]));
    expect(t.path).not.toBe("/m/primary/p1.mp3");
  });

  it("avoids tracks used within the no-repeat window when alternatives exist", () => {
    const state = { recent: ["/m/primary/p2.mp3", "/m/secondary/s1.mp3", "/m/primary/p1.mp3"], tracks: {} };
    const t = pickTrack(lib(), state, seeded([0, 0]));
    // all primaries are in the window -> the primary tier has no eligible fresh track,
    // so the pick must not be the immediately-previous track.
    expect(t.path).not.toBe("/m/primary/p1.mp3");
  });

  it("favors underused tracks inside the tier", () => {
    const state = {
      recent: [],
      tracks: { "/m/primary/p1.mp3": { useCount: 50, lastUsed: "x", tier: "primary" } },
    };
    let p2 = 0;
    let x = 7;
    const rand = () => {
      x = (x * 48271) % 2147483647;
      return x / 2147483647;
    };
    for (let i = 0; i < 200; i++) {
      const t = pickTrack(lib(), state, rand);
      if (t.path === "/m/primary/p2.mp3") p2++;
    }
    expect(p2).toBeGreaterThan(60); // p2 dominates p1 despite equal tier
  });

  it("recordUse maintains the recent window and counts", () => {
    const state = { recent: [], tracks: {} };
    const t = lib()[0];
    recordUse(state, t);
    recordUse(state, t);
    expect(state.tracks[t.path].useCount).toBe(2);
    expect(state.recent[state.recent.length - 1]).toBe(t.path);
  });
});

describe("findTrackByName", () => {
  it("finds by partial name and errors on ambiguity", () => {
    expect(findTrackByName(lib(), "s1").path).toBe("/m/secondary/s1.mp3");
    expect(() => findTrackByName(lib(), "p")).toThrow(/matches/);
    expect(() => findTrackByName(lib(), "zzz")).toThrow(/no track/);
  });
});

describe("segment selection", () => {
  const analysis = {
    durationSec: 60,
    energyWindowSec: 0.5,
    // quiet first 20s (windows 0-39), loud 20-60 (windows 40-119)
    energyWindows: [...Array(40).fill(0.05), ...Array(80).fill(0.5)],
    beats: Array.from({ length: 120 }, (_, i) => i * 0.5),
    downbeats: Array.from({ length: 30 }, (_, i) => i * 2),
  };

  it("does not assume the video starts at second 0: picks the loud region on a downbeat", () => {
    const seg = selectSegment(analysis, 20);
    expect(seg.start).toBeGreaterThanOrEqual(18);
    expect(seg.start % 2).toBe(0); // on a downbeat
  });

  it("uses the full track when the video is longer than the track", () => {
    expect(selectSegment(analysis, 90).start).toBe(0);
  });

  it("downbeat candidates are every 4th beat", () => {
    const beats = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
    const energy = { windows: [1, 0, 0, 0, 0, 0, 0, 0], windowSec: 0.5 };
    const db = downbeatCandidates(beats, energy);
    expect(db).toEqual([0, 2]);
  });
});
