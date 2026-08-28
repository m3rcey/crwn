// The main Calculator VSL, 43 slides.
// Headlines are the exact copy from CRWN_Calculator_VSL_Nano_Banana_Prompts.md. Em dashes in that
// source are rewritten (house rule: never an em dash in copy).
//
// THIS DECK SHOWS THE CALCULATOR RESULT, which is the one thing it must never overstate. The sheet
// says so five times: estimated opportunity, never guaranteed income; never imply every follower
// pays; never imply follower count is worthless; no invented percentages or benchmarks.
//
// Two consequences run through the whole file:
//   1. Slides 1 and 36 do NOT contain a number. The result is per-viewer, so they ship a labelled
//      slot the editor fills, the same discipline as slide 27's screen recording. A plausible
//      figure baked in here would read as a claim CRWN never made.
//   2. Money IS allowed as illustrative tier pricing, unlike VSL #4. So the guard below is shaped
//      differently: a slide showing an amount must carry its qualifier on the same slide.
import {
  shell,
  resultSlot,
  funnel,
  audienceField,
  demandSpectrum,
  chipRow,
  continuousLine,
  momentsTimeline,
  ladder,
  miniLadder,
  pyramid,
  iconTiles,
  trapDiagram,
  editableTiers,
  flowChain,
  fragmentation,
  questionList,
  pillars,
  orbit,
  metricGrid,
  panelCompare,
  miniCards,
  struckStack,
  centerpiece,
  stepList,
  recordingSlot,
  ctaButton,
  icon,
  person,
  arrow,
  brush,
  CROWN,
} from "../lib/layouts.mjs";
import { PALETTE as C } from "../lib/theme.mjs";

export const deck = {
  id: "vsl-calculator",
  label: "YOUR CALCULATOR RESULT",
  slides: [],
};

const S = (n, fn) => deck.slides.push({ n, html: fn(n) });
const base = (n) => ({ n, num: n, deck: deck.label });
const ILLUSTRATIVE = "Illustrative examples.";
const ESTIMATE_NOTE = "Estimated opportunity, not guaranteed income.";

/* 1 ------------------------------------------------------------------ */
S(1, (n) =>
  shell({
    ...base(n),
    head: "THAT NUMBER LOOKS TOO HIGH.",
    headSize: 96,
    body: resultSlot(),
    foot: { hand: "Fair reaction.", disclaim: ESTIMATE_NOTE },
  }),
);

/* 2 ------------------------------------------------------------------ */
S(2, (n) =>
  shell({
    ...base(n),
    head: "THIS IS NOT “EVERY FOLLOWER = [[$100]].”",
    headSize: 84,
    body: `<div style="display:flex;align-items:center;justify-content:center;gap:70px">
      <div style="display:flex;flex-wrap:wrap;gap:5px;width:420px">${Array.from(
        { length: 120 },
        () => person(19, "#CFC9BE"),
      ).join("")}</div>
      <div class="equation"><span class="struck">500,000 followers × $100</span></div>
    </div>`,
    foot: { hand: "That's not how the estimate works.", disclaim: ESTIMATE_NOTE },
  }),
);

/* 3 ------------------------------------------------------------------ */
S(3, (n) =>
  shell({
    ...base(n),
    head: "THE CALCULATOR NARROWS THE AUDIENCE.",
    headSize: 84,
    // No percentages: the sheet forbids them, and a rate here would be an invented benchmark.
    body: funnel([
      { label: "AUDIENCE" },
      { label: "REACHABLE" },
      { label: "LIKELY TO PAY DIRECTLY" },
    ]),
    foot: { hand: "Smaller. Then smaller again." },
  }),
);

/* 4 ------------------------------------------------------------------ */
S(4, (n) =>
  shell({
    ...base(n),
    head: "SMALLER GROUP. [[DIFFERENT LEVELS OF DEMAND.]]",
    headSize: 76,
    body: `${audienceField({
      rows: 9,
      cols: 44,
      groups: [{ left: 38, top: 18, w: 20, h: 56, label: "The people who pay directly" }],
    })}
      <div style="margin-top:34px">${chipRow(
        [{ label: "LOWER" }, { label: "MIDDLE" }, { label: "DEEPER" }],
        { gold: true },
      )}</div>`,
    foot: { hand: "The opportunity comes from depth, not everyone paying." },
  }),
);

/* 5 ------------------------------------------------------------------ */
S(5, (n) =>
  shell({
    ...base(n),
    head: "NOT EVERY FAN WANTS THE SAME THING.",
    headSize: 86,
    body: demandSpectrum({
      levels: ["$10", "$25", "$100"],
      attributes: ["A little more", "Deeper access", "Highest-value experience"],
    }),
    foot: { hand: "Different fans. Different demand.", disclaim: ILLUSTRATIVE },
  }),
);

/* 6 ------------------------------------------------------------------ */
S(6, (n) =>
  shell({
    ...base(n),
    head: "DIFFERENT DEMAND. [[SAME FEW WAYS TO BUY.]]",
    headSize: 80,
    body: `<div style="display:flex;align-items:center;justify-content:center;gap:44px">
      <div style="display:flex;flex-direction:column;gap:20px">${[1, 2, 3]
        .map(() => `<div>${person(58, C.ink)}</div>`)
        .join("")}</div>
      <div style="display:flex;flex-direction:column;gap:26px">${[1, 2, 3]
        .map(() => `<div>${arrow({ len: 130, color: C.goldInk })}</div>`)
        .join("")}</div>
      ${miniCards(
        [
          { icon: "waveform", label: "STREAM" },
          { icon: "shirt", label: "MERCH DROP" },
          { icon: "ticket", label: "TICKET" },
        ],
        { gold: true },
      )}
    </div>`,
    foot: { hand: "Three different fans. Nearly the same path." },
  }),
);

/* 7 ------------------------------------------------------------------ */
S(7, (n) =>
  shell({
    ...base(n),
    head: "ONE PURCHASE → END.",
    headSize: 92,
    body: `${momentsTimeline(["ONE PURCHASE"])}
      <div style="margin-top:44px" class="midhead">RELATIONSHIP → REPEATED VALUE EXCHANGE.</div>
      <div style="margin-top:26px">${continuousLine({ markers: 6 })}</div>`,
    foot: { hand: "This is where the opportunity starts to make more sense." },
  }),
);

/* 8 ------------------------------------------------------------------ */
S(8, (n) =>
  shell({
    ...base(n),
    head: "THE LADDER.",
    headSize: 104,
    body: ladder(
      [
        { name: "BRONZE", price: "Free front door", people: 30 },
        { name: "SILVER", price: "Easy paid start", people: 15 },
        { name: "GOLD", price: "Deeper supporters", people: 7 },
        { name: "PLATINUM", price: "Limited deepest access", people: 3 },
      ],
      { labelWidth: 300 },
    ),
    foot: { hand: "Different levels of demand need different places to go." },
  }),
);

/* 9 ------------------------------------------------------------------ */
S(9, (n) =>
  shell({
    ...base(n),
    head: "THE DEEPER THE TIER, [[THE SMALLER THE GROUP.]]",
    headSize: 78,
    body: pyramid([
      { name: "BRONZE", people: 22 },
      { name: "SILVER", people: 12 },
      { name: "GOLD", people: 6 },
      { name: "PLATINUM", people: 2 },
    ]),
    foot: { hand: "That's the point." },
  }),
);

/* 10 ----------------------------------------------------------------- */
S(10, (n) =>
  shell({
    ...base(n),
    head: "“MY FANS WON'T PAY MONTHLY.”",
    headSize: 96,
    body: `<div class="midhead" style="font-size:58px">Most of them may not.</div>`,
    foot: { hand: "They don't have to." },
  }),
);

/* 11 ----------------------------------------------------------------- */
S(11, (n) =>
  shell({
    ...base(n),
    head: "YOU MAY ALREADY HAVE [[THE EVIDENCE.]]",
    headSize: 84,
    body: iconTiles(
      [
        { icon: "shirt", label: "MERCH" },
        { icon: "ticket", label: "TICKETS" },
        { icon: "star", label: "VIP" },
        { icon: "lock", label: "EXCLUSIVE CONTENT" },
        { icon: "users", label: "MEET-AND-GREETS" },
      ],
      { size: 48 },
    ),
    foot: { hand: "Some fans have already proven willingness to buy." },
  }),
);

/* 12 ----------------------------------------------------------------- */
S(12, (n) =>
  shell({
    ...base(n),
    head: "MOST ARTIST REVENUE HAPPENS IN [[ISOLATED MOMENTS.]]",
    headSize: 74,
    body: momentsTimeline(["MERCH DROP", "TOUR", "RELEASE"]),
    foot: { hand: "Then the cycle starts over." },
  }),
);

/* 13 ----------------------------------------------------------------- */
S(13, (n) =>
  shell({
    ...base(n),
    head: "FROM REPEATED RESTARTS → [[ONGOING RELATIONSHIP.]]",
    headSize: 74,
    body: `${momentsTimeline(["BUY", "BUY", "BUY"])}
      <div style="margin-top:48px">${continuousLine({ markers: 7, label: "ONGOING RELATIONSHIP" })}</div>`,
    foot: { hand: "Another way to serve the fan over time." },
  }),
);

/* 14 ----------------------------------------------------------------- */
S(14, (n) =>
  shell({
    ...base(n),
    head: "ONE PRICE CAN'T REPRESENT [[EVERY LEVEL OF DEMAND.]]",
    headSize: 76,
    body: demandSpectrum({
      levels: ["$10", "$25", "PREMIUM"],
      attributes: ["Entry", "Deeper access", "Closest relationship"],
    }),
    foot: { hand: "Give fans somewhere appropriate to go.", disclaim: ILLUSTRATIVE },
  }),
);

/* 15 ----------------------------------------------------------------- */
S(15, (n) =>
  shell({
    ...base(n),
    head: "A SMALL PAYING AUDIENCE CAN STILL HAVE [[MEANINGFUL DEPTH.]]",
    headSize: 68,
    body: ladder(
      [
        { name: "BRONZE", price: "Free", people: 28 },
        { name: "SILVER", price: "Many", people: 16 },
        { name: "GOLD", price: "Fewer", people: 6 },
        { name: "PLATINUM", price: "Very few", people: 2 },
      ],
      { labelWidth: 200 },
    ),
    foot: { hand: "More depth does not require every follower to become a superfan." },
  }),
);

/* 16 ----------------------------------------------------------------- */
S(16, (n) =>
  shell({
    ...base(n),
    head: "WHAT WOULD I EVEN PUT IN THE MEMBERSHIP?",
    headSize: 82,
    body: `<div class="blankcard"><span>?</span></div>`,
    foot: { hand: "This is where artists get stuck." },
  }),
);

/* 17 ----------------------------------------------------------------- */
S(17, (n) =>
  shell({
    ...base(n),
    head: "THE BLANK-PAGE TRAP.",
    headSize: 100,
    body: trapDiagram({
      items: ["Discord", "Calls", "Shout-outs", "Exclusive posts", "DM access", "Merch"],
      outcomes: [
        { title: "TOO LITTLE", sub: "Nobody cares." },
        { title: "TOO MUCH", sub: "You create another job." },
      ],
    }),
    foot: { hand: "Guessing creates both problems." },
  }),
);

/* 18 ----------------------------------------------------------------- */
S(18, (n) =>
  shell({
    ...base(n),
    head: "START WITH A STRUCTURE. [[THEN MAKE IT YOURS.]]",
    headSize: 76,
    // Blank benefit lines, not a mock of CRWN: the sheet forbids fabricated product UI.
    body: editableTiers(["BRONZE", "SILVER", "GOLD", "PLATINUM"]),
    foot: { hand: "Suggested starting point. Fully customizable." },
  }),
);

/* 19 ----------------------------------------------------------------- */
S(19, (n) =>
  shell({
    ...base(n),
    head: "LOW-RISK NEXT STEP.",
    headSize: 100,
    body: `${flowChain(
      [
        { icon: "eye", label: "SEE THE TIERS" },
        { icon: "star", label: "CHANGE BENEFITS" },
        { icon: "tag", label: "CHANGE PRICING" },
        { icon: "x", label: "REMOVE WHAT DOESN'T FIT" },
        { icon: "check", label: "DECIDE" },
      ],
      { compact: true },
    )}
      <div style="display:flex;justify-content:center;margin-top:38px">${ctaButton("BUILD MY MEMBERSHIP")}</div>`,
    foot: { hand: "Turn the number into an actual offer." },
  }),
);

/* 20 ----------------------------------------------------------------- */
S(20, (n) =>
  shell({
    ...base(n),
    head: "WHY NOT JUST USE ANOTHER MEMBERSHIP PLATFORM?",
    headSize: 80,
    body: `<div class="midhead" style="font-size:62px">Because the membership is only the
      <span class="hand-u">first piece</span>.</div>`,
    foot: null,
  }),
);

/* 21 ----------------------------------------------------------------- */
S(21, (n) =>
  shell({
    ...base(n),
    head: "YOUR FAN BUSINESS IS [[FRAGMENTED.]]",
    headSize: 88,
    body: fragmentation({
      center: "YOU",
      nodes: ["MEMBERSHIP", "EMAIL", "MERCH BUYERS", "COMMUNITY", "TICKET BUYERS", "SPREADSHEET"],
    }),
    foot: { hand: "And you become the integration layer." },
  }),
);

/* 22 ----------------------------------------------------------------- */
S(22, (n) =>
  shell({
    ...base(n),
    head: "LOTS OF TOOLS. [[NO OPERATING LAYER.]]",
    headSize: 88,
    // Generic tools only. The sheet forbids competitor logos.
    body: iconTiles(
      [
        { icon: "bag", label: "SELL" },
        { icon: "mail", label: "EMAIL" },
        { icon: "comment", label: "COMMUNITY" },
        { icon: "card", label: "MEMBERSHIP" },
        { icon: "ticket", label: "TICKETS" },
      ],
      { size: 46 },
    ),
    foot: { hand: "More tools can still leave the whole business invisible." },
  }),
);

/* 23 ----------------------------------------------------------------- */
S(23, (n) =>
  shell({
    ...base(n),
    head: "CAN YOUR STACK ANSWER THESE?",
    headSize: 92,
    body: questionList(
      [
        "WHO [[PAYS?]]",
        "WHAT DO THEY [[BUY?]]",
        "WHAT SHOULD I [[OFFER NEXT?]]",
        "WHAT DID I [[PROMISE?]]",
        "DID IT [[WORK?]]",
      ],
      { size: 42, cols: 1 },
    ),
    foot: null,
  }),
);

/* 24 ----------------------------------------------------------------- */
S(24, (n) =>
  shell({
    ...base(n),
    head: "FAN ECONOMY OPERATING SYSTEM.",
    headSize: 88,
    sub: "See the people, money, offers, promises and next move in one operating layer.",
    body: pillars([
      { icon: "users", label: "PEOPLE" },
      { icon: "dollar", label: "MONEY" },
      { icon: "gift", label: "OFFERS" },
      { icon: "calendar", label: "PROMISES" },
      { icon: "target", label: "NEXT MOVE" },
    ]),
    foot: null,
  }),
);

/* 25 ----------------------------------------------------------------- */
S(25, (n) =>
  shell({
    ...base(n),
    head: "AUDIENCE ≠ [[FAN ECONOMY.]]",
    headSize: 96,
    body: audienceField({
      rows: 9,
      cols: 44,
      groups: [
        { left: 40, top: 22, w: 17, h: 50, label: "FAN ECONOMY: identifiable people, real value over time" },
      ],
    }),
    foot: {
      bold: "AUDIENCE: everyone paying attention.",
      hand: "Reach creates opportunity. Depth creates business value.",
    },
  }),
);

/* 26 ----------------------------------------------------------------- */
S(26, (n) =>
  shell({
    ...base(n),
    head: "THE FAN ECONOMY IS [[ACTIVE.]]",
    headSize: 96,
    body: orbit({
      center: Array.from({ length: 5 }, () => person(46, C.goldInk)).join(""),
      verbs: ["BUY", "SUBSCRIBE", "SHOW UP", "PARTICIPATE", "COME BACK"],
    }),
    foot: { hand: "Some relationships go much deeper than others." },
  }),
);

/* 27 ----------------------------------------------------------------- */
S(27, (n) =>
  shell({
    ...base(n),
    head: "BRING THE FAN BUSINESS TOGETHER.",
    headSize: 84,
    body: `<div class="ctarow">
      <div class="ctaleft">${stepList([
        "Build offer",
        "Bring in fans + buyers",
        "Launch",
        "Track promises",
        "See what needs attention next",
      ])}</div>
      ${recordingSlot("REAL CRWN SCREEN RECORDING GOES HERE")}
    </div>`,
    foot: null,
  }),
);

/* 28 ----------------------------------------------------------------- */
S(28, (n) =>
  shell({
    ...base(n),
    head: "OPERATE THE FAN ECONOMY.",
    headSize: 96,
    body: flowChain([
      { icon: "eye", label: "SEE IT" },
      { icon: "alert", label: "FIND THE BLOCK" },
      { icon: "target", label: "ONE MOVE" },
      { icon: "gift", label: "DELIVER IT" },
      { icon: "chart", label: "KNOW IF IT WORKED" },
    ]),
    foot: { hand: "One operating loop." },
  }),
);

/* 29 ----------------------------------------------------------------- */
S(29, (n) =>
  shell({
    ...base(n),
    head: "MEMBERSHIP IS [[THE STARTING POINT.]]",
    headSize: 88,
    body: `${miniLadder([
      { name: "BRONZE" },
      { name: "SILVER" },
      { name: "GOLD" },
      { name: "PLATINUM" },
    ])}
      <div style="margin-top:34px">${flowChain(
        [
          { label: "IDENTIFIABLE FANS" },
          { label: "BUYERS" },
          { label: "REPEAT BUYERS" },
          { label: "BETTER DECISIONS" },
        ],
        { compact: true },
      )}</div>`,
    foot: { hand: "The offer gives fans somewhere to raise their hand." },
  }),
);

/* 30 ----------------------------------------------------------------- */
S(30, (n) =>
  shell({
    ...base(n),
    head: "FROM FOLLOWER COUNT → [[CUSTOMER KNOWLEDGE.]]",
    headSize: 78,
    body: panelCompare({
      left: {
        title: "ATTENTION",
        body: miniCards([
          { icon: "users", label: "FOLLOWERS" },
          { icon: "waveform", label: "STREAMS" },
          { icon: "eye", label: "VIEWS" },
        ]),
      },
      right: {
        title: "ECONOMIC DEPTH",
        body: miniCards(
          [
            { icon: "bag", label: "WHO BUYS" },
            { icon: "tag", label: "WHAT THEY BUY" },
            { icon: "repeat", label: "WHO COMES BACK" },
          ],
          { gold: true },
        ),
      },
    }),
    foot: { hand: "Different questions. Different business insight." },
  }),
);

/* 31 ----------------------------------------------------------------- */
S(31, (n) =>
  shell({
    ...base(n),
    head: "JUST BUILD THE OFFER.",
    headSize: 100,
    body: `<div class="ctaleft" style="max-width:900px;margin:0 auto">${stepList([
      "Start with four tiers",
      "Change what doesn't fit",
      "Decide if it makes sense",
    ])}</div>
      <div style="display:flex;justify-content:center;margin-top:38px">${ctaButton("BUILD MY MEMBERSHIP")}</div>`,
    foot: { hand: "No need to move your whole business today." },
  }),
);

/* 32 ----------------------------------------------------------------- */
S(32, (n) =>
  shell({
    ...base(n),
    head: "“I DON'T HAVE TIME TO BUILD ANOTHER BUSINESS.”",
    headSize: 82,
    body: `<div class="midhead" style="font-size:62px">You shouldn't have to.</div>`,
    foot: { hand: "The offer should create leverage, not another job." },
  }),
);

/* 33 ----------------------------------------------------------------- */
S(33, (n) =>
  shell({
    ...base(n),
    head: "BUILD THE SMALLEST OFFER THAT [[CREATES DEPTH.]]",
    headSize: 76,
    body: `${struckStack(["20 BENEFITS", "POST EVERY DAY", "UNLIMITED ACCESS"], { size: 46, cols: 3 })}
      <div style="margin-top:44px" class="midhead">A FEW VALUABLE, SUSTAINABLE PROMISES</div>`,
    foot: { hand: "Keep what makes sense. Delete what doesn't." },
  }),
);

/* 34 ----------------------------------------------------------------- */
S(34, (n) =>
  shell({
    ...base(n),
    head: "YOU DON'T NEED ANOTHER [[DISCONNECTED PLATFORM.]]",
    headSize: 76,
    body: pillars(
      [
        { icon: "mail", label: "EMAIL" },
        { icon: "comment", label: "COMMUNITY" },
        { icon: "ticket", label: "TICKETS" },
        { icon: "shirt", label: "MERCH" },
        { icon: "card", label: "MEMBERSHIP" },
      ],
      { layerLabel: "CRWN OPERATING LAYER", note: "CRWN does not replace every external tool." },
    ),
    foot: { hand: "Operate the whole picture." },
  }),
);

/* 35 ----------------------------------------------------------------- */
S(35, (n) =>
  shell({
    ...base(n),
    head: "ONE OPERATING LAYER.",
    headSize: 104,
    body: pillars(
      [
        { icon: "users", label: "PEOPLE" },
        { icon: "dollar", label: "MONEY" },
        { icon: "gift", label: "OFFERS" },
        { icon: "target", label: "NEXT MOVE" },
      ],
      { note: "Other tools can still exist." },
    ),
    foot: { hand: "CRWN helps you operate across them." },
  }),
);

/* 36 ----------------------------------------------------------------- */
S(36, (n) =>
  shell({
    ...base(n),
    head: "",
    body: `${resultSlot({ label: "ESTIMATED OPPORTUNITY" })}
      <div style="margin-top:40px">${struckStack(["“NEXT MONTH”", "“GUARANTEE”"], {
        size: 50,
        cols: 2,
      })}</div>`,
    foot: { hand: "That's not what this number means.", disclaim: ESTIMATE_NOTE },
  }),
);

/* 37 ----------------------------------------------------------------- */
S(37, (n) =>
  shell({
    ...base(n),
    head: "THE OPPORTUNITY TAKES A PROCESS.",
    headSize: 90,
    body: flowChain([
      { icon: "clock", label: "TODAY" },
      { icon: "page", label: "BUILD" },
      { icon: "send", label: "LAUNCH" },
      { icon: "eye", label: "LEARN" },
      { icon: "trending", label: "GROW" },
    ]),
    foot: { hand: "Steady-state opportunity, not an immediate outcome." },
  }),
);

/* 38 ----------------------------------------------------------------- */
S(38, (n) =>
  shell({
    ...base(n),
    head: "THE RESULT DEPENDS ON [[EXECUTION.]]",
    headSize: 90,
    body: iconTiles(
      [
        { icon: "star", label: "BENEFITS" },
        { icon: "tag", label: "PRICING" },
        { icon: "users", label: "AUDIENCE" },
        { icon: "heart", label: "FAN RELATIONSHIP" },
        { icon: "send", label: "LAUNCH QUALITY" },
      ],
      { size: 46 },
    ),
    foot: { hand: "Different inputs create different outcomes." },
  }),
);

/* 39 ----------------------------------------------------------------- */
S(39, (n) =>
  shell({
    ...base(n),
    head: "YOU CAN MEASURE ATTENTION.",
    headSize: 96,
    // metricGrid shows a label and a RULE where a value would be: the sheet forbids fake numbers.
    body: `${metricGrid(["FOLLOWERS", "STREAMS", "VIEWS"])}
      <div class="midhead" style="margin-top:40px;font-size:58px">BUT DO YOU KNOW
        <span class="hand-u">WHO PAYS?</span></div>`,
    foot: null,
  }),
);

/* 40 ----------------------------------------------------------------- */
S(40, (n) =>
  shell({
    ...base(n),
    head: "THE QUESTIONS THAT BUILD THE BUSINESS.",
    headSize: 82,
    body: questionList(
      [
        "WHO [[PAYS?]]",
        "HOW MUCH DO THEY [[VALUE]] THE RELATIONSHIP?",
        "WHAT DO THEY WANT [[NEXT?]]",
        "HOW DO I DEEPEN IT [[WITHOUT GUESSING?]]",
      ],
      { size: 40 },
    ),
    foot: null,
  }),
);

/* 41 ----------------------------------------------------------------- */
S(41, (n) =>
  shell({
    ...base(n),
    head: "",
    body: `<div class="reveal">
      <div class="big">REACH CREATES THE OPPORTUNITY.</div>
      <div class="down">${arrow({ dir: "down", len: 104, color: C.goldInk, weight: 5 })}</div>
      <div class="big"><span class="g">FAN ECONOMIC DEPTH</span> TURNS OPPORTUNITY INTO A BUSINESS.</div>
    </div>`,
    foot: { hand: "Related jobs. Not the same job." },
  }),
);

/* 42 ----------------------------------------------------------------- */
S(42, (n) =>
  shell({
    ...base(n),
    head: "YOU SAW THE OPPORTUNITY. [[NOW BUILD THE OFFER.]]",
    headSize: 76,
    body: `${flowChain([
      { icon: "calculator", label: "YOUR NUMBERS" },
      { icon: "layers", label: "FOUR-TIER STARTING STRUCTURE" },
      { icon: "pen", label: "CUSTOMIZE" },
    ])}
      <div style="display:flex;justify-content:center;margin-top:40px">${ctaButton("BUILD MY MEMBERSHIP")}</div>`,
    foot: { hand: "Don't leave it as a calculator result." },
  }),
);

/* 43 ----------------------------------------------------------------- */
S(43, (n) =>
  shell({
    ...base(n),
    head: "THE AUDIENCE IS ALREADY THERE.",
    headSize: 104,
    body: `<div class="closemark"><img src="${CROWN.gold}" alt=""></div>`,
    foot: {
      hand: "Give the people who value you most somewhere to go.",
      handUnderline: "somewhere to go.",
    },
  }),
);

/* ---------------------------------------------------------------------
 * Claim safety, enforced.
 *
 * This deck's whole risk is the calculator number. Unlike VSL #4, money IS allowed here as
 * illustrative tier pricing, so the rule is not "no amounts" but "an amount never travels without
 * its qualifier". Checked at render because a missing footnote is invisible in a beautiful slide.
 * ------------------------------------------------------------------- */
const RESULT_SLIDES = [1, 36];
const MONEY = /\$\s?[\d[]/;

/**
 * What a VIEWER reads, not the markup.
 * The first draft of this guard scanned raw HTML and failed the render on slide 3, because
 * `funnel()` sizes its bars with `style="--w:83%"`. A guard that trips on CSS is worse than no
 * guard: it pressures you to change a correct slide. Strip tags first, always.
 */
const visible = (html) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .toUpperCase();

const text = (s) => visible(s.html);

for (const slide of deck.slides) {
  const t = text(slide);
  const showsMoney = MONEY.test(t);
  const qualified =
    t.includes("ESTIMATED OPPORTUNITY, NOT GUARANTEED INCOME") || t.includes("ILLUSTRATIVE");

  if (showsMoney && !qualified) {
    throw new Error(
      `vsl-calculator: slide ${slide.n} shows a money amount with no qualifier. The result is an ` +
        `estimated opportunity and tier prices are illustrative; say so on the same slide.`,
    );
  }

  // A fabricated conversion rate would be the invented benchmark the sheet forbids outright.
  if (/\d\s?%/.test(t)) {
    throw new Error(
      `vsl-calculator: slide ${slide.n} shows a percentage. This deck states no conversion rates.`,
    );
  }
}

// The number itself is per-viewer. These slides ship a slot, never a figure we made up.
for (const n of RESULT_SLIDES) {
  const slide = deck.slides.find((s) => s.n === n);
  if (!slide || !text(slide).includes("[CALCULATOR RESULT]")) {
    throw new Error(
      `vsl-calculator: slide ${n} shows the result and must use the [CALCULATOR RESULT] placeholder, ` +
        `never a baked-in number.`,
    );
  }
  if (!text(slide).includes("ESTIMATED OPPORTUNITY")) {
    throw new Error(`vsl-calculator: slide ${n} shows the result and must call it an estimate.`);
  }
}

export default deck;
