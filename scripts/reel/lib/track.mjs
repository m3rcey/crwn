// Where the speaker is in a LANDSCAPE source, so a 9:16 crop can follow him instead of
// sitting at a fixed centre. No tracking dependency: the founder films against a plain
// light wall, so the speaker is the dark mass (hair, shirt) in front of it. Columns that
// stay dark in almost every frame are a static occluder (the monitor edge in his setup)
// and are ignored. Confidence is reported, and a low-confidence sample is dropped rather
// than trusted: a crop that jumps to a wrong guess is worse than one that holds still.

import { execFileSync } from "node:child_process";

const W = 480, H = 270;

export function sampleGray(file, fps = 2) {
  const buf = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-vf", `fps=${fps},scale=${W}:${H},format=gray`, "-f", "rawvideo", "-"], { maxBuffer: 1 << 30 });
  const n = Math.floor(buf.length / (W * H));
  const frames = [];
  for (let i = 0; i < n; i++) frames.push(buf.subarray(i * W * H, (i + 1) * W * H));
  return { frames, fps };
}

/** Pure: frames (W*H gray) -> per-sample subject position in SOURCE pixels. */
export function locate(frames, { fps, srcW, srcH }) {
  // Static occluder: columns that are well below the wall's brightness in the top of
  // the frame (where the speaker's head never reaches) in >= 90% of frames. A monitor
  // edge is dark but not black, so it is judged against the wall, not an absolute level.
  const topRows = Math.floor(H * 0.22);
  const tops = [];
  for (const f of frames) for (let y = 0; y < topRows; y += 6) for (let x = 0; x < W; x += 6) tops.push(f[y * W + x]);
  tops.sort((a, b) => a - b);
  const wallAll = tops[Math.floor(tops.length * 0.75)] || 200;
  const colDark = new Float32Array(W);
  for (const f of frames) for (let x = 0; x < W; x++) {
    let s = 0;
    for (let y = 0; y < topRows; y += 2) s += f[y * W + x];
    if (s / Math.ceil(topRows / 2) < wallAll * 0.62) colDark[x]++;
  }
  const occluded = new Uint8Array(W);
  for (let x = 0; x < W; x++) occluded[x] = colDark[x] / frames.length >= 0.9 ? 1 : 0;

  const out = [];
  frames.forEach((f, i) => {
    // Wall brightness: median of the upper third of unoccluded columns.
    const vals = [];
    for (let y = 0; y < H / 3; y += 4) for (let x = 0; x < W; x += 4) if (!occluded[x]) vals.push(f[y * W + x]);
    vals.sort((a, b) => a - b);
    const wall = vals[Math.floor(vals.length / 2)] || 200;
    const thr = wall * 0.45;
    // Head top: first row with a dark run of >= 12px in unoccluded columns.
    let top = -1;
    for (let y = 4; y < H * 0.7 && top < 0; y++) {
      let run = 0;
      for (let x = 0; x < W; x++) {
        if (!occluded[x] && f[y * W + x] < thr) { run++; if (run >= 12) { top = y; break; } } else run = 0;
      }
    }
    if (top < 0) { out.push({ t: i / fps, conf: 0 }); return; }
    // Head centroid in the band just under the top.
    let sx = 0, n = 0;
    const band = Math.round(H * 0.28);
    for (let y = top; y < Math.min(H, top + band); y++) for (let x = 0; x < W; x++) if (!occluded[x] && f[y * W + x] < thr) { sx += x; n++; }
    const area = n / (band * W);
    const conf = n > 200 && area < 0.45 ? 1 : 0;
    out.push({ t: +(i / fps).toFixed(3), x: Math.round((sx / Math.max(1, n)) * (srcW / W)), headTop: Math.round(top * (srcH / H)), eyeY: Math.round((top + H * 0.12) * (srcH / H)), conf });
  });
  const occl = [];
  for (let x = 0; x < W; x++) if (occluded[x]) occl.push(x);
  const occluder = occl.length ? { from: Math.round(occl[0] * (srcW / W)), to: Math.round((occl[occl.length - 1] + 1) * (srcW / W)) } : null;
  return { samples: out, occluder };
}

export function trackSubject(file, info, fps = 2) {
  const { frames } = sampleGray(file, fps);
  return { fps, srcW: info.width, srcH: info.height, ...locate(frames, { fps, srcW: info.width, srcH: info.height }) };
}

/** Median subject position over a source-time window (confident samples only). */
export function subjectIn(track, t0, t1) {
  const s = track.samples.filter((p) => p.conf && p.t >= t0 - 0.25 && p.t <= t1 + 0.25);
  if (!s.length) return null;
  const med = (a) => { const v = [...a].sort((p, q) => p - q); return v[Math.floor(v.length / 2)]; };
  return { x: med(s.map((p) => p.x)), eyeY: med(s.map((p) => p.eyeY)), headTop: med(s.map((p) => p.headTop)), n: s.length };
}
