// Easing vocabulary for the deterministic motion system. Every curve maps t in
// [0,1] to progress in [0,1], monotonic, endpoints exact. The speed-ramp FEEL
// (fast punch then settle, micro-hold before reveal) comes from composing these,
// not from post-editing.

export const easings = {
  linear: (t) => t,
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeInCubic: (t) => t * t * t,
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  easeOutQuint: (t) => 1 - Math.pow(1 - t, 5),
  // Punch: covers ~90% of the distance in the first 30% of the time, then settles.
  punch: (t) => (t < 0.3 ? 0.9 * (1 - Math.pow(1 - t / 0.3, 3)) : 0.9 + 0.1 * ((t - 0.3) / 0.7)),
  // Micro-hold then accelerate: used going INTO a reveal.
  holdThenGo: (t) => (t < 0.18 ? 0 : easeInOutCubicRaw((t - 0.18) / 0.82)),
};

function easeInOutCubicRaw(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Motion type -> easing + zoom/pan behavior profile. */
export const MOTION_PROFILES = {
  PUSH: { easing: "easeInOutSine", zoomFrom: 1.0, zoomTo: 1.18 },
  PULL: { easing: "easeInOutSine", zoomFrom: 1.35, zoomTo: 1.0 },
  PAN: { easing: "easeInOutCubic", zoomFrom: 1.25, zoomTo: 1.25 },
  PUNCH: { easing: "punch", zoomFrom: 1.0, zoomTo: 2.0 },
  DRIFT: { easing: "linear", zoomFrom: 1.06, zoomTo: 1.12 },
  HOLD: { easing: "linear", zoomFrom: 1.0, zoomTo: 1.0 },
  REVEAL_CROP: { easing: "holdThenGo", zoomFrom: 1.6, zoomTo: 1.0 },
};

export function ease(name, t) {
  const fn = easings[name] || easings.linear;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return fn(t);
}
