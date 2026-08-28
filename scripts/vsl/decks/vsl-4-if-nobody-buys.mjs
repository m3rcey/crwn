// VSL #4: "What Happens If Nobody Buys?"
// Headlines are the exact copy from CRWN_VSL4_Nano_Banana_Prompts.md. Em dashes in that source
// are rewritten (house rule: never an em dash in copy). No screen recording anywhere in this deck,
// per the sheet, and no fabricated CRWN UI: slide 7's result card is deliberately a plain card.
//
// THIS DECK MAKES A COMMERCIAL PROMISE, so its copy was verified against the product rather than
// transcribed. The First Paid Member Guarantee is real and codified:
//   - src/lib/launchPartner.ts holds the SIX required conditions; slide 14 lists exactly those.
//   - The guarantee window is 30 days from `guarantee_eligible_on`, stamped once every required
//     condition is observed met (docs/crwn-brain/21-MONEY-MODEL-MEASUREMENT.md). So "complete the
//     launch, then 30 days" is accurate: the clock starts at completion, not at signup.
//   - CRWN's own ratified wording is "It covers the rebuild and relaunch, not a specific income
//     result" (CHANGELOG, 2026-08-13). The slides say the same thing in the sheet's words.
// The assertions at the bottom of this file enforce what a person checks badly: that the reveal is
// withheld, that the qualifier travels with the promise, and that no income figure appears.
import {
  shell,
  centerpiece,
  flowChain,
  branchOut,
  blockedLeap,
  checklist,
  guaranteePanel,
  pathCards,
  filterCards,
  struckStack,
  iconTiles,
  icon,
  arrow,
} from "../lib/layouts.mjs";
import { PALETTE as C } from "../lib/theme.mjs";

export const deck = {
  id: "vsl-4-if-nobody-buys",
  label: "WHAT HAPPENS IF NOBODY BUYS?",
  slides: [],
};

const S = (n, fn) => deck.slides.push({ n, html: fn(n) });
const base = (n) => ({ n, num: n, deck: deck.label });

/* 1 ------------------------------------------------------------------ */
S(1, (n) =>
  shell({
    ...base(n),
    head: "WHAT IF NOBODY BUYS?",
    headSize: 108,
    body: centerpiece({ big: "0 [[PAID MEMBERS]]", plain: true }),
    foot: {
      hand: "This is the part nobody likes talking about.",
      handUnderline: "nobody likes talking about.",
    },
  }),
);

/* 2 ------------------------------------------------------------------ */
S(2, (n) =>
  shell({
    ...base(n),
    head: "THIS IS THE FEAR BEHIND THE LAUNCH.",
    headSize: 86,
    body: flowChain(
      [
        { icon: "mic", label: "ARTIST" },
        { icon: "gift", label: "OFFER" },
        { icon: "users", label: "AUDIENCE" },
        { icon: "bell", label: "SILENCE" },
      ],
      { endMuted: "0 purchases" },
    ),
    foot: { hand: "You put it out... and nothing happens." },
  }),
);

/* 3 ------------------------------------------------------------------ */
S(3, (n) =>
  shell({
    ...base(n),
    head: "0 SALES ≠ [[ONE ANSWER.]]",
    headSize: 100,
    body: branchOut({
      center: "0 SALES",
      items: ["OFFER", "BENEFITS", "PRICING", "MESSAGE", "AUDIENCE", "EXECUTION"],
    }),
    foot: {
      hand: "The result tells you something is wrong. Not necessarily what.",
      handUnderline: "Not necessarily what.",
    },
  }),
);

/* 4 ------------------------------------------------------------------ */
S(4, (n) =>
  shell({
    ...base(n),
    head: "DON'T TURN ONE FAILED LAUNCH INTO A [[BUSINESS CONCLUSION.]]",
    headSize: 74,
    body: blockedLeap({
      from: "“Nobody bought.”",
      to: "“My fans will never pay.”",
    }),
    foot: { hand: "That conclusion is too big for the evidence." },
  }),
);

/* 5 ------------------------------------------------------------------ */
S(5, (n) =>
  shell({
    ...base(n),
    head: "A FAILED FIRST VERSION SHOULD CREATE A [[DIAGNOSIS.]]",
    headSize: 76,
    body: flowChain([
      { icon: "send", label: "LAUNCH" },
      { icon: "chart", label: "EVIDENCE" },
      { icon: "question", label: "DIAGNOSE" },
      { icon: "sliders", label: "CHANGE" },
      { icon: "repeat", label: "RELAUNCH" },
    ]),
    foot: { hand: "Don't just post harder.", handUnderline: "post harder." },
  }),
);

/* 6 ------------------------------------------------------------------ */
S(6, (n) =>
  shell({
    ...base(n),
    head: "FIND THE BREAK.",
    headSize: 104,
    body: iconTiles(
      [
        { icon: "eye", label: "WHO SAW IT?" },
        { icon: "page", label: "WHAT DID THEY SEE?" },
        { icon: "question", label: "WHAT DID THEY UNDERSTAND?" },
        { icon: "alert", label: "WHAT STOPPED THEM?" },
        { icon: "send", label: "DID THE LAUNCH ACTUALLY HAPPEN?" },
      ],
      { size: 46, rail: true },
    ),
    foot: { hand: "Find the weak link before changing everything." },
  }),
);

/* 7 ------------------------------------------------------------------ */
S(7, (n) =>
  shell({
    ...base(n),
    head: "SOFTWARE CAN SHOW YOU THE RESULT.",
    headSize: 78,
    // A plain card, never a mock of CRWN. The sheet forbids fabricated product UI outright.
    body: `<div class="resultcard"><div class="rc-n">0</div><div class="rc-l">PAID MEMBERS</div></div>
      <div class="midhead" style="margin-top:34px">A LAUNCH PARTNER HELPS YOU RESPOND TO IT.</div>
      <div style="margin-top:26px">${flowChain([
        { icon: "question", label: "DIAGNOSE" },
        { icon: "pen", label: "REVISE" },
        { icon: "repeat", label: "RELAUNCH" },
      ])}</div>`,
    foot: { hand: "The number is only the beginning." },
  }),
);

/* 8 ------------------------------------------------------------------ */
S(8, (n) =>
  shell({
    ...base(n),
    head: "FIRST, THE LAUNCH HAS TO [[ACTUALLY HAPPEN.]]",
    headSize: 82,
    body: checklist(["OFFER LIVE", "PAYMENTS READY", "AUDIENCE READY", "MESSAGE SENT"], { cols: 2 }),
    foot: { hand: "You can't diagnose a launch that never happened." },
  }),
);

/* 9 ------------------------------------------------------------------ */
S(9, (n) =>
  shell({
    ...base(n),
    head: "THE FIRST TARGET IS [[SMALLER THAN YOU THINK.]]",
    headSize: 80,
    body: centerpiece({
      big: "1 PAID MEMBER",
      sub: "within 30 days",
      around: ["Real checkout", "Real offer", "Real buyer", "Real transaction"],
    }),
    foot: { hand: "One real transaction proves the system can convert." },
  }),
);

/* 10 ----------------------------------------------------------------- */
S(10, (n) =>
  shell({
    ...base(n),
    head: "SO WHAT DOES CRWN DO IF THAT NUMBER IS STILL ZERO?",
    headSize: 76,
    // The answer is withheld for one more slide. Nothing here names the guarantee.
    body: `${centerpiece({ big: "0", plain: true, size: 210 })}
      <div style="margin-top:30px">${struckStack(
        ["“Good luck.”", "“Try posting again.”", "“Pay us another implementation fee.”"],
        { size: 46 },
      )}</div>`,
    foot: { hand: "None of those." },
  }),
);

/* 11 ----------------------------------------------------------------- */
S(11, (n) =>
  shell({
    ...base(n),
    head: "FIRST PAID MEMBER [[GUARANTEE.]]",
    headSize: 100,
    body: guaranteePanel({
      lead: "Complete the launch. Get at least one paid member within 30 days.",
      condition: "IF YOU DON'T:",
      promise: "WE REBUILD + RELAUNCH WITH YOU AT NO ADDITIONAL SERVICE CHARGE.",
    }),
    foot: { disclaim: "Not an income guarantee." },
  }),
);

/* 12 ----------------------------------------------------------------- */
S(12, (n) =>
  shell({
    ...base(n),
    head: "WE DON'T JUST TELL YOU TO [[TRY AGAIN.]]",
    headSize: 86,
    body: filterCards([
      "RE-AUDIT THE OFFER",
      "REVISE BENEFITS + PRICING",
      "REWRITE THE CAMPAIGN",
      "SUPPORT THE RELAUNCH",
    ]),
    foot: { hand: "Fix the system, then take another shot." },
  }),
);

/* 13 ----------------------------------------------------------------- */
S(13, (n) =>
  shell({
    ...base(n),
    head: "WHAT THIS DOES [[NOT]] GUARANTEE.",
    headSize: 94,
    body: `${struckStack(["$10K", "$20K", "CALCULATOR ESTIMATE", "ANY SPECIFIC INCOME"], {
      size: 44,
      cols: 2,
    })}
      <div style="margin-top:36px" class="foot-bold">IT GUARANTEES ANOTHER SHOT AT GETTING THE OFFER RIGHT</div>
      <div class="midhead" style="margin-top:12px">WITHOUT ANOTHER SERVICE CHARGE.</div>`,
    foot: { disclaim: "The guarantee is not an income guarantee." },
  }),
);

/* 14 ----------------------------------------------------------------- */
S(14, (n) =>
  shell({
    ...base(n),
    head: "THE GUARANTEE ONLY WORKS IF THE LAUNCH [[ACTUALLY HAPPENS.]]",
    headSize: 68,
    // These six are the `role: 'required'` conditions in src/lib/launchPartner.ts, verbatim.
    // If that list ever changes, this slide is wrong and must change with it.
    body: checklist(
      [
        "STRIPE CONNECTED",
        "FREE FRONT DOOR LIVE",
        "PAID TIER PURCHASABLE",
        "100 IMPORTED CONTACTS OR 40 PROVEN BUYERS",
        "WELCOME POST PUBLISHED",
        "LAUNCH CAMPAIGN SENT",
      ],
      { cols: 2 },
    ),
    foot: { hand: "We guarantee an executed launch. Not an unused account." },
  }),
);

/* 15 ----------------------------------------------------------------- */
S(15, (n) =>
  shell({
    ...base(n),
    head: "THE FIRST REVENUE LAUNCH [[ISN'T FOR EVERYONE.]]",
    headSize: 80,
    body: `${checklist(
      [
        "Already sold directly to fans",
        "Exportable fan or buyer list",
        "Can fulfill the offer",
        "Control your fan offers",
        "Willing to execute the launch",
      ],
      { cols: 2 },
    )}
      <div class="fitbox">
        <div class="fit-lb">STRONGEST FIT</div>
        <div class="fit-tx">Established artists with meaningful existing audience, catalog, and engagement.</div>
      </div>`,
    foot: { hand: "The assisted launch is for artists with something real to build on." },
  }),
);

/* 16 ----------------------------------------------------------------- */
S(16, (n) =>
  shell({
    ...base(n),
    head: "",
    body: `<div class="reveal">
      <div class="big old">THE GOAL ISN'T TO REMOVE THE RISK OF LAUNCHING.</div>
      <div class="down">${arrow({ dir: "down", len: 96, color: C.goldInk, weight: 5 })}</div>
      <div class="big">IT'S TO REMOVE THE RISK OF <span class="g">BEING LEFT ALONE</span> IF VERSION 1 FAILS.</div>
      <div style="margin-top:34px">${flowChain([
        { icon: "page", label: "VERSION 1" },
        { icon: "eye", label: "LEARN" },
        { icon: "sparkle", label: "VERSION 2" },
      ])}</div>
    </div>`,
    foot: { hand: "Failure becomes feedback." },
  }),
);

/* 17 ----------------------------------------------------------------- */
S(17, (n) =>
  shell({
    ...base(n),
    head: "READY TO LAUNCH?",
    headSize: 104,
    body: pathCards([
      {
        title: "BUILD IT YOURSELF",
        sub: "Use the CRWN app to build and launch your membership.",
        cta: "BUILD MY MEMBERSHIP",
      },
      {
        title: "FIRST REVENUE LAUNCH",
        sub: "Qualified artists can work with us to build and launch it together.",
        cta: "REQUEST A CALL",
        accent: true,
      },
    ]),
    foot: { hand: "Either way, start with the offer." },
  }),
);

/* ---------------------------------------------------------------------
 * Claim safety, enforced.
 *
 * This deck sells a guarantee, so the three things a person checks badly are checked here:
 * the reveal stays withheld, the qualifier never travels without the promise, and no income
 * figure appears outside the slide whose entire job is to cross those figures out.
 * ------------------------------------------------------------------- */
const REVEAL_SLIDE = 11;
const QUALIFIER = "NOT AN INCOME GUARANTEE";
/** Only slide 13 may show a money amount, and only struck through as what is NOT promised. */
const MONEY_ALLOWED_ON = 13;

const text = (s) => s.html.toUpperCase();

for (const slide of deck.slides) {
  const t = text(slide);

  if (slide.n < REVEAL_SLIDE && t.includes("GUARANTEE")) {
    throw new Error(
      `vsl-4: slide ${slide.n} names the guarantee before slide ${REVEAL_SLIDE}. ` +
        `The sheet withholds it until the reveal; rewrite the slide, not the check.`,
    );
  }

  // A money amount anywhere else would read as an income promise the guarantee does not make.
  if (slide.n !== MONEY_ALLOWED_ON && /\$\s?[\d]/.test(slide.html)) {
    throw new Error(
      `vsl-4: slide ${slide.n} shows a money amount. This deck guarantees a rebuild and relaunch, ` +
        `never an income result, so a figure may appear only on slide ${MONEY_ALLOWED_ON}, struck out.`,
    );
  }
}

// The promise and its limit ship together or not at all.
for (const n of [11, 13]) {
  const slide = deck.slides.find((s) => s.n === n);
  if (!slide || !text(slide).includes(QUALIFIER)) {
    throw new Error(
      `vsl-4: slide ${n} states the guarantee and must carry "${QUALIFIER}" on the same slide.`,
    );
  }
}

export default deck;
