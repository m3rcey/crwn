// The main Calculator VSL, 62 slides.
// Slides 1 to 33 follow CRWN_Calculator_VSL_Nano_Banana_Prompts.md. From 34 the deck follows the
// RECORDED script instead, which reordered the assisted-launch block and added three beats the
// prompt sheet never had. Em dashes in either source are rewritten (house rule: never an em dash).
//
// THIS DECK SHOWS THE CALCULATOR RESULT, which is the one thing it must never overstate. The sheet
// says so five times: estimated opportunity, never guaranteed income; never imply every follower
// pays; never imply follower count is worthless; no invented percentages or benchmarks.
//
// Two consequences run through the whole file:
//   1. Slides 1 and 55 do NOT contain a number. The result is per-viewer, so they ship a labelled
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
  optionRow,
  crowdCompare,
  checklist,
  guaranteePanel,
  planCards,
  pathCards,
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
// The pricing slides carry their own honesty note, and the guard below asserts each one. They are
// separate because they are different kinds of claim: 35 and 36 state prices and break-evens CRWN
// charges and computes today, 42 states a founding rate plus a standard price it has not set.
const PRICING_NOTE = "Current CRWN pricing.";
const FOUNDING_NOTE = "Founding rate. The standard fee is expected, not set.";

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
    head: "TWO WAYS TO USE CRWN.",
    headSize: 104,
    body: pathCards([
      { title: "RUN IT YOURSELF", sub: "Build the offer, open payments, launch the page, operate it.", cta: "SELF-SERVE" },
      { title: "WE BUILD IT WITH YOU", sub: "We do the launch work alongside you, for artists who qualify.", cta: "ASSISTED", accent: true },
    ]),
    foot: { hand: "Same underlying system either way." },
  }),
);

/* 33 ----------------------------------------------------------------- */
S(33, (n) =>
  shell({
    ...base(n),
    head: "SELF-SERVE: [[YOU RUN IT.]]",
    headSize: 96,
    // A vertical five-item list cannot fill this frame: the fitter was already at its zoom cap and
    // the slide still read as mostly empty cream. The steps are a sequence, so they run across.
    // Four, not five: at these label lengths a fifth item wrapped to a second row and stranded
    // itself there. "Run it yourself" is the headline already, so it closes the slide instead.
    body: `${flowChain([
      { icon: "layers", label: "BUILD THE MEMBERSHIP" },
      { icon: "users", label: "CREATE YOUR ACCOUNT" },
      { icon: "card", label: "CONNECT STRIPE" },
      { icon: "send", label: "LAUNCH YOUR PAGE" },
    ])}
      <div class="midhead" style="margin-top:52px;font-size:58px">THEN
        <span class="hand-u">YOU OPERATE IT.</span></div>`,
    foot: { hand: "Nothing here waits on us." },
  }),
);

/* ---------------------------------------------------------------------
 * 34 to 50: the assisted-launch block, rebuilt 2026-08-29 against the RECORDED script.
 *
 * The first pass followed the planning document, which put the three plans immediately after the
 * self-serve path. The recording qualifies the artist for the First Revenue Launch FIRST, then
 * presents the plans to both paths at once, and adds three beats the plan never had: the two
 * break-even thresholds, the subscription-versus-implementation-fee distinction, and the shape of
 * the first 30 days.
 *
 * Every figure is checked against the repository, not transcribed. Plan prices are TIER_PRICING
 * and the fees are TIER_LIMITS.platformFeePercent. The two break-evens are DERIVED, not constants:
 * $49 / 4% = $1,225 and ($199 - $49) / 3% = $5,000, computed by proBreakEvenGmvCents() and
 * scaleBreakEvenGmvCents() in src/lib/platformTier.ts, and the script's numbers match exactly. The
 * six guarantee conditions are the six role:'required' defs in src/lib/launchPartner.ts, with 100
 * and 40 coming from GUARANTEE_MIN_CONTACTS and GUARANTEE_MIN_PROVEN_BUYERS. The implementation
 * fee remains the one figure with no constant behind it, so slide 42 keeps its hedge.
 * ------------------------------------------------------------------- */

/* 34 ----------------------------------------------------------------- */
S(34, (n) =>
  shell({
    ...base(n),
    head: "OR YOU MAY QUALIFY FOR [[SOMETHING ELSE.]]",
    headSize: 80,
    body: checklist([
      "Evidence that fans already buy from you",
      "Fan or buyer data we can actually work with",
      "Serious about executing a launch",
    ]),
    foot: { hand: "That is where we build and launch it with you." },
  }),
);

/* 35 ----------------------------------------------------------------- */
S(35, (n) =>
  shell({
    ...base(n),
    head: "THREE PLANS, EITHER WAY.",
    headSize: 96,
    // Figures verified against TIER_PRICING and TIER_LIMITS.platformFeePercent. See the guard.
    body: planCards([
      { name: "LAUNCH", price: "FREE", per: "forever", fee: "12% of sales", forWhom: "Prove the first offer." },
      { name: "PRO", price: "$49", per: "per month", fee: "8% of sales", forWhom: "Lower fee, more room.", accent: true },
      { name: "SCALE", price: "$199", per: "per month", fee: "5% of sales", forWhom: "More volume, more complexity." },
    ]),
    foot: { hand: "Build it yourself or build it with us.", disclaim: PRICING_NOTE },
  }),
);

/* 36 ----------------------------------------------------------------- */
S(36, (n) =>
  shell({
    ...base(n),
    head: "THE PLAN CHANGES WHEN [[THE MATH DOES.]]",
    headSize: 80,
    // Derived, never typed: $49 / 4% and ($199 - $49) / 3%. proBreakEvenGmvCents() and
    // scaleBreakEvenGmvCents() compute exactly these, which is why the slide may state them.
    body: `${optionRow(
      ["UNDER $1,225 A MONTH: LAUNCH", "OVER $1,225: PRO IS CHEAPER", "OVER $5,000: SCALE IS CHEAPER"],
      { size: 40 },
    )}
      <div class="midhead" style="margin-top:48px;font-size:52px">THE LOWER PERCENTAGE
        <span class="hand-u">PAYS FOR THE SUBSCRIPTION.</span></div>`,
    foot: { hand: "Monthly sales processed through CRWN.", disclaim: PRICING_NOTE },
  }),
);

/* 37 ----------------------------------------------------------------- */
S(37, (n) =>
  shell({
    ...base(n),
    head: "START WHERE THE BUSINESS [[IS TODAY.]]",
    headSize: 88,
    body: `${flowChain([
      { icon: "page", label: "LAUNCH" },
      { icon: "trending", label: "PRO" },
      { icon: "layers", label: "SCALE" },
    ])}
      <div class="midhead" style="margin-top:52px;font-size:56px">UPGRADE WHEN THE
        <span class="hand-u">MATH MAKES SENSE.</span></div>`,
    foot: { hand: "Not because a bigger plan exists." },
  }),
);

/* 38 ----------------------------------------------------------------- */
S(38, (n) =>
  shell({
    ...base(n),
    head: "",
    body: `<div class="reveal">
      <div class="big"><span class="struck">HERE IS THE SOFTWARE. GOOD LUCK.</span></div>
      <div class="down">${arrow({ dir: "down", len: 104, color: C.goldInk, weight: 5 })}</div>
      <div class="big">WE GO THROUGH THE LAUNCH <span class="g">WITH YOU.</span></div>
    </div>`,
    foot: { hand: "The First Revenue Launch." },
  }),
);

/* 39 ----------------------------------------------------------------- */
S(39, (n) =>
  shell({
    ...base(n),
    head: "WHAT WE DO WITH YOU.",
    headSize: 96,
    body: checklist(
      [
        "Consolidate the fans and buyers you have",
        "Decide which revenue model runs first",
        "Build the Bronze, Silver, Gold and Platinum tiers",
        "Organize benefits, pricing and fulfillment",
        "Import and organize your fan and buyer data",
        "Identify who should see the offer first",
        "Create the launch campaign with you",
        "Work the launch through with you",
      ],
      { cols: 2 },
    ),
    foot: { hand: "So the offer does not become impossible to deliver." },
  }),
);

/* 40 ----------------------------------------------------------------- */
S(40, (n) =>
  shell({
    ...base(n),
    head: "THE FIRST 30 DAYS.",
    headSize: 100,
    // A four-node chain alone leaves the frame half empty, the same shape slide 33 had. The fifth
    // beat closes it rather than becoming a node, because a fifth node wraps at these label widths.
    body: `${flowChain([
      { icon: "users", label: "PRIVATE LAUNCH" },
      { icon: "send", label: "WIDER AUDIENCE" },
      { icon: "gift", label: "DELIVERY" },
      { icon: "eye", label: "MEASUREMENT" },
    ])}
      <div class="midhead" style="margin-top:52px;font-size:56px">THEN THE
        <span class="hand-u">NEXT CONVERSION OPPORTUNITY.</span></div>`,
    foot: { hand: "All inside the first thirty days." },
  }),
);

/* 41 ----------------------------------------------------------------- */
S(41, (n) =>
  shell({
    ...base(n),
    head: "TWO DIFFERENT THINGS.",
    headSize: 100,
    body: panelCompare({
      left: {
        badge: "SUBSCRIPTION",
        title: "THE SOFTWARE",
        body: miniCards([{ icon: "layers", label: "What you keep operating on" }]),
      },
      right: {
        badge: "IMPLEMENTATION FEE",
        title: "THE HANDS-ON WORK",
        body: miniCards([{ icon: "check", label: "Consolidate, build, organize, migrate, launch" }], { gold: true }),
      },
      middle: "+",
    }),
    foot: { hand: "The fee is separate from the subscription." },
  }),
);

/* 42 ----------------------------------------------------------------- */
S(42, (n) =>
  shell({
    ...base(n),
    head: "THE FOUNDING RATE.",
    headSize: 104,
    body: `${panelCompare({
      left: {
        badge: "FOUNDING PARTNERS",
        title: "$0 TO $500",
        body: miniCards([{ icon: "check", label: "Plus Pro at $49 a month and 8%" }], { gold: true }),
        note: "Depending on the partnership.",
      },
      right: {
        badge: "ONCE STANDARDIZED",
        title: "$1,500 TO $3,000",
        body: miniCards([{ icon: "clock", label: "The planned standard price" }]),
        note: "Planned, not set.",
      },
    })}
      <div class="note" style="margin-top:26px;text-align:center">The founding rate is discounted because these artists help document the process, give feedback, and where it fits, become case studies.</div>`,
    foot: { hand: "Discounted on purpose.", disclaim: FOUNDING_NOTE },
  }),
);

/* 43 ----------------------------------------------------------------- */
S(43, (n) =>
  shell({
    ...base(n),
    head: "THE FIRST PAID MEMBER GUARANTEE.",
    headSize: 88,
    brushUnder: true,
    body: `<div class="midhead" style="font-size:56px">QUALIFIED FIRST REVENUE LAUNCH ARTISTS
      <span class="hand-u">RECEIVE IT TOO.</span></div>`,
    foot: { hand: "Here is exactly what it means." },
  }),
);

/* 44 ----------------------------------------------------------------- */
S(44, (n) =>
  shell({
    ...base(n),
    head: "",
    body: guaranteePanel({
      lead: "DO THE REQUIRED LAUNCH ACTIONS AND STILL GET",
      condition: "ZERO PAID MEMBERS IN 30 DAYS",
      promise: "WE REBUILD AND RELAUNCH THE OFFER WITH YOU AT NO ADDITIONAL SERVICE CHARGE.",
    }),
    foot: { hand: "Back through the offer, the benefits, the pricing, the campaign, the relaunch." },
  }),
);

/* 45 ----------------------------------------------------------------- */
S(45, (n) =>
  shell({
    ...base(n),
    head: "THAT IS [[NOT]] AN INCOME GUARANTEE.",
    headSize: 84,
    body: `${struckStack(["$10,000", "$20,000", "YOUR CALCULATOR NUMBER"], { size: 54, cols: 3 })}
      <div class="midhead" style="margin-top:44px;font-size:50px">WE GUARANTEE WE KEEP WORKING ON IT,
        <span class="hand-u">WITH NO SECOND IMPLEMENTATION FEE.</span></div>`,
    foot: { hand: "Another shot at getting the offer right.", disclaim: ESTIMATE_NOTE },
  }),
);

/* 46 ----------------------------------------------------------------- */
S(46, (n) =>
  shell({
    ...base(n),
    head: "IT COVERS AN [[EXECUTED LAUNCH.]]",
    headSize: 84,
    // These six are the `role: 'required'` conditions in src/lib/launchPartner.ts, in order.
    body: checklist(
      [
        "Stripe connected",
        "Free front door live",
        "At least one paid tier purchasable",
        "100 imported contacts, or 40 proven buyers",
        "Welcome post published",
        "Launch campaign actually sent",
      ],
      { cols: 2 },
    ),
    foot: { hand: "Not an account that was created and never launched." },
  }),
);

/* 47 ----------------------------------------------------------------- */
S(47, (n) =>
  shell({
    ...base(n),
    head: "THE ASSISTED LAUNCH IS [[NOT FOR EVERYBODY.]]",
    headSize: 74,
    body: checklist(
      [
        "Fans have already bought directly from you",
        "An audience or buyer list we can work with",
        "You can fulfill the offer",
        "You control your brand and your fan offers",
        "You are willing to execute the launch",
      ],
      { cols: 1 },
    ),
    foot: { hand: "Five things, all of them evidence." },
  }),
);

/* 48 ----------------------------------------------------------------- */
S(48, (n) =>
  shell({
    ...base(n),
    head: "EVIDENCE BEATS [[FOLLOWER COUNT.]]",
    headSize: 88,
    body: crowdCompare({
      left: { count: 60, label: "A MILLION PASSIVE FOLLOWERS", items: ["Never sold to directly"] },
      right: { count: 7, label: "A SMALLER AUDIENCE WITH REAL BUYERS", items: ["A much stronger fit"] },
      middle: "can lose to",
    }),
    foot: { hand: "We care about demand, not the number." },
  }),
);

/* 49 ----------------------------------------------------------------- */
S(49, (n) =>
  shell({
    ...base(n),
    head: "SOUNDS LIKE YOU?",
    headSize: 108,
    body: pathCards([
      { title: "REQUEST A CALL", sub: "We look at what you already have and see whether it makes sense.", cta: "BUILD IT WITH US", accent: true },
      { title: "OR DO IT YOURSELF", sub: "Nothing is locked away. Build it and launch it on your own.", cta: "SELF-SERVE" },
    ]),
    foot: { hand: "If you do not qualify, the app is still yours." },
  }),
);

/* 50 ----------------------------------------------------------------- */
S(50, (n) =>
  shell({
    ...base(n),
    head: "EITHER PATH, [[THE SAME NEXT STEP.]]",
    headSize: 84,
    body: `<div class="midhead" style="font-size:56px">DON'T LEAVE THIS AS A
        <span class="hand-u">CALCULATOR RESULT.</span></div>
      <div style="display:flex;justify-content:center;margin-top:48px">${ctaButton("BUILD MY MEMBERSHIP")}</div>`,
    foot: { hand: "Turn the opportunity into an actual offer." },
  }),
);

/* 51 ----------------------------------------------------------------- */
S(51, (n) =>
  shell({
    ...base(n),
    head: "“I DON'T HAVE TIME TO BUILD ANOTHER BUSINESS.”",
    headSize: 82,
    body: `<div class="midhead" style="font-size:62px">You shouldn't have to.</div>`,
    foot: { hand: "The offer should create leverage, not another job." },
  }),
);

/* 52 ----------------------------------------------------------------- */
S(52, (n) =>
  shell({
    ...base(n),
    head: "BUILD THE SMALLEST OFFER THAT [[CREATES DEPTH.]]",
    headSize: 76,
    body: `${struckStack(["20 BENEFITS", "POST EVERY DAY", "UNLIMITED ACCESS"], { size: 46, cols: 3 })}
      <div style="margin-top:44px" class="midhead">A FEW VALUABLE, SUSTAINABLE PROMISES</div>`,
    foot: { hand: "Keep what makes sense. Delete what doesn't." },
  }),
);

/* 53 ----------------------------------------------------------------- */
S(53, (n) =>
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

/* 54 ----------------------------------------------------------------- */
S(54, (n) =>
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

/* 55 ----------------------------------------------------------------- */
S(55, (n) =>
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

/* 56 ----------------------------------------------------------------- */
S(56, (n) =>
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

/* 57 ----------------------------------------------------------------- */
S(57, (n) =>
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

/* 58 ----------------------------------------------------------------- */
S(58, (n) =>
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

/* 59 ----------------------------------------------------------------- */
S(59, (n) =>
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

/* 60 ----------------------------------------------------------------- */
S(60, (n) =>
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

/* 61 ----------------------------------------------------------------- */
S(61, (n) =>
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

/* 62 ----------------------------------------------------------------- */
S(62, (n) =>
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
const RESULT_SLIDES = [1, 55];
const MONEY = /\$\s?[\d[]/;

/**
 * Slides stating REAL CRWN money rather than an illustrative example, each with the note it must
 * carry. Added 2026-08-29 with the assisted-launch block. The first rule of this file was "an
 * amount never travels without its qualifier", and that still holds: what changed is that
 * "illustrative" is the wrong qualifier for a price CRWN actually charges. Saying a real price is
 * illustrative would be the more misleading of the two.
 */
const PRICING_NOTES = {
  35: PRICING_NOTE,
  36: PRICING_NOTE,
  42: FOUNDING_NOTE,
};

/**
 * The only percentages this deck may show, and the only slide that may show them.
 * Mirrors TIER_LIMITS.platformFeePercent in src/lib/platformTier.ts, which is the single source of
 * truth for the platform fee. A percentage anywhere else is still refused outright, because the
 * original reason for that rule was a fabricated conversion rate, and that reason is unchanged.
 */
const PLAN_FEES = ["12", "8", "5"];
const FEE_SLIDES = [35, 42];

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
  const pricingNote = PRICING_NOTES[slide.n];
  const qualified =
    t.includes("ESTIMATED OPPORTUNITY, NOT GUARANTEED INCOME") ||
    t.includes("ILLUSTRATIVE") ||
    (pricingNote && t.includes(pricingNote.toUpperCase()));

  if (showsMoney && !qualified) {
    throw new Error(
      `vsl-calculator: slide ${slide.n} shows a money amount with no qualifier. The result is an ` +
        `estimated opportunity and tier prices are illustrative; say so on the same slide. A slide ` +
        `stating real CRWN pricing instead needs its own note in PRICING_NOTES.`,
    );
  }

  // A pricing slide has to carry ITS note, not merely some qualifier: the founding implementation
  // fee and the plan prices are different claims and the honest hedge differs.
  if (pricingNote && !t.includes(pricingNote.toUpperCase())) {
    throw new Error(
      `vsl-calculator: slide ${slide.n} states real CRWN pricing and must carry its note: ` +
        `"${pricingNote}".`,
    );
  }

  // A fabricated conversion rate would be the invented benchmark the sheet forbids outright.
  // The platform fee is the one exception, because it is a real published rate, and it is checked
  // against PLAN_FEES rather than merely allowed.
  const pcts = [...t.matchAll(/(\d+)\s?%/g)].map((m) => m[1]);
  if (pcts.length && !FEE_SLIDES.includes(slide.n)) {
    throw new Error(
      `vsl-calculator: slide ${slide.n} shows a percentage. This deck states no conversion rates; ` +
        `only the plan-fee slide may show one.`,
    );
  }
  const wrong = pcts.filter((v) => !PLAN_FEES.includes(v));
  if (wrong.length) {
    throw new Error(
      `vsl-calculator: slide ${slide.n} shows ${wrong.join(", ")}% which is not a CRWN plan fee. ` +
        `TIER_LIMITS.platformFeePercent is the source of truth (${PLAN_FEES.join(", ")}).`,
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
