// Shared test fixture: a minimal valid storyboard in the shape the generator
// produces. Tests mutate copies of this to prove each validator actually bites.

export function fixtureStoryboard() {
  return {
    slug: "34-ryan-leslie-forty-thousand-numbers",
    title: "Ryan Leslie: forty thousand numbers",
    family: "I/Evidence",
    condensedStory:
      "Ryan Leslie collected 40,000 fan phone numbers and sold to 15,000 of them. The total is withheld until the reveal: over $2,000,000.",
    ctaKeyword: "OWN",
    withheldInformation: ["$2,000,000"],
    revealText: ["OVER $2,000,000"],
    shareTrigger: "a follower-count belief reversed with one number",
    saveTrigger: "the $133 per reachable fan benchmark",
    scenes: [
      scene(0, ["HOOK"], ["WHAT DID 15,000 PHONE NUMBERS PAY?"], {
        elements: [
          el("HOOK_TEXT", "headline", "WHAT DID 15,000 PHONE NUMBERS PAY?", { x: 0.05, y: 0.04, w: 0.9, h: 0.18 }),
          el("PORTRAIT", "Ryan Leslie holding phone", null, { x: 0.15, y: 0.3, w: 0.6, h: 0.5 }),
        ],
        shots: [
          { motion: "HOLD", focalElement: "HOOK_TEXT" },
          { motion: "PUSH", focalElement: "PORTRAIT" },
        ],
        people: ["ryan-leslie"],
      }),
      scene(1, ["CONTEXT", "BUILD"], ["40,000 NUMBERS", "HE TEXTS THEM"], {
        elements: [
          el("NOTE_NUMBERS", "boxed note", "40,000 NUMBERS", { x: 0.08, y: 0.62, w: 0.4, h: 0.08 }),
          el("CROWD", "crowd of stick figures", null, { x: 0.55, y: 0.35, w: 0.4, h: 0.45 }),
        ],
        shots: [
          { motion: "PAN", focalElement: "CROWD" },
          { motion: "PUNCH", focalElement: "NOTE_NUMBERS", beatSync: true },
        ],
      }),
      scene(2, ["CONTRAST_OR_ESCALATION"], ["15,000 BOUGHT"], {
        elements: [el("NOTE_BOUGHT", "boxed note", "15,000 BOUGHT", { x: 0.3, y: 0.45, w: 0.4, h: 0.1 })],
        shots: [{ motion: "PUNCH", focalElement: "NOTE_BOUGHT", beatSync: true }, { motion: "DRIFT" }],
      }),
      scene(3, ["TENSION"], ["GUESS WHAT THEY SPENT"], {
        elements: [el("TENSION_TEXT", "question", "GUESS WHAT THEY SPENT", { x: 0.1, y: 0.4, w: 0.8, h: 0.14 })],
        shots: [{ motion: "PUSH", focalElement: "TENSION_TEXT" }],
      }),
      scene(4, ["CRWN_BRIDGE"], ["A FOLLOWER IS RENTED.", "A NUMBER IS OWNED."], {
        elements: [
          el("BRIDGE_TOP", "tagline", "A FOLLOWER IS RENTED.", { x: 0.1, y: 0.3, w: 0.8, h: 0.1 }),
          el("BRIDGE_BOTTOM", "tagline", "A NUMBER IS OWNED.", { x: 0.1, y: 0.55, w: 0.8, h: 0.1 }),
        ],
        shots: [
          { motion: "HOLD", focalElement: "BRIDGE_TOP", transition: "SWIPE", transitionDirection: "left" },
          { motion: "PAN", focalElement: "BRIDGE_BOTTOM" },
        ],
      }),
      scene(5, ["REVEAL", "PAYOFF"], ["OVER $2,000,000"], {
        elements: [el("REVEAL_NUM", "giant number", "OVER $2,000,000", { x: 0.08, y: 0.35, w: 0.84, h: 0.22 })],
        shots: [
          { motion: "REVEAL_CROP", focalElement: "REVEAL_NUM", beatSync: true },
          { motion: "HOLD", focalElement: "REVEAL_NUM" },
        ],
      }),
      scene(6, ["IMPLICATION"], ["$133 A PERSON", "STREAMING PAYS $150 TOTAL"], {
        elements: [
          el("PER_PERSON", "comparison", "$133 A PERSON", { x: 0.1, y: 0.25, w: 0.8, h: 0.12 }),
          el("STREAM_NOTE", "comparison", "STREAMING PAYS $150 TOTAL", { x: 0.1, y: 0.55, w: 0.8, h: 0.12 }),
        ],
        shots: [{ motion: "PULL" }, { motion: "PUNCH", focalElement: "PER_PERSON" }],
      }),
      scene(7, ["CTA"], ['COMMENT "OWN"', "FREE OWN YOUR FANS CALCULATOR"], {
        elements: [
          el("CTA_KEYWORD", "keyword", 'COMMENT "OWN"', { x: 0.1, y: 0.35, w: 0.8, h: 0.15 }),
          el("CTA_SUB", "subline", "FREE OWN YOUR FANS CALCULATOR", { x: 0.1, y: 0.55, w: 0.8, h: 0.08 }),
        ],
        shots: [{ motion: "PUSH", focalElement: "CTA_KEYWORD" }, { motion: "DRIFT" }],
      }),
    ],
  };
}

function scene(index, roles, screenText, extra) {
  const quoted = screenText.map((t) => `"${t}"`).join(", ");
  return {
    index,
    roles,
    purpose: `beat ${index}`,
    sourceText: ["(source line)"],
    screenText,
    visualGoal: "hand-drawn sharpie scene",
    imagePrompt:
      `Flat scan of a white sheet of paper. Hand-letter exactly these notes, each appearing exactly once: ${quoted}. ` +
      `Composition for beat ${index} of the story with the described elements placed as regioned.`,
    elements: [],
    shots: [],
    people: [],
    ...extra,
  };
}

function el(id, desc, text, region) {
  return text ? { id, desc, text, region } : { id, desc, region };
}

export function fixtureSourceNumbers() {
  // Matches the fixture's on-screen numbers as the "source script" would supply them.
  return new Set(["40000", "15000", "2000000", "133", "150"]);
}

// ---------------------------------------------------------------------------
// Handwritten-motion fixtures. The parsed script mirrors the real markdown shape
// (SCRIPT prose plus META), so the fact lock under test is derived exactly the
// way it is in production rather than hand-listed.

export function fixtureParsedScript() {
  return {
    title: "Ryan Leslie: forty thousand numbers",
    scriptText:
      "He collected 40,000 fan phone numbers and sold to 15,000 of them, " +
      "over $2,000,000 in total. That is about $133 per reachable fan, " +
      "and it took eight months. Comment OWN and I will DM you the link.",
    nanoPrompt: null,
    meta: {
      artist: "Ryan Leslie",
      family: "I/Evidence",
      "withheld variable": "the total",
      "big reveal": "over $2,000,000",
      "lead magnet": "fan-worth-calculator + OWN",
    },
    ctaKeyword: "OWN",
    family: "I/Evidence",
    artist: "Ryan Leslie",
    warnings: [],
  };
}

/** A minimal valid motion spec. `artworkFile` must be a file that exists, since
 * the validator refuses a spec whose artwork is missing; tests pass a real repo
 * asset rather than a fake path. */
export function fixtureMotionSpec(artworkFile) {
  return {
    slug: "34-ryan-leslie-forty-thousand-numbers",
    title: "Ryan Leslie: forty thousand numbers",
    targetDurationSec: 30.0,
    requiredFigures: ["40,000", "15,000", "$2,000,000"],
    artwork: [{ id: "sheet", file: artworkFile }],
    plates: [
      { id: "portrait", artwork: "sheet", crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } },
      { id: "endcard", artwork: "sheet", crop: { x: 0, y: 0, w: 1, h: 1 }, keepPaper: true },
    ],
    scenes: [
      {
        index: 0,
        roles: ["HOOK"],
        purpose: "the question",
        durationSec: 12.0,
        camera: { from: { cx: 0.5, cy: 0.5, zoom: 1.0 }, to: { cx: 0.5, cy: 0.5, zoom: 1.05 } },
        plates: [{ plate: "portrait", place: { x: 0.5, y: 0.4, w: 0.5 }, motion: { kind: "HOLD" } }],
        text: [
          {
            id: "hook",
            text: "40,000 NUMBERS",
            slot: "headline",
            x: 0.5,
            y: 0.2,
            size: 0.04,
            motion: { kind: "DRAW_ON", startSec: 0.1, durSec: 0.8 },
          },
        ],
      },
      {
        index: 1,
        roles: ["REVEAL"],
        purpose: "the total",
        durationSec: 8.0,
        plates: [],
        text: [
          {
            id: "total",
            text: "$2,000,000",
            claim: "lifetime-total",
            slot: "bigNumber",
            x: 0.5,
            y: 0.45,
            size: 0.08,
            motion: { kind: "POP", startSec: 0.5, durSec: 0.4 },
          },
          {
            id: "sold",
            text: "15,000 BUYERS",
            slot: "caption",
            x: 0.5,
            y: 0.65,
            size: 0.03,
            motion: { kind: "FADE", startSec: 1.5, durSec: 0.4 },
          },
        ],
      },
      {
        index: 2,
        roles: ["CTA"],
        purpose: "the keyword",
        durationSec: 8.4,
        plates: [],
        text: [
          {
            id: "key",
            text: "COMMENT OWN",
            slot: "ctaKeyword",
            x: 0.5,
            y: 0.45,
            size: 0.05,
            motion: { kind: "POP", startSec: 0.4, durSec: 0.4 },
          },
        ],
      },
      {
        index: 3,
        roles: ["END_CARD"],
        purpose: "the crown sheet",
        durationSec: 1.6,
        plates: [{ plate: "endcard", place: { x: 0.5, y: 0.5, w: 1.0 }, motion: { kind: "HOLD" } }],
        text: [],
      },
    ],
  };
}

/** Sprite sizes keyed the way collectSprites keys them, so geometry can be
 * computed in a test without rendering any lettering. */
export function fixtureSpriteMap(byLayer, size = { width: 700, height: 150 }) {
  const map = new Map();
  for (const { hashes } of byLayer.values()) {
    for (const h of hashes) map.set(h, { file: `/dev/null/${h}.png`, ...size });
  }
  return map;
}
