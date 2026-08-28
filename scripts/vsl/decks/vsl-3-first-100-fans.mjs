// VSL #3: "How I'd Launch a Membership to Your First 100 Fans"
// Headlines are the exact copy from CRWN_VSL3_Nano_Banana_Prompts.md. Em dashes in that source
// are rewritten (house rule: never an em dash in copy). No benchmark, testimonial, statistic or
// revenue claim beyond what the sheet specifies; slide 15's dashboard shows metric NAMES with a
// rule where a number would go, and slide 19 is a labelled placeholder for the screen recording.
//
// THE CURIOSITY GAP IS THE POINT OF THIS DECK. The sheet says four separate times that "proven
// buyers first" may not appear before slide 17, and names 13 and 16 specifically. A leak still
// renders as a perfectly good slide, so it is asserted at the bottom of this file rather than
// left to my eye.
import {
  shell,
  iconTiles,
  chipRow,
  struckStack,
  crowdCompare,
  flowChain,
  centerpiece,
  loopCycle,
  concentricRings,
  metricGrid,
  priorityStack,
  miniLadder,
  speechBubble,
  optionRow,
  stepList,
  recordingSlot,
  ctaButton,
  icon,
  person,
} from "../lib/layouts.mjs";

export const deck = {
  id: "vsl-3-first-100-fans",
  label: "LAUNCHING TO YOUR FIRST 100 FANS",
  slides: [],
};

const S = (n, fn) => deck.slides.push({ n, html: fn(n) });
const base = (n) => ({ n, num: n, deck: deck.label });

/* 1 ------------------------------------------------------------------ */
S(1, (n) =>
  shell({
    ...base(n),
    head: "HOW I'D LAUNCH YOUR MEMBERSHIP TO YOUR [[FIRST 100 FANS.]]",
    headSize: 88,
    body: struckStack(["POST EVERYWHERE", "BLAST EVERYONE", "JUDGE IT FROM DAY ONE"], { size: 56 }),
    foot: { hand: "I'd start much smaller.", handUnderline: "much smaller." },
    faint: [
      { icon: "megaphone", size: 210, left: 58, bottom: 170 },
      { icon: "users", size: 190, right: 62, bottom: 180 },
    ],
  }),
);

/* 2 ------------------------------------------------------------------ */
S(2, (n) =>
  shell({
    ...base(n),
    head: "THE BIGGEST AUDIENCE ISN'T ALWAYS THE [[BEST FIRST AUDIENCE.]]",
    headSize: 74,
    body: crowdCompare({
      left: { count: 220, label: "BIGGEST AUDIENCE" },
      middle: "Who gives you the best evidence first?",
      right: { count: 12, label: "SMALLER GROUP" },
    }),
    foot: { small: "Reach and useful feedback are not the same thing." },
  }),
);

/* 3 ------------------------------------------------------------------ */
S(3, (n) =>
  shell({
    ...base(n),
    head: "HOW MOST ARTISTS LAUNCH.",
    headSize: 96,
    body: flowChain(
      [
        { icon: "page", label: "BUILD PAGE" },
        { icon: "camera", label: "INSTAGRAM POST" },
        { icon: "play", label: "STORY" },
        { icon: "mail", label: "EMAIL" },
        { icon: "hourglass", label: "WAIT" },
      ],
      { end: "?" },
    ),
    foot: { hand: "If nobody buys... what actually failed?" },
  }),
);

/* 4 ------------------------------------------------------------------ */
S(4, (n) =>
  shell({
    ...base(n),
    head: "ZERO SALES CAN MEAN [[6 DIFFERENT THINGS.]]",
    headSize: 88,
    body: iconTiles(
      [
        { icon: "gift", label: "OFFER" },
        { icon: "tag", label: "PRICE" },
        { icon: "star", label: "BENEFITS" },
        { icon: "users", label: "AUDIENCE" },
        { icon: "comment", label: "MESSAGE" },
        { icon: "eye", label: "VISIBILITY" },
      ],
      { size: 48 },
    ),
    foot: {
      hand: "A big launch can still give you very little useful information.",
      handUnderline: "very little useful information.",
    },
  }),
);

/* 5 ------------------------------------------------------------------ */
S(5, (n) =>
  shell({
    ...base(n),
    head: "THE FIRST GOAL ISN'T SCALE. [[IT'S EVIDENCE.]]",
    headSize: 84,
    body: centerpiece({
      big: "1 PAID MEMBER",
      around: [
        "Checkout works",
        "Offer makes sense",
        "Price is viable",
        "A real fan exchanged money",
      ],
    }),
    foot: { hand: "Before this, almost everything is theory." },
  }),
);

/* 6 ------------------------------------------------------------------ */
S(6, (n) =>
  shell({
    ...base(n),
    head: "ONE TRANSACTION TURNS THEORY INTO [[EVIDENCE.]]",
    headSize: 80,
    body: flowChain([
      { icon: "user", label: "REAL FAN" },
      { icon: "eye", label: "SAW OFFER" },
      { icon: "check", label: "UNDERSTOOD VALUE" },
      { icon: "card", label: "PAID" },
      { icon: "userPlus", label: "JOINED" },
    ]),
    foot: { hand: "Now you have something real to improve." },
  }),
);

/* 7 ------------------------------------------------------------------ */
S(7, (n) =>
  shell({
    ...base(n),
    head: "BUILD THE OFFER [[BEFORE]] THE CAMPAIGN.",
    headSize: 92,
    body: `${miniLadder([
      { name: "BRONZE" },
      { name: "SILVER" },
      { name: "GOLD" },
      { name: "PLATINUM" },
    ])}
      <div style="margin-top:34px">${chipRow(
        [
          { icon: "star", label: "VALUE" },
          { icon: "tag", label: "PRICE" },
          { icon: "gift", label: "FULFILLMENT" },
        ],
        { gold: true },
      )}</div>`,
    foot: { hand: "Don't scale an offer you don't want to deliver." },
  }),
);

/* 8 ------------------------------------------------------------------ */
S(8, (n) =>
  shell({
    ...base(n),
    head: "STOP LOOKING AT FOLLOWERS. START LOOKING FOR [[EVIDENCE.]]",
    headSize: 74,
    body: iconTiles(
      [
        { icon: "shirt", label: "MERCH BUYER" },
        { icon: "ticket", label: "TICKET BUYER" },
        { icon: "star", label: "VIP BUYER" },
        { icon: "card", label: "EXISTING MEMBER" },
        { icon: "repeat", label: "REPEAT BUYER" },
      ],
      { size: 48 },
    ),
    foot: { hand: "These people have already demonstrated demand." },
  }),
);

/* 9 ------------------------------------------------------------------ */
S(9, (n) =>
  shell({
    ...base(n),
    head: "DON'T START WITH THE [[WHOLE AUDIENCE.]]",
    headSize: 88,
    body: crowdCompare({
      left: { count: 260, label: "100,000 PEOPLE" },
      right: {
        count: 10,
        label: "KNOWN WARM FANS",
        items: ["Offer", "Price", "Benefits", "Questions"],
      },
    }),
    foot: { hand: "Smaller group. Cleaner signal." },
  }),
);

/* 10 ----------------------------------------------------------------- */
S(10, (n) =>
  shell({
    ...base(n),
    head: "PRIVATE LAUNCH FIRST.",
    headSize: 100,
    body: `${optionRow(["SMALL.", "DIRECT.", "PERSONAL.", "MEASURABLE."], { size: 58 })}
      <div class="invite">
        ${icon("mic", 62)}
        ${icon("send", 44, "icon send")}
        <div class="invite-group">${Array.from({ length: 6 }, () => person(34, "#B8761A")).join("")}</div>
        ${speechBubble("“I wanted you to see this before I open it publicly.”")}
      </div>`,
    foot: { hand: "Learn before you scale." },
  }),
);

/* 11 ----------------------------------------------------------------- */
S(11, (n) =>
  shell({
    ...base(n),
    head: "THE TARGET: [[MEMBER #1.]]",
    headSize: 100,
    body: centerpiece({
      big: "#1",
      around: [
        "Which tier?",
        "Why that one?",
        "What mattered?",
        "What almost stopped them?",
        "Where did they come from?",
      ],
    }),
    foot: { hand: "One real member can teach you more than a thousand assumptions." },
  }),
);

/* 12 ----------------------------------------------------------------- */
S(12, (n) =>
  shell({
    ...base(n),
    head: "FIX [[BEFORE]] YOU SCALE.",
    headSize: 96,
    body: loopCycle(["CLARIFY", "REMOVE", "ADJUST", "SIMPLIFY", "ANSWER OBJECTIONS"], {
      center: "Version 1 is allowed to teach you.",
      size: 500,
    }),
    foot: { small: "Use early evidence to strengthen the offer before expansion." },
  }),
);

/* 13 ----------------------------------------------------------------- */
S(13, (n) =>
  shell({
    ...base(n),
    head: "THEN EXPAND.",
    headSize: 104,
    // The innermost ring is deliberately unnamed. Naming it here is the leak the sheet warns about.
    body: concentricRings(["FIRST GROUP", "ENGAGED KNOWN FANS", "OWNED AUDIENCE", "SOCIAL"]),
    foot: { hand: "Start with your best signal. Then widen the circle." },
  }),
);

/* 14 ----------------------------------------------------------------- */
S(14, (n) =>
  shell({
    ...base(n),
    head: "THE LAUNCH DOESN'T END [[WHEN THEY BUY.]]",
    headSize: 86,
    body: `${flowChain([
      { icon: "card", label: "BUY" },
      { icon: "calendar", label: "PROMISE" },
      { icon: "gift", label: "DELIVER" },
    ])}
      <div style="margin-top:30px">${chipRow(
        [
          { icon: "music", label: "Unreleased Song" },
          { icon: "mic", label: "Private Event" },
          { icon: "unlock", label: "Early Access" },
        ],
        { gold: true },
      )}</div>`,
    foot: { hand: "The first 100 should be glad they joined." },
  }),
);

/* 15 ----------------------------------------------------------------- */
S(15, (n) =>
  shell({
    ...base(n),
    head: "MEASURE WHAT [[ACTUALLY HAPPENED.]]",
    headSize: 92,
    body: metricGrid([
      "SAW OFFER",
      "FREE JOINS",
      "PAID MEMBERS",
      "TIER CHOICE",
      "DROP-OFF",
      "REVENUE",
      "BEST MESSAGE",
    ]),
    foot: {
      hand: "Evidence tells you the next move.",
      disclaim: "Conceptual. CRWN reports your real numbers, not these.",
    },
  }),
);

/* 16 ----------------------------------------------------------------- */
S(16, (n) =>
  shell({
    ...base(n),
    head: "WHO SHOULD SEE THE OFFER FIRST?",
    headSize: 96,
    // Four wrong answers, and the right one is still withheld for one more slide.
    body: struckStack(
      ["BIGGEST FOLLOWERS", "MOST COMMENTS", "EVERYONE ON SOCIAL", "ENTIRE EMAIL LIST"],
      { size: 50 },
    ),
    foot: { hand: "Start with the strongest evidence." },
  }),
);

/* 17 ----------------------------------------------------------------- */
S(17, (n) =>
  shell({
    ...base(n),
    head: "[[PROVEN BUYERS FIRST.]]",
    headSize: 108,
    body: priorityStack([
      "PREVIOUS BUYERS",
      "EXISTING MEMBERS",
      "ENGAGED KNOWN FANS",
      "WIDER OWNED AUDIENCE",
      "SOCIAL FOLLOWERS",
    ]),
    foot: { hand: "Who gives you the highest-quality evidence first?" },
  }),
);

/* 18 ----------------------------------------------------------------- */
S(18, (n) =>
  shell({
    ...base(n),
    head: "A LAUNCH IS A SYSTEM. [[NOT A POST.]]",
    headSize: 88,
    body: flowChain(
      [
        { icon: "page", label: "BUILD" },
        { icon: "send", label: "WARM LAUNCH" },
        { icon: "card", label: "FIRST PAID MEMBER" },
        { icon: "eye", label: "LEARN" },
        { icon: "sliders", label: "IMPROVE" },
        { icon: "trending", label: "EXPAND" },
        { icon: "gift", label: "DELIVER" },
        { icon: "chart", label: "MEASURE" },
        { icon: "target", label: "NEXT MOVE" },
      ],
      { compact: true },
    ),
    foot: { hand: "Launch = evidence, then improvement, then expansion." },
  }),
);

/* 19 ----------------------------------------------------------------- */
S(19, (n) =>
  shell({
    ...base(n),
    head: "BUILD FIRST. [[LAUNCH SECOND.]]",
    headSize: 96,
    sub: "Turn the calculator result into an offer you can actually test.",
    body: `<div class="ctarow">
      <div class="ctaleft">
        ${stepList([
          "Build Bronze, Silver, Gold & Platinum",
          "Customize the offer",
          "Launch to the right people first",
        ])}
        ${ctaButton("BUILD MY MEMBERSHIP")}
      </div>
      ${recordingSlot("REAL CRWN SCREEN RECORDING GOES HERE")}
    </div>`,
    foot: { hand: "Start with evidence. Then expand." },
  }),
);

/* ---------------------------------------------------------------------
 * The curiosity gap, enforced.
 *
 * The whole deck is built to withhold one answer until slide 17. A leak into slide 13 or 16 would
 * still render as a handsome slide, and re-reading nineteen slides for an absent phrase is exactly
 * the check a person performs badly. So it fails the render instead.
 * ------------------------------------------------------------------- */
const REVEAL_TERMS = ["PROVEN BUYER"];
const REVEAL_SLIDE = 17;

for (const slide of deck.slides) {
  if (slide.n >= REVEAL_SLIDE) continue;
  const upper = slide.html.toUpperCase();
  const leaked = REVEAL_TERMS.filter((t) => upper.includes(t));
  if (leaked.length) {
    throw new Error(
      `vsl-3: slide ${slide.n} reveals ${leaked.join(", ")} before slide ${REVEAL_SLIDE}. ` +
        `The deck's payoff depends on withholding this; rewrite the slide rather than the check.`,
    );
  }
}

if (!deck.slides.find((s) => s.n === REVEAL_SLIDE)?.html.toUpperCase().includes("PROVEN BUYERS")) {
  throw new Error(`vsl-3: slide ${REVEAL_SLIDE} is the payoff and must state "Proven buyers first".`);
}

export default deck;
