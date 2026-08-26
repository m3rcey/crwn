// Central configuration for the CRWN silent short-form video pipeline.
// Everything tunable lives here: paths, models, prices, caps, music weights, pacing.
// Nothing else in the pipeline hardcodes a model id, a price, or a cap.

import path from "node:path";

export const REPO_ROOT = "/home/merce/workspace-crwn";

export const PATHS = {
  scriptsDir: path.join(REPO_ROOT, "videos/scripts/fan-economy"),
  outputBase: path.join(REPO_ROOT, "videos/output"),
  musicDir: path.join(REPO_ROOT, "videos/music"),
  // Same reference set the proven still-image generator uses.
  refsDir: "/mnt/c/Users/Josh/Desktop/nano banana references",
  // Existing founder asset: hand-drawn sharpie crown + "128" on white. Used as the
  // zero-cost end-card scene, per the scripts' "128 👑 (visual end-card)" convention.
  endCardImage: "/mnt/c/Users/Josh/Desktop/nano banana references/128-end-card.jpg",
  musicAnalysisCache: path.join(REPO_ROOT, "videos/music/.analysis-cache.json"),
  musicUsageState: path.join(REPO_ROOT, "videos/output/.music-usage.json"),
};

// The four style reference PNGs that defined the accepted Fan Economy look.
export const STYLE_REFS = [
  "openart-image_1775581308623_d7e64984_1775581308661_33c1d1ba.png",
  "openart-image_1775598089791_eaae2824_1775598089858_cade8739.png",
  "openart-image_1775598227341_c79110c0_1775598227430_39e71232.png",
  "openart-image_1775598237169_2475a432_1775598237207_c74fc3ec.png",
];

// Model roles. ECONOMY is the GA version of the exact model that generated the accepted
// Fan Economy reference set (gemini-3.1-flash-image-preview); QUALITY is Nano Banana Pro.
// Attempt 3 of a failing scene escalates ECONOMY -> QUALITY (cost-per-ACCEPTED-image logic).
export const MODELS = {
  storyboard: "gemini-3.5-flash",
  imageEconomy: "gemini-3.1-flash-image",
  imageQuality: "gemini-3-pro-image",
  qcVision: "gemini-3.5-flash",
};

// USD prices, verified against ai.google.dev/gemini-api/docs/pricing on 2026-08-26.
// `perImage` maps imageSize -> flat per-image output cost. Token rates cover the text
// portions. If a model is missing here the ledger records tokens and usd=null; it never
// invents a price.
export const PRICES = {
  "gemini-3.5-flash": { inPerM: 1.5, outPerM: 9.0 },
  "gemini-3.1-flash-image": {
    inPerM: 0.5,
    perImage: { "1K": 0.067, "2K": 0.101, "4K": 0.151 },
  },
  "gemini-3-pro-image": {
    inPerM: 2.0,
    perImage: { "1K": 0.134, "2K": 0.134, "4K": 0.24 },
  },
};

// Hard caps. Crossing any of these stops the job loudly instead of spending silently.
export const CAPS = {
  maxMasterImages: 10,
  minMasterImages: 5,
  defaultMasterImages: 8,
  maxAttemptsPerScene: 3, // 1 initial + 2 retries
  maxTotalImageAttempts: 24,
  maxStoryboardAttempts: 3,
  maxQcCallsPerImage: 1, // one vision QC per attempt; a QC infra failure never burns a retry
  maxVideoDurationSec: 75,
  maxJobSpendUsd: 3.5,
  // Planning assumption until real telemetry replaces it (observed multiplier is
  // reported in every ledger).
  expectedAttemptsPerAcceptedImage: 1.4,
};

// Music preference tiers. Weighted rotation, centrally configurable.
export const MUSIC = {
  tierWeights: { primary: 0.6, secondary: 0.25, tertiary: 0.15 },
  // Repetition rules: never same track twice in a row; not twice within the
  // previous N videos when alternatives exist.
  noRepeatWindow: 3,
  analysisSampleRate: 22050, // mono decode rate for BPM analysis
  targetLufs: -14,
  fadeInSec: 0.15,
  fadeOutSec: 0.8,
};

export const RENDER = {
  width: 1080,
  height: 1920,
  fps: 30,
  crf: 18,
  preset: "medium",
  // Masters are ~2160x3840 (9:16 at 4K). 2.4x zoom keeps punch-ins above ~900px of
  // source width for a 1080px output; sharpie strokes tolerate that.
  maxZoom: 2.4,
  // Working buffer height: masters are pre-resized to this height once per scene so
  // per-frame crops are cheap. 2x output height keeps zooms sharp.
  workingHeight: 3840,
  beatSnapToleranceSec: 0.45,
  swipeDurationSec: 0.28,
  whipDurationSec: 0.15,
  endCardSec: 1.6,
};

// Image generation config for the masters.
export const IMAGE = {
  aspectRatio: "9:16",
  imageSize: "4K",
  // Fallbacks if the model rejects the primary combination.
  fallbacks: [
    { aspectRatio: "9:16", imageSize: "2K" },
    { aspectRatio: "3:4", imageSize: "4K" },
  ],
  delayBetweenCallsMs: 4000,
  // QC input is downscaled to this height before the vision call: sharpie caps stay
  // readable and the call costs a fraction of a 4K input.
  qcInputHeight: 1536,
};

// Reading-speed model for the text-density validator: silent-video viewers read
// hand-lettered caps at roughly 3 words/sec, plus fixed orientation overhead per scene.
export const READING = {
  wordsPerSec: 3.0,
  sceneOverheadSec: 0.8,
  comfortMultiplier: 1.15, // scene must give at least readTime * this
};

// Role-based duration bounds (seconds). Content and reading load pick the value
// inside the band; the band prevents robotic uniform pacing.
export const ROLE_DURATION = {
  HOOK: { min: 2.2, max: 3.4 },
  CONTEXT: { min: 2.0, max: 4.0 },
  BUILD: { min: 2.2, max: 4.5 },
  CONTRAST_OR_ESCALATION: { min: 2.0, max: 4.0 },
  TENSION: { min: 1.2, max: 2.4 },
  CRWN_BRIDGE: { min: 2.6, max: 4.5 },
  REVEAL: { min: 2.8, max: 4.5 },
  PAYOFF: { min: 2.4, max: 4.2 },
  IMPLICATION: { min: 2.2, max: 4.0 },
  CTA: { min: 3.0, max: 4.5 },
};

export const MOTIONS = ["PUSH", "PULL", "PAN", "PUNCH", "DRIFT", "HOLD", "REVEAL_CROP"];
export const TRANSITIONS = ["CUT", "SWIPE", "WHIP"];
export const STORY_ROLES = Object.keys(ROLE_DURATION);
