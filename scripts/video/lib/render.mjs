// Deterministic local renderer: timeline -> 1080x1920 H.264 MP4. Frames are
// composed with sharp (crop + resize inside each master) and piped raw into a
// single ffmpeg process together with the trimmed, loudness-normalized music.
// Marginal API cost: $0.00. Reproducible: same inputs, same video.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import sharp from "sharp";
import { RENDER, MUSIC } from "../config.mjs";
import { ease } from "./easing.mjs";

const require = createRequire(import.meta.url);

/** Load a master into a raw working buffer: 9:16 canvas at workingHeight, source
 * contained on pure white (white paper extends seamlessly, so a 3:4 end card pads
 * clean). Returns {data, width, height}. */
export async function loadWorkingImage(filePath) {
  const W = Math.round((RENDER.workingHeight * RENDER.width) / RENDER.height);
  const H = RENDER.workingHeight;
  const { data, info } = await sharp(filePath)
    .resize(W, H, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Camera state at t in [0,1] of a shot. */
export function cameraAt(shot, t) {
  const p = ease(shot.easing, t);
  return {
    cx: shot.from.cx + (shot.to.cx - shot.from.cx) * p,
    cy: shot.from.cy + (shot.to.cy - shot.from.cy) * p,
    zoom: shot.from.zoom + (shot.to.zoom - shot.from.zoom) * p,
  };
}

/** Extract the camera viewport from a working buffer and scale to output size. */
export async function renderFrame(img, cam) {
  const vpW = img.width / cam.zoom;
  const vpH = img.height / cam.zoom;
  let left = Math.round(cam.cx * img.width - vpW / 2);
  let top = Math.round(cam.cy * img.height - vpH / 2);
  const w = Math.max(2, Math.round(vpW));
  const h = Math.max(2, Math.round(vpH));
  left = Math.min(Math.max(0, left), img.width - w);
  top = Math.min(Math.max(0, top), img.height - h);
  return sharp(img.data, { raw: { width: img.width, height: img.height, channels: 3 } })
    .extract({ left, top, width: w, height: h })
    .resize(RENDER.width, RENDER.height, { kernel: "lanczos3" })
    .raw()
    .toBuffer();
}

/** Horizontal push composite for SWIPE/WHIP: `progress` 0->1 slides the new frame
 * in, pushing the old frame out in `direction`. Pure buffer arithmetic. */
export function slideComposite(oldFrame, newFrame, progress, direction = "left") {
  const W = RENDER.width;
  const H = RENDER.height;
  const out = Buffer.allocUnsafe(W * H * 3);
  const px = Math.round(progress * W);
  const rowBytes = W * 3;
  for (let y = 0; y < H; y++) {
    const row = y * rowBytes;
    if (direction === "right") {
      // old slides right, new enters from left
      if (px > 0) newFrame.copy(out, row, row + (W - px) * 3, row + rowBytes);
      if (px < W) oldFrame.copy(out, row + px * 3, row, row + (W - px) * 3);
    } else {
      // default: old slides left, new enters from right
      if (px < W) oldFrame.copy(out, row, row + px * 3, row + rowBytes);
      if (px > 0) newFrame.copy(out, row + (W - px) * 3, row, row + px * 3);
    }
  }
  return out;
}

function buildAudioFilter(durationSec) {
  const fadeOutStart = Math.max(0, durationSec - MUSIC.fadeOutSec);
  return (
    `loudnorm=I=${MUSIC.targetLufs}:TP=-1.5:LRA=11,` +
    `afade=t=in:st=0:d=${MUSIC.fadeInSec},` +
    `afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${MUSIC.fadeOutSec}`
  );
}

/**
 * Render the timeline to an MP4.
 * @param {{shots: any[], totalDurationSec: number}} timeline
 * @param {{ trackPath: string, segmentStart: number }} music
 * @param {string} outPath
 * @param {{ onProgress?: (frame:number, total:number) => void }} opts
 */
export async function renderVideo(timeline, music, outPath, opts = {}) {
  const fps = RENDER.fps;
  const totalFrames = Math.round(timeline.totalDurationSec * fps);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  // Preload each distinct image once.
  const imageCache = new Map();
  for (const shot of timeline.shots) {
    if (!imageCache.has(shot.imageFile)) {
      imageCache.set(shot.imageFile, await loadWorkingImage(shot.imageFile));
    }
  }

  const ffmpeg = require("ffmpeg-static");
  const args = [
    "-y",
    "-f", "rawvideo",
    "-pix_fmt", "rgb24",
    "-s", `${RENDER.width}x${RENDER.height}`,
    "-r", String(fps),
    "-i", "pipe:0",
    "-ss", String(music.segmentStart || 0),
    "-t", timeline.totalDurationSec.toFixed(3),
    "-i", music.trackPath,
    "-filter_complex", `[1:a]${buildAudioFilter(timeline.totalDurationSec)}[a]`,
    "-map", "0:v",
    "-map", "[a]",
    "-c:v", "libx264",
    "-crf", String(RENDER.crf),
    "-preset", RENDER.preset,
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    outPath,
  ];
  const proc = spawn(ffmpeg, args, { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (d) => {
    stderr += d.toString();
    if (stderr.length > 20000) stderr = stderr.slice(-10000);
  });
  const done = new Promise((resolve, reject) => {
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-2000)}`))
    );
    proc.on("error", reject);
  });

  const writeFrame = (buf) =>
    new Promise((resolve, reject) => {
      proc.stdin.write(buf, (err) => (err ? reject(err) : resolve()));
    });

  // Frame loop with transition compositing.
  for (let f = 0; f < totalFrames; f++) {
    const t = f / fps;
    const idx = shotIndexAt(timeline.shots, t);
    const shot = timeline.shots[idx];
    const local = Math.min(1, Math.max(0, (t - shot.startSec) / shot.durationSec));
    let frame = await renderFrame(imageCache.get(shot.imageFile), cameraAt(shot, local));

    // SWIPE/WHIP entry: composite the previous shot's final frame sliding out.
    if (idx > 0 && shot.transition !== "CUT") {
      const dur = shot.transition === "WHIP" ? RENDER.whipDurationSec : RENDER.swipeDurationSec;
      const since = t - shot.startSec;
      if (since < dur) {
        const prev = timeline.shots[idx - 1];
        const prevFrame = await renderFrame(imageCache.get(prev.imageFile), cameraAt(prev, 1));
        const progress = ease(shot.transition === "WHIP" ? "easeOutQuint" : "easeInOutCubic", since / dur);
        frame = slideComposite(prevFrame, frame, progress, shot.transitionDirection);
      }
    }

    await writeFrame(frame);
    if (opts.onProgress && f % 60 === 0) opts.onProgress(f, totalFrames);
  }
  proc.stdin.end();
  await done;
  return { outPath, totalFrames, durationSec: timeline.totalDurationSec };
}

export function shotIndexAt(shots, t) {
  for (let i = shots.length - 1; i >= 0; i--) {
    if (t >= shots[i].startSec - 1e-6) return i;
  }
  return 0;
}
