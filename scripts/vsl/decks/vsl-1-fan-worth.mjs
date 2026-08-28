// VSL #1: "How Much Is One Real Fan Actually Worth?"
// Headlines are the exact copy from CRWN_VSL1_Nano_Banana_Prompts.md. Em dashes in that source
// are rewritten (house rule: never an em dash in copy), and nothing here states a benchmark,
// a conversion rate or a revenue claim the prompt sheet did not specify.
import {
  shell,
  optionRow,
  panelCompare,
  iconTiles,
  miniCards,
  audienceField,
  spectrum,
  additivePath,
  mathRows,
  ladder,
  funnel,
  progression,
  struckNumbers,
  nestedMap,
  stepList,
  recordingSlot,
  ctaButton,
  icon,
  arrow,
  brush,
} from "../lib/layouts.mjs";
import { PALETTE as C } from "../lib/theme.mjs";

export const deck = {
  id: "vsl-1-fan-worth",
  label: "HOW MUCH IS ONE REAL FAN WORTH?",
  slides: [],
};

const S = (n, fn) => deck.slides.push({ n, html: fn(n) });

/* 1 ------------------------------------------------------------------ */
S(1, (n) =>
  shell({
    n,
    num: n,
    deck: deck.label,
    head: "HOW MUCH IS ONE [[REAL FAN]] ACTUALLY WORTH?",
    headSize: 104,
    body: `${optionRow(["$0.10?", "$10?", "$100?", "$1,000?"])}
      <div style="display:flex;justify-content:center;margin-top:10px">${brush({ width: 900, weight: 9 })}</div>`,
    foot: { hand: "The obvious way to calculate it is wrong.", handUnderline: "wrong." },
    faint: [
      { icon: "calculator", size: 230, left: 66, top: 430 },
      { icon: "dollar", size: 180, right: 128, top: 392 },
      { icon: "chart", size: 210, right: 110, bottom: 150 },
    ],
  }),
);

/* 2 ------------------------------------------------------------------ */
S(2, (n) =>
  shell({
    n,
    num: n,
    deck: deck.label,
    head: "THEY BOTH COUNT AS [[1 FOLLOWER.]]",
    headSize: 88,
    body: panelCompare({
      left: {
        title: "CASUAL FOLLOWER",
        body: `<div class="pair">${icon("user", 96)}${icon("video", 60)}</div>`,
        note: "Watched one Reel.",
      },
      middle: "=",
      right: {
        title: "DEEPER FAN",
        body: `<div class="pair">${icon("user", 96)}</div>
          <div class="buys">
            <div class="buy">${icon("ticket", 30)}<span>3 tickets</span></div>
            <div class="buy">${icon("shirt", 30)}<span>2 hoodies</span></div>
            <div class="buy">${icon("disc", 30)}<span>vinyl</span></div>
            <div class="buy">${icon("music", 30)}<span>unreleased music</span></div>
          </div>`,
      },
    }),
    foot: {
      hand: "Economically, they're completely different.",
      handUnderline: "completely different.",
    },
    faint: [
      { icon: "thumbsUp", size: 190, left: 54, bottom: 210 },
      { icon: "bag", size: 180, right: 60, bottom: 200 },
    ],
  }),
);

/* 3 ------------------------------------------------------------------ */
S(3, (n) =>
  shell({
    n,
    num: n,
    deck: deck.label,
    head: "YOU CAN SEE [[ATTENTION.]]",
    headSize: 100,
    brushUnder: 430,
    brushOffset: 292,
    body: iconTiles([
      { icon: "users", label: "FOLLOWERS" },
      { icon: "headphones", label: "MONTHLY LISTENERS" },
      { icon: "waveform", label: "STREAMS" },
      { icon: "eye", label: "VIEWS" },
      { icon: "heart", label: "LIKES" },
      { icon: "comment", label: "COMMENTS" },
      { icon: "share", label: "SHARES" },
    ]),
    foot: { hand: "But can you see economic depth?", handUnderline: "economic depth?" },
    faint: [
      { icon: "card", size: 200, left: 60, bottom: 190 },
      { icon: "eye", size: 200, right: 66, bottom: 190 },
    ],
  }),
);

/* 4 ------------------------------------------------------------------ */
S(4, (n) =>
  shell({
    n,
    num: n,
    deck: deck.label,
    head: "500,000 FOLLOWERS.",
    headSize: 96,
    sub: "But what's hidden inside that number?",
    subHand: true,
    body: audienceField({
      rows: 13,
      cols: 46,
      groups: [
        { left: 4, top: 8, w: 11, h: 26, label: "500: would buy almost anything" },
        { left: 38, top: 46, w: 17, h: 34, label: "5,000: have bought before" },
        { left: 72, top: 12, w: 22, h: 30, label: "20,000: might buy the right offer" },
      ],
    }),
    foot: {
      bold: "THE BIG NUMBER DOESN'T TELL YOU [[WHO IS WHO]].",
      disclaim: "Illustrative example.",
    },
  }),
);

/* 5 ------------------------------------------------------------------ */
S(5, (n) =>
  shell({
    n,
    num: n,
    deck: deck.label,
    head: "SAME FOLLOWER COUNT.\n[[COMPLETELY DIFFERENT BUSINESS.]]",
    headSize: 74,
    body: panelCompare({
      left: {
        badge: "500K FOLLOWERS",
        title: "ARTIST A",
        body: miniCards([
          { icon: "waveform", label: "Streams" },
          { icon: "shirt", label: "Merch drops" },
          { icon: "ticket", label: "Tickets" },
        ]),
        note: "Same few ways to support.",
      },
      right: {
        badge: "500K FOLLOWERS",
        title: "ARTIST B",
        body: miniCards(
          [
            { icon: "bag", label: "Knows who bought" },
            { icon: "repeat", label: "Knows repeat buyers" },
            { icon: "userPlus", label: "Knows who joined" },
            { icon: "layers", label: "Gives fans ways to go deeper" },
          ],
          { gold: true },
        ),
        note: "Can see the relationships inside the audience.",
      },
    }),
    foot: { bold: "The difference isn't audience size.", hand: "It's what you can see and offer." },
  }),
);

/* 6 ------------------------------------------------------------------ */
S(6, (n) =>
  shell({
    n,
    num: n,
    deck: deck.label,
    head: "DIFFERENT FANS. DIFFERENT DEMAND.",
    headSize: 86,
    body: `<div class="hand" style="text-align:center;font-size:42px;margin-bottom:-6px">More depth can support more value.</div>
      ${spectrum([
        "Listen",
        "Updates",
        "Unreleased music",
        "Early access",
        "Recognition",
        "Participate",
        "Exclusive experience",
      ])}`,
    foot: { disclaim: "Not every fan wants the same relationship." },
  }),
);

/* 7 ------------------------------------------------------------------ */
S(7, (n) =>
  shell({
    n,
    num: n,
    deck: deck.label,
    head: "A $40 PURCHASE DOESN'T MEAN A [[$40 FAN.]]",
    headSize: 84,
    body: additivePath({
      start: { icon: "shirt", label: "$40 hoodie" },
      adds: [
        { icon: "ticket", label: "+$75 ticket" },
        { icon: "card", label: "+$10/mo membership" },
        { icon: "star", label: "+premium experience" },
      ],
    }),
    foot: {
      hand: "A transaction is evidence, not the endpoint.",
      handUnderline: "evidence.",
      small:
        "One purchase tells you what happened once. It doesn't tell you the full depth of demand.",
    },
  }),
);

/* 8 ------------------------------------------------------------------ */
S(8, (n) =>
  shell({
    n,
    num: n,
    deck: deck.label,
    head: "[[TIME]] CHANGES THE MATH.",
    headSize: 96,
    body: mathRows([{ eq: "$10/mo × 12 = [[$120]]" }, { eq: "$25/mo × 12 = [[$300]]" }]),
    foot: {
      hand: "How much value can we exchange over the life of this relationship?",
      disclaim: "Examples only. Not predictions.",
    },
  }),
);

/* 9 ------------------------------------------------------------------ */
S(9, (n) =>
  shell({
    n,
    num: n,
    deck: deck.label,
    head: "THE LADDER.",
    headSize: 104,
    body: ladder([
      { name: "BRONZE", price: "Free", people: 30 },
      { name: "SILVER", price: "~$10/mo", people: 15 },
      { name: "GOLD", price: "~$25/mo", people: 7 },
      { name: "PLATINUM", price: "~$100/mo", people: 3 },
    ]),
    foot: {
      hand: "Different levels of demand need different places to go.",
      disclaim: "Names, prices, and benefits can be customized.",
    },
  }),
);

/* 10 ----------------------------------------------------------------- */
S(10, (n) =>
  shell({
    n,
    num: n,
    deck: deck.label,
    head: "THE CALCULATOR [[DOESN'T]] ASSUME [[EVERYONE]] PAYS.",
    headSize: 80,
    body: funnel(
      [
        { label: "LARGE AUDIENCE" },
        { label: "REACHABLE", note: "smaller" },
        { label: "PAYING", note: "smaller again" },
        { label: "DIFFERENT SPEND LEVELS", note: "different demand" },
      ],
      { split: ["LOWER", "MIDDLE", "PREMIUM"] },
    ),
    foot: { bold: "Reach creates the opportunity.", hand: "Depth changes the economics." },
  }),
);

/* 11 ----------------------------------------------------------------- */
S(11, (n) =>
  shell({
    n,
    num: n,
    deck: deck.label,
    head: "ATTENTION BECOMES MORE USEFUL WHEN THE\nRELATIONSHIP BECOMES [[IDENTIFIABLE.]]",
    headSize: 64,
    body: progression([
      { name: "ANONYMOUS STREAMER", gain: "Attention" },
      { name: "FREE MEMBER", gain: "Identity" },
      { name: "BUYER", gain: "Purchase evidence" },
      { name: "REPEAT BUYER", gain: "Pattern" },
    ]),
    foot: { hand: "More evidence. More understanding." },
  }),
);

/* 12 ----------------------------------------------------------------- */
S(12, (n) =>
  shell({
    n,
    num: n,
    deck: deck.label,
    head: "THERE ISN'T ONE MAGIC NUMBER.",
    headSize: 104,
    body: struckNumbers(["$20?", "$100?", "$500?"]),
    foot: {
      hand: "That's the trap.",
      small: "One average flattens completely different relationships into one number.",
    },
  }),
);

/* 13 ----------------------------------------------------------------- */
S(13, (n) =>
  shell({
    n,
    num: n,
    deck: deck.label,
    head: "",
    body: `<div class="reveal">
      <div class="lead">STOP ASKING:</div>
      <div class="big old"><span class="struck">WHAT IS MY AVERAGE FOLLOWER WORTH?</span></div>
      <div class="down">${arrow({ dir: "down", len: 108, color: C.goldInk, weight: 5 })}</div>
      <div class="lead">ASK INSTEAD:</div>
      <div class="big">HOW <span class="g">ECONOMICALLY DEEP</span> IS THE<br><span class="g">IDENTIFIABLE CORE</span> OF MY AUDIENCE?</div>
    </div>`,
    foot: { hand: "You don't need one average. You need a map." },
  }),
);

/* 14 ----------------------------------------------------------------- */
S(14, (n) =>
  shell({
    n,
    num: n,
    deck: deck.label,
    head: "YOU DON'T NEED ONE AVERAGE. YOU NEED [[A MAP.]]",
    headSize: 78,
    body: nestedMap({
      groups: ["ATTENTION", "IDENTIFIED", "BUYERS", "REPEAT BUYERS", "DEEPEST FANS"],
      questions: [
        "How many?",
        "What do they spend?",
        "How long do they stay?",
        "What do they value?",
        "What do they want next?",
      ],
    }),
    foot: { hand: "This is economic depth." },
  }),
);

/* 15 ----------------------------------------------------------------- */
S(15, (n) =>
  shell({
    n,
    num: n,
    deck: deck.label,
    head: "FROM AUDIENCE → [[FAN ECONOMY.]]",
    headSize: 92,
    body: `<div class="ba">
      <div class="ba-left">
        <div class="ba-big">500K<br>FOLLOWERS</div>
        <div class="ba-cap">One big audience number.</div>
      </div>
      <div class="ba-grid">
        ${[
          ["bag", "Who buys"],
          ["repeat", "Who buys repeatedly"],
          ["heart", "What they value"],
          ["dollar", "What they pay"],
          ["calendar", "What you promised"],
          ["target", "What to do next"],
        ]
          .map(
            ([ic, lb]) =>
              `<div class="mini gold">${icon(ic, 26)}<span>${lb}</span></div>`,
          )
          .join("")}
      </div>
    </div>`,
    foot: {
      bold: "An audience tells you who is paying attention.",
      hand: "A fan economy helps you understand the relationships inside it.",
    },
  }),
);

/* 16 ----------------------------------------------------------------- */
S(16, (n) =>
  shell({
    n,
    num: n,
    deck: deck.label,
    head: "YOU ALREADY TOOK THE FIRST STEP.",
    headSize: 82,
    sub: "Now turn the opportunity into an actual offer.",
    body: `<div class="ctarow">
      <div class="ctaleft">
        ${stepList([
          "Review your calculator result",
          "Build Bronze, Silver, Gold & Platinum",
          "Customize the offer to fit your fans",
        ])}
        ${ctaButton("BUILD MY MEMBERSHIP")}
      </div>
      ${recordingSlot("REAL CRWN SCREEN RECORDING GOES HERE")}
    </div>`,
    foot: { hand: "Give the people who value you most somewhere to go." },
  }),
);

export default deck;
