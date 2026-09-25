// Authored beat plan: Fan Economy 23, Smino, "the promise you forgot".
// First real talking-head reel (landscape source, 2026-09-24). Every beat is anchored to a
// spoken word (P.w(line, word)), so it re-resolves on any re-cut. Line numbers are the
// script's lines (videos/scripts/fan-economy/23-smino-the-promise-you-forgot.md).
//
// Treatments: full = portrait crop of the landscape source; punch = tighter; split = the
// speaker in the lower part, a graphic above; band = a wide crop across the middle with a
// headline above; hidden = full-screen graphic.

export default async function plan(P) {
  const { w, lineStart, has } = P;
  const L = (id) => P.structure.lines[id].text;
  const B = (at, scene, extra = {}) => P.beat({ at, scene, ...extra });

  // HOOK. Sound off, the first second says who, the change, how many, and that there is a
  // dollar answer not shown yet. The text sits in the wall above his head (the portrait
  // crop leaves ~530px of headroom), never over his face.
  B(0, "hook_open", {
    lines: [0], role: "hook", aroll: "full", phrase: L(0), sound: "pop",
    text: ["SMINO WENT INDEPENDENT.", "HIS FIRST 100 PAYING FANS", "$ ? ? ?"],
    graphic: { component: "HookOpen", props: { headline: ["SMINO WENT INDEPENDENT.", "HIS FIRST 100 PAYING FANS"], mask: { text: "$ ? ? ?" }, size: 62, lineTop: 292, maskSize: 60 } },
    notes: "open loop: who, what changed, how many, and a hidden dollar figure",
  });
  // The first visual change inside a second: a gentle push that keeps his eyes where they
  // were, so the headline above his head is never crossed. The headline holds (continued).
  B(w(0, "much"), "hook_open", {
    lines: [0], role: "hook", aroll: "push", phrase: L(0), continued: true,
    text: ["SMINO WENT INDEPENDENT.", "HIS FIRST 100 PAYING FANS", "$ ? ? ?"],
    graphic: { component: "HookOpen", props: { headline: ["SMINO WENT INDEPENDENT.", "HIS FIRST 100 PAYING FANS"], mask: { text: "$ ? ? ?" }, size: 62, lineTop: 292, maskSize: 60 } },
    notes: "pacing: the frame moves before the viewer decides to scroll",
  });
  B(w(1, "You're"), "aroll_punch", { lines: [1], role: "hook_turn", phrase: L(1), transition: "punch", sound: "riser_drop", notes: "the turn: beat drops, riser peaks on the drop" });

  // SETUP. His face carries the first sentence; proof arrives with the specifics.
  B(lineStart(2), "aroll_hero", { lines: [2], role: "setup", phrase: L(2), notes: "direct address: the premise" });
  B(w(2, "one"), "aroll_punch", { lines: [2], role: "setup", phrase: L(2), notes: "emphasis on 'one thing almost nobody sets up'" });
  B(lineStart(3), "aroll_proof", {
    lines: [3], role: "setup", phrase: L(3), aroll: "split", evidence: "fact from the script (META: Wikipedia, tour listings)",
    text: ["MAYBE IN NIRVANA", "DECEMBER 2024", "HIS FIRST", "INDEPENDENT ALBUM"],
    graphic: { component: "Headline", props: { lines: ["MAYBE IN NIRVANA", "DECEMBER 2024", "HIS *FIRST*", "*INDEPENDENT* ALBUM"], at: [w(3, "Maybe"), w(3, "December"), w(3, "first"), w(3, "independently")] } },
  });
  B(lineStart(4), "aroll_proof", {
    lines: [4], role: "setup", phrase: L(4), aroll: "split", evidence: "fact from the script",
    text: ["ZERO FATIGUE", "HIS OWN COLLECTIVE", "TOURS AND FESTIVALS"],
    graphic: { component: "Headline", props: { lines: ["*ZERO FATIGUE*", "HIS OWN COLLECTIVE", "TOURS AND FESTIVALS"], at: [lineStart(4), w(4, "collective"), w(4, "tour")] } },
  });
  B(w(4, "fan"), "aroll_proof", {
    lines: [4], role: "setup", phrase: L(4), aroll: "band",
    text: ["A FANBASE THAT BUYS", "TICKETS AND MERCH", "NOT JUST STREAMS"],
    graphic: { component: "Headline", props: { lines: ["A FANBASE THAT *BUYS*", "TICKETS AND MERCH", "NOT JUST STREAMS"], at: [w(4, "fan"), w(4, "tickets"), w(4, "instead")] } },
    notes: "band: the wider room shows he is a working artist at a desk, the headline says what the fans do",
  });
  if (has(5)) {
    B(lineStart(5), "aroll_hero", { lines: [5], role: "setup", phrase: L(5) });
    B(w(5, "nobody"), "aroll_punch", { lines: [5], role: "setup", phrase: L(5), notes: "'nobody above him deciding anything'" });
  }

  // THE DELIVERY PROBLEM.
  B(lineStart(6), "aroll_hero", { lines: [6], role: "mechanism", phrase: L(6), notes: "reset on his face before the idea" });
  B(lineStart(7), "aroll_proof", {
    lines: [7], role: "mechanism", phrase: L(7), aroll: "split",
    text: ["LAUNCH", "ABOUT A MONTH", "DELIVERY", "THE REST OF YOUR LIFE"],
    graphic: { component: "Contrast", props: { left: { label: "LAUNCH", sub: "ABOUT A MONTH", glyph: "spike", at: w(7, "launch") }, right: { label: "DELIVERY", sub: "THE REST OF YOUR LIFE", glyph: "line", at: w(7, "DELIVERY"), emphasis: true } } },
    notes: "a spike that falls away against a line that keeps ticking",
  });
  B(lineStart(8), "aroll_proof", {
    lines: [8], role: "mechanism", phrase: L(8), aroll: "split",
    text: ["THEY PAY EVERY MONTH", "YOU OWE THEM ON A SCHEDULE", "EARLY LISTENS", "BEHIND THE SCENES", "WHATEVER YOU PROMISED"],
    graphic: { component: "Flow", props: { dense: true, steps: [
      { text: "THEY PAY EVERY MONTH", at: w(8, "pays") },
      { text: "YOU OWE THEM ON A SCHEDULE", at: w(8, "schedule") },
      { text: "EARLY LISTENS", at: w(8, "Early") },
      { text: "BEHIND THE SCENES", at: w(8, "behind") },
      { text: "WHATEVER YOU PROMISED", at: w(8, "Whatever") },
    ] } },
    notes: "membership becomes a recurring obligation",
  });
  B(lineStart(9), "aroll_proof", {
    lines: [9], role: "mechanism", phrase: L(9), aroll: "split",
    text: ["A PAYING MEMBER", "A PROMISE COMES DUE", "YOU FORGET IT", "THEY DONT ARGUE", "THEY JUST STOP PAYING"],
    graphic: { component: "Flow", props: { dense: true, broken: 2, steps: [
      { text: "A PAYING MEMBER", at: lineStart(9) },
      { text: "A PROMISE COMES DUE", at: w(9, "day") },
      { text: "YOU FORGET IT", at: w(9, "forget") },
      { text: "THEY DONT ARGUE", at: w(9, "argue") },
      { text: "THEY JUST STOP PAYING", at: w(9, "stop") },
    ] } },
    notes: "an explanatory mechanism, not a claim about Smino's fans: the chain breaks, what follows fades",
  });
  B(lineStart(10), "aroll_hero", { lines: [10], role: "mechanism", phrase: L(10) });
  B(lineStart(11), "aroll_proof", {
    lines: [11], role: "mechanism", phrase: L(11), aroll: "split",
    text: ["OFFER", "EVERYBODY BUILDS IT", "CALENDAR", "ALMOST NOBODY DOES"],
    graphic: { component: "Contrast", props: { left: { label: "OFFER", sub: "EVERYBODY BUILDS IT", glyph: "box", at: w(11, "offer") }, right: { label: "CALENDAR", sub: "ALMOST NOBODY DOES", glyph: "calendar", at: w(11, "calendar"), emphasis: true } } },
    notes: "the strongest concept before the reveal",
  });
  B(lineStart(12), "aroll_proof", {
    lines: [12], role: "mechanism", phrase: L(12), aroll: "band",
    text: ["PATREON. DISCORD.", "A PAID COMMUNITY.", "YOU HAVE IT TODAY"],
    graphic: { component: "Headline", props: { lines: ["PATREON. DISCORD.", "A PAID COMMUNITY.", "YOU HAVE IT *TODAY*"], at: [w(12, "Patreon"), w(12, "paid"), w(12, "TODAY")] } },
    notes: "the qualification: this is about sellers who already run something",
  });
  B(w(12, "announced"), "aroll_proof", {
    lines: [12], role: "mechanism", phrase: L(12), aroll: "split",
    text: ["A MONTHLY THING, 6 WEEKS AGO", "WHO IS OWED IT: ONE APP", "WHAT YOU OWE: ANOTHER APP", "WHICH TIER WAS IT FOR"],
    graphic: { component: "Flow", props: { dense: true, broken: 3, steps: [
      { text: "A MONTHLY THING, 6 WEEKS AGO", at: w(12, "announced") },
      { text: "WHO IS OWED IT: ONE APP", at: w(12, "people") },
      { text: "WHAT YOU OWE: ANOTHER APP", at: w(12, "thing", 1) },
      { text: "WHICH TIER WAS IT FOR?", at: w(12, "remember") },
    ] } },
  });

  // THE SET-UP FOR THE NUMBER. Nothing here may show $10, $3,000 or $36,000.
  B(lineStart(13), "aroll_proof", {
    lines: [13], role: "tease", phrase: L(13), aroll: "split",
    text: ["TWO VERSIONS", "SAME 100 PEOPLE, SAME PRICE", "ONE DIFFERENCE"],
    graphic: { component: "Headline", props: { lines: ["TWO VERSIONS", "SAME 100 PEOPLE, SAME PRICE", "*ONE DIFFERENCE*"], at: [w(13, "two"), w(13, "100"), w(13, "difference")] } },
  });
  B(lineStart(14), "withheld_tease", { lines: [14], role: "tease", phrase: L(14), text: ["$ ? ? ?"], graphic: { component: "MaskedFigure", props: { mask: { text: "$ ? ? ?" } } } });

  // CRWN DETOUR: the solution to the problem the video just explained.
  B(lineStart(15), "aroll_punch", { lines: [15], role: "detour_open", phrase: L(15), transition: "whip", sound: "whoosh", text: ["SIDENOTE"], graphic: { component: "Chip", props: { text: "SIDENOTE" } } });
  B(lineStart(16), "motion_concept", {
    lines: [16], role: "detour_thesis", phrase: L(16), captions: "off", transition: "slide",
    text: ["YOUR PROBLEM AINT MARKETING TO FANS.", "IT'S THAT YOU NEED A MARKET FOR FANS."],
    graphic: { component: "Thesis", props: { lines: ["YOUR PROBLEM AINT MARKETING TO FANS.", "IT'S THAT YOU NEED A MARKET FOR FANS."] } },
  });
  B(lineStart(17), "aroll_proof", {
    lines: [17], role: "detour", phrase: L(17), aroll: "split",
    text: ["A MARKET RUNS ON", "KEPT PROMISES"],
    graphic: { component: "Headline", props: { lines: ["A MARKET RUNS ON", "*KEPT PROMISES*"], at: [lineStart(17), w(17, "kept")] } },
  });
  B(w(17, "which"), "aroll_proof", {
    lines: [17], role: "detour", phrase: L(17), aroll: "split",
    text: ["PROMISE CALENDAR", "ON THE CRWN APP"],
    graphic: { component: "Headline", props: { lines: ["*PROMISE CALENDAR*", "ON THE CRWN APP"], at: [w(17, "Promise"), w(17, "CRWN")] } },
  });
  // The footage shows real tier BENEFITS on an artist page; the labels say, in order, what
  // the Promise Calendar does with them (verified in src/lib/tierObligations.ts: a benefit
  // the artist schedules becomes a dated obligation, eligible fans come from the tier).
  B(w(17, "every"), "crwn_mechanism", {
    lines: [17], role: "detour_crwn", phrase: L(17), aroll: "split", evidence: "product (CRWN screen recording)",
    text: ["PROMISE CALENDAR", "YOUR TIER BENEFITS", "A BENEFIT YOU SCHEDULE", "A DUE DATE", "THE FANS IT'S OWED TO", "OUT OF YOUR HEAD"],
    broll: { asset: "crwn-tier-benefits-plug" }, assetSource: "CRWN screen recording (crwn-tier-benefits-plug)",
    graphic: { component: "CrwnMechanism", props: {
      footage: "crwn-tier-benefits-plug", chip: "PROMISE CALENDAR", deviceLabel: "YOUR TIER BENEFITS",
      labels: [
        { text: "A BENEFIT YOU SCHEDULE", at: w(17, "benefit") },
        { text: "A DUE DATE", at: w(17, "dated") },
        { text: "THE FANS IT'S OWED TO", at: w(17, "owed") },
        { text: "OUT OF YOUR HEAD", at: w(17, "head") },
      ],
    } },
    notes: "the footage is labelled as tier benefits, never as the calendar screen",
  });
  B(w(18, "ANYWAY"), "aroll_hero", { lines: [18], role: "detour_close", phrase: L(18), transition: "whip", sound: "whoosh", notes: "editorial reset: back to him, the payoff is next" });

  // THE QUESTION AGAIN, THEN THE REVEAL.
  B(lineStart(19), "aroll_hero", { lines: [19], role: "restate", phrase: L(19) });
  B(w(19, "worth"), "withheld_tease", { lines: [19], role: "restate", phrase: L(19), text: ["$ ? ? ?"], graphic: { component: "MaskedFigure", props: { mask: { text: "$ ? ? ?" }, pulse: true } } });
  const at3k = w(20, "$3,000"), at36k = w(21, "$36,000"), at10 = w(20, "$10");
  B(lineStart(20), "calculation", {
    lines: [20, 21], role: "reveal", phrase: `${L(20)} ${L(21)}`, aroll: "split", evidence: "the script's own arithmetic",
    text: ["100 MEMBERS, $10 A MONTH", "3 MONTHS", "$3,000", "3 YEARS", "$36,000", "ARITHMETIC, NOT A FORECAST"],
    textAt: [
      { text: "100 MEMBERS, $10 A MONTH", at: at10 },
      { text: "3 MONTHS", at: at3k }, { text: "$3,000", at: at3k },
      { text: "3 YEARS", at: at36k }, { text: "$36,000", at: at36k },
      { text: "ARITHMETIC, NOT A FORECAST", at: at36k },
    ],
    graphic: { component: "CompareReveal", props: {
      compact: true,
      header: { text: "100 MEMBERS, $10 A MONTH", at: at10 },
      rows: [{ label: "3 MONTHS", figure: "$3,000", at: at3k }, { label: "3 YEARS", figure: "$36,000", at: at36k }],
      footer: { text: "ARITHMETIC, NOT A FORECAST", at: at36k },
    } },
    notes: "the same terms, then each version on the word that says it; the footer keeps it arithmetic, never a Smino forecast",
  });
  B(lineStart(22), "numeric_reveal", {
    lines: [22], role: "reveal", phrase: L(22), captions: "off", sound: "hit", transition: "flash", evidence: "the script's own arithmetic",
    text: ["SAME FANS, SAME PRICE", "$33,000", "DIFFERENCE"],
    graphic: { component: "Reveal", props: { qualifier: "SAME FANS, SAME PRICE", figure: "$33,000", unit: "DIFFERENCE" } },
    notes: "the payoff: the only full-frame burst",
  });

  // THE TURN AFTER THE NUMBER, THEN SETTLE.
  // Lines 23-25 are the passage the short (under 3:00) cut drops; see the report.
  if (has(23)) B(lineStart(23), "aroll_hero", { lines: [23], role: "deepen", phrase: L(23) });
  if (has(24)) B(lineStart(24), "aroll_proof", {
    lines: [24, 25], role: "deepen", phrase: `${L(24)} ${L(25)}`, aroll: "split",
    text: ["GETTING THEM", "THE HARD PART", "KEEPING THEM", "THE EASY PART"],
    graphic: { component: "Contrast", props: { labelSize: 60, left: { label: "GETTING THEM", sub: "THE HARD PART", glyph: "spike", at: w(24, "Getting") }, right: { label: "KEEPING THEM", sub: "THE EASY PART", glyph: "line", at: w(25, "Keeping"), emphasis: true } } },
    notes: "echoes LAUNCH vs DELIVERY on purpose",
  });
  if (has(25)) B(w(25, "everybody"), "aroll_hero", { lines: [25], role: "deepen", phrase: L(25), notes: "reflective: his face, no graphic" });
  B(lineStart(26), "aroll_proof", {
    lines: [26], role: "qualifier", phrase: L(26), aroll: "split",
    text: ["ARITHMETIC, NOT A FORECAST.", "Real fanbases move in and out."],
    graphic: { component: "QualifierCard", props: { text: "ARITHMETIC, NOT A FORECAST.", sub: "Real fanbases move in and out." } },
    notes: "the script's words, big enough to read, while he says it",
  });
  B(lineStart(27), "aroll_hero", { lines: [27], role: "question", phrase: L(27) });
  B(lineStart(28), "aroll_proof", {
    lines: [28], role: "question", phrase: L(28), aroll: "split",
    text: ["WHAT DID YOU PROMISE?", "WHO IS OWED IT?", "WHERE IS IT WRITTEN DOWN?"],
    graphic: { component: "Headline", props: { lines: ["WHAT DID YOU PROMISE?", "WHO IS OWED IT?", "WHERE IS IT *WRITTEN DOWN*?"], at: [w(28, "promise"), w(28, "ones"), w(28, "written")] } },
    notes: "calm: three questions, one at a time",
  });

  // CTA.
  B(lineStart(29), "cta_tool", {
    lines: [29], role: "cta_tool", phrase: L(29), aroll: "split", evidence: "product", transition: "slide",
    text: ["CRWN OPPORTUNITY CALCULATOR", "FREE"], broll: { asset: "tool-opportunity-calculator-v2" }, assetSource: "CRWN tool recording (tool-opportunity-calculator-v2)",
    graphic: { component: "ToolCard", props: { name: "CRWN Opportunity Calculator", footage: "tool-opportunity-calculator-v2" } },
  });
  B(lineStart(30), "cta_keyword", { lines: [30], role: "cta_keyword", phrase: L(30), captions: "off", sound: "pop", text: [`COMMENT ${P.structure.ctaKeyword}`], graphic: { component: "Keyword", props: { keyword: P.structure.ctaKeyword } } });
}
