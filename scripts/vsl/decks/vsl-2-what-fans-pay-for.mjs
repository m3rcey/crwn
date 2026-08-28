// VSL #2: "What Would Your Fans Actually Pay For?"
// Headlines are the exact copy from CRWN_VSL2_Nano_Banana_Prompts.md. Em dashes in that source
// are rewritten (house rule: never an em dash in copy). No benchmark, testimonial, statistic or
// revenue claim beyond what the sheet specifies, and no fabricated CRWN UI: slide 17 is a
// labelled placeholder for the real screen recording.
import {
  shell,
  panelCompare,
  iconTiles,
  miniCards,
  chipRow,
  speechBubble,
  trapDiagram,
  demandSpectrum,
  sourceToAssets,
  venn,
  converge,
  struckStack,
  filterCards,
  miniLadder,
  progression,
  ladder,
  stepList,
  recordingSlot,
  ctaButton,
  icon,
  brush,
} from "../lib/layouts.mjs";

export const deck = {
  id: "vsl-2-what-fans-pay-for",
  label: "WHAT WOULD YOUR FANS ACTUALLY PAY FOR?",
  slides: [],
};

const S = (n, fn) => deck.slides.push({ n, html: fn(n) });
const base = (n) => ({ n, num: n, deck: deck.label });

/* 1 ------------------------------------------------------------------ */
S(1, (n) =>
  shell({
    ...base(n),
    head: "WHAT WOULD YOUR FANS [[ACTUALLY PAY FOR?]]",
    headSize: 96,
    body: chipRow(
      [
        { icon: "music", label: "Unreleased Songs" },
        { icon: "video", label: "Behind-the-Scenes" },
        { icon: "bubble", label: "Group Chat" },
        { icon: "unlock", label: "Early Access" },
        { icon: "users", label: "Meet-and-Greets" },
        { icon: "phone", label: "Monthly Calls" },
      ],
      { cols: 3 },
    ),
    foot: {
      hand: "The best place to start usually isn't asking them.",
      handUnderline: "isn't asking them.",
    },
    faint: [
      { icon: "gift", size: 200, left: 58, bottom: 180 },
      { icon: "sparkle", size: 180, right: 62, top: 380 },
    ],
  }),
);

/* 2 ------------------------------------------------------------------ */
S(2, (n) =>
  shell({
    ...base(n),
    head: "THE [[“PERKS”]] TRAP.",
    headSize: 96,
    body: trapDiagram({
      items: [
        "Exclusive Discord",
        "Birthday Shout-Outs",
        "Monthly Zoom Calls",
        "Personalized Videos",
        "Signed Merchandise",
      ],
      outcomes: [
        { title: "TOO LITTLE VALUE", sub: "Nobody cares enough to pay." },
        { title: "TOO MUCH FULFILLMENT", sub: "You accidentally create another full-time job." },
      ],
    }),
    foot: { hand: "Guessing creates both problems." },
  }),
);

/* 3 ------------------------------------------------------------------ */
S(3, (n) =>
  shell({
    ...base(n),
    head: "YOUR FANS ARE ALREADY [[LEAVING CLUES.]]",
    headSize: 88,
    body: iconTiles(
      [
        { icon: "comment", label: "ASK FOR", example: "Unreleased songs" },
        { icon: "bag", label: "BUY", example: "VIP" },
        { icon: "heart", label: "REACT TO", example: "Exclusive access" },
        { icon: "clock", label: "WAIT FOR", example: "Early drops" },
        { icon: "ticket", label: "SHOW UP FOR", example: "After-show moments" },
      ],
      { size: 48 },
    ),
    foot: {
      bold: "THESE AREN'T RANDOM MOMENTS.",
      hand: "They're evidence of demand.",
    },
  }),
);

/* 4 ------------------------------------------------------------------ */
S(4, (n) =>
  shell({
    ...base(n),
    head: "[[BEHAVIOR >]] OPINION.",
    headSize: 104,
    body: panelCompare({
      left: {
        title: "OPINION",
        body: `${speechBubble("“I'd love a monthly Q&A.”")}<div class="tag">WHAT THEY SAY</div>`,
      },
      right: {
        title: "BEHAVIOR",
        body: `<div class="trail">${miniCards(
          [
            { icon: "ticket", label: "3 VIP tickets" },
            { icon: "shirt", label: "2 merch purchases" },
            { icon: "users", label: "1 meet-and-greet" },
          ],
          { gold: true },
        )}</div><div class="tag">WHAT THEY DID</div>`,
      },
    }),
    foot: { hand: "What people do is stronger evidence than what they say." },
  }),
);

/* 5 ------------------------------------------------------------------ */
S(5, (n) =>
  shell({
    ...base(n),
    head: "DIFFERENT FANS WANT DIFFERENT THINGS.",
    headSize: 82,
    body: demandSpectrum({
      levels: ["~$10", "~$25", "Premium"],
      attributes: [
        "Access",
        "Exclusivity",
        "Earlier Access",
        "Recognition",
        "Participation",
        "Closer Relationship",
      ],
    }),
    foot: {
      hand: "Don't force every fan into one offer.",
      disclaim: "Prices are illustrative starting points, not guarantees.",
    },
  }),
);

/* 6 ------------------------------------------------------------------ */
S(6, (n) =>
  shell({
    ...base(n),
    head: "THE LADDER.",
    headSize: 104,
    body: ladder([
      { name: "BRONZE", price: "Identify", people: 30 },
      { name: "SILVER", price: "Easy paid yes", people: 15 },
      { name: "GOLD", price: "Deeper creative world", people: 7 },
      { name: "PLATINUM", price: "Deepest sustainable experience", people: 3 },
    ], { labelWidth: 330 }),
    foot: { hand: "Different levels of demand need different places to go." },
  }),
);

/* 7 ------------------------------------------------------------------ */
S(7, (n) =>
  shell({
    ...base(n),
    head: "BRONZE: THE [[FREE FRONT DOOR.]]",
    headSize: 90,
    body: `${progression([
      { name: "ANONYMOUS FOLLOWER", gain: "" },
      { name: "JOINS FREE", gain: "" },
      { name: "IDENTIFIABLE FAN", gain: "" },
    ])}
      <div style="margin-top:26px">${chipRow([
        { icon: "bell", label: "Announcements First" },
        { icon: "lock", label: "Members-Only Piece" },
        { icon: "door", label: "Reason to Join Directly" },
      ])}</div>`,
    foot: { hand: "The goal isn't revenue. It's relationship." },
  }),
);

/* 8 ------------------------------------------------------------------ */
S(8, (n) =>
  shell({
    ...base(n),
    head: "SILVER: THE [[EASIEST PAID YES.]]",
    headSize: 90,
    body: `${progression([
      { name: "FREE MEMBER", gain: "" },
      { name: "PAYING MEMBER", gain: "" },
    ])}
      <div style="margin-top:26px">${chipRow(
        [
          { icon: "unlock", label: "Early Access" },
          { icon: "lock", label: "Members-Only Content" },
          { icon: "music", label: "Unreleased Material" },
          { icon: "video", label: "Deeper Behind-the-Scenes" },
        ],
        { cols: 4 },
      )}</div>`,
    foot: { bold: "OBVIOUS VALUE.", hand: "Sustainable delivery." },
  }),
);

/* 9 ------------------------------------------------------------------ */
S(9, (n) =>
  shell({
    ...base(n),
    head: "GOLD: PACKAGE THE CREATIVE WORLD [[YOU ALREADY HAVE.]]",
    headSize: 72,
    body: sourceToAssets({
      source: { icon: "archive", label: "THE ARCHIVE" },
      assets: [
        { icon: "waveform", label: "Demos" },
        { icon: "repeat", label: "Alternate Versions" },
        { icon: "music", label: "Unreleased Songs" },
        { icon: "sliders", label: "Stems" },
        { icon: "folder", label: "Archive Material" },
        { icon: "headphones", label: "Private Listening" },
      ],
    }),
    foot: {
      hand: "Sometimes you don't need to create more.",
      bold: "You need to package what already exists.",
    },
  }),
);

/* 10 ----------------------------------------------------------------- */
S(10, (n) =>
  shell({
    ...base(n),
    head: "PLATINUM: THE [[DANGER ZONE.]]",
    headSize: 94,
    body: panelCompare({
      left: {
        title: "WHAT BREAKS",
        body: miniCards([
          { icon: "user", label: "Monthly 1-on-1s" },
          { icon: "comment", label: "Unlimited DMs" },
          { icon: "pen", label: "Custom Songs" },
          { icon: "phone", label: "Personal Calls" },
        ]),
      },
      right: {
        title: "WHAT CAN SCALE",
        body: miniCards(
          [
            { icon: "users", label: "Limited Capacity" },
            { icon: "layers", label: "Small-Group Experiences" },
            { icon: "unlock", label: "First Access" },
            { icon: "star", label: "Recognition" },
            { icon: "calendar", label: "Exclusive Events" },
            { icon: "mic", label: "One-to-Many Intimacy" },
          ],
          { gold: true },
        ),
      },
    }),
    foot: { hand: "Premium is not unlimited individual labor." },
  }),
);

/* 11 ----------------------------------------------------------------- */
S(11, (n) =>
  shell({
    ...base(n),
    head: "A GOOD OFFER HAS TO WORK FOR [[BOTH SIDES.]]",
    headSize: 80,
    body: venn({
      circles: [{ title: "FAN VALUES IT" }, { title: "ARTIST CAN KEEP DELIVERING IT" }],
      center: "GOOD OFFER",
      size: 470,
    }),
    foot: { bold: "HIGH PERCEIVED VALUE", hand: "+ sustainable delivery." },
  }),
);

/* 12 ----------------------------------------------------------------- */
S(12, (n) =>
  shell({
    ...base(n),
    head: "LOOK FOR EVIDENCE IN [[3 PLACES.]]",
    headSize: 90,
    body: venn({
      circles: [
        { title: "MONEY", sub: "What have they already paid for?" },
        { title: "ATTENTION", sub: "What gets disproportionate interest?" },
        { title: "REQUESTS", sub: "What do they ask for repeatedly?" },
      ],
      center: "STRONGEST SIGNAL",
      size: 300,
      subsBelow: true,
    }),
    foot: { hand: "When all three point to the same thing, pay attention." },
  }),
);

/* 13 ----------------------------------------------------------------- */
S(13, (n) =>
  shell({
    ...base(n),
    head: "THIS IS [[EVIDENCE.]] NOT GUESSING.",
    headSize: 90,
    body: converge({
      center: "UNRELEASED MUSIC",
      sources: [
        { kind: "REQUESTS", text: "Fans keep asking for it." },
        { kind: "ATTENTION", text: "Previews get strong engagement." },
        { kind: "MONEY", text: "Fans have paid for exclusive music before." },
      ],
    }),
    foot: {
      hand: "Three signals. One stronger hypothesis.",
      disclaim: "One artist's evidence. Yours will point somewhere of its own.",
    },
  }),
);

/* 14 ----------------------------------------------------------------- */
S(14, (n) =>
  shell({
    ...base(n),
    head: "THE WRONG QUESTIONS.",
    headSize: 104,
    body: struckStack(["WHAT SHOULD I GIVE MY FANS?", "WHAT PERKS DO THEY WANT?"], { size: 62 }),
    foot: { hand: "Still too broad." },
  }),
);

/* 15 ----------------------------------------------------------------- */
S(15, (n) =>
  shell({
    ...base(n),
    head: "",
    body: `<div class="reveal">
      <div class="lead">ASK THIS INSTEAD:</div>
      <div class="big">WHAT DO MY BEST FANS ALREADY <span class="g">PROVE THEY VALUE</span> THAT I CAN <span class="g">DELIVER REPEATEDLY</span> WITHOUT CREATING ANOTHER FULL-TIME JOB?</div>
      <div style="margin-top:6px">${brush({ width: 620, weight: 9 })}</div>
    </div>`,
    foot: { hand: "Demand. Evidence. Fulfillment." },
  }),
);

/* 16 ----------------------------------------------------------------- */
S(16, (n) =>
  shell({
    ...base(n),
    head: "RUN EVERY BENEFIT THROUGH [[3 FILTERS.]]",
    headSize: 84,
    body: `${filterCards([
      "DO THEY ALREADY VALUE IT?",
      "CAN I PROVE THAT?",
      "CAN I SUSTAINABLY DELIVER IT?",
    ])}
      ${miniLadder([
        { name: "BRONZE", sub: "Identifies" },
        { name: "SILVER", sub: "Starts recurring" },
        { name: "GOLD", sub: "Deepens" },
        { name: "PLATINUM", sub: "Serves limited superfans" },
      ])}`,
    foot: { hand: "If it passes all three, it's worth testing." },
  }),
);

/* 17 ----------------------------------------------------------------- */
S(17, (n) =>
  shell({
    ...base(n),
    head: "BUILD THE OFFER AROUND [[REAL DEMAND.]]",
    headSize: 82,
    sub: "Start with the ladder. Then customize it to fit your fans.",
    body: `<div class="ctarow">
      <div class="ctaleft">
        ${stepList([
          "Start with Bronze, Silver, Gold & Platinum",
          "Keep what matches real demand",
          "Remove what you can't sustainably deliver",
        ])}
        ${ctaButton("BUILD MY MEMBERSHIP")}
      </div>
      ${recordingSlot("REAL CRWN SCREEN RECORDING GOES HERE")}
    </div>`,
    foot: { hand: "The goal isn't more perks. It's the right value." },
  }),
);

export default deck;
