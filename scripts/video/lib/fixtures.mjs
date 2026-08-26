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
