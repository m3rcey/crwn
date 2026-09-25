// Authored plan: Fan Economy 23, Smino, "the promise you forgot". REBUILT 2026-09-25 to the
// premium-reference standard (videos/reels/references: voice-led visual explainers where
// the presenter is one asset and full-frame visuals own most of the reel).
//
// Built from the FINAL SPOKEN TRANSCRIPT, not the written script: every beat stands on words
// he actually said (P.w anchors), and nothing is shown for a line he changed or dropped
// ("Zero Fatigue" was never said; the qualifier he spoke is "this is not a forecast").
//
// One persistent 3D world carries the middle of the reel (lib/world3d.js): a gold timeline
// rail into depth, 100 fan figures, a promise tile per month, and a coin stack per month
// (10 coins = $1,000 = 100 fans x $10). The reveal SHOWS the arithmetic: path A stops at 3
// stacks while the fans leave, path B runs 36 stacks down the same rail, and the overhead
// comparison brackets the 33 stacks of difference. Smino himself is a 3D FIGURE in that
// world, built from reference photographs (founder, 2026-09-25: "use the photos as
// reference to make 3d animations out of, instead of just using the photos"): braids
// with gold beads (2024), the red headband and cream St. Louis pinstripe jersey (NYE 2016),
// a gold chain, a mic. No photograph of him is on screen.
//
// Media per beat (descriptive, for the coverage report): aroll | photo | 2.5d | 3d | ui |
// calculator | 2d | hybrid.

export default async function plan(P) {
  const { w, lineStart, lineEnd } = P;
  const L = (id) => P.outWords.filter((x) => x.line === id).map((x) => x.text).join(" ");
  const B = (at, scene, extra = {}) => P.beat({ at, scene, captions: "on", ...extra });
  const T = (x) => +x.toFixed(3);

  // ----------------------------------------------------------------- timings (spoken)
  const t = {
    much: w(0, "much"), independent0: w(0, "independent"), youre: w(1, "You're"),
    sminoWent: w(2, "Smino"), what2: w(2, "what"), one2: w(2, "one"),
    now3: w(3, "Now"), maybe: w(3, "Maybe"), december: w(3, "December"), first3: w(3, "first"), he3: w(3, "He", 1),
    collective: w(4, "collective."), tour: w(4, "tour."), festivals: w(4, "festivals."), and4: w(4, "and"), tickets: w(4, "tickets"), merch: w(4, "merch"), streaming: w(4, "streaming."),
    hes5: w(5, "He's"), nobody5: w(5, "nobody"),
    now6: w(6, "now"), going7: w(7, "Going"), launch: w(7, "launch"), month7: w(7, "month,"), delivery: w(7, "DELIVERY"), rest: w(7, "rest"),
    because8: w(8, "Because"), pays: w(8, "pays"), owe8: w(8, "owe"), schedule: w(8, "schedule."), early: w(8, "Early"), behind: w(8, "behind"), whatever: w(8, "Whatever"),
    and9: w(9, "And"), forget: w(9, "forget"), argue: w(9, "argue"), stop: w(9, "stop"),
    thats10: w(10, "That's"), everybody11: w(11, "Everybody"), offer: w(11, "offer."), nobody11: w(11, "nobody"), calendar11: w(11, "calendar"),
    and12: w(12, "And"), today: w(12, "TODAY."), announced: w(12, "announced"), caption: w(12, "caption"), people12: w(12, "people"), app12: w(12, "app,"), thing12: w(12, "thing", 1), another: w(12, "another,"), remember: w(12, "remember"), tier12: w(12, "tier"),
    so13: w(13, "So"), versions: w(13, "versions"), same13: w(13, "Same", 1), price13: w(13, "price"), difference13: w(13, "difference"), gap: w(14, "gap"), small: w(14, "small"),
    one15: w(15, "one"), your16: w(16, "your"), market17: w(17, "market"), kept: w(17, "kept"), which17: w(17, "which"), promise17: w(17, "Promise"), every17: w(17, "every"), attach: w(17, "attach"), dated: w(17, "dated"), fans17: w(17, "fans"), stops: w(17, "stops"),
    anyway: w(18, "ANYWAY."), so19: w(19, "So"), smino19: w(19, "Smino?"),
    members: w(20, "100"), ten20: w(20, "$10"), drift: w(20, "drift"), three20: w(20, "three"), three000: w(20, "$3,000."),
    the21: w(21, "The"), same21: w(21, "same"), ten21: w(21, "$10,"), stayed: w(21, "stayed"), years: w(21, "years"), showing: w(21, "showing"), is21: w(21, "is"), k36: w(21, "$36,000."),
    diff: lineStart(22), sameFans: w(22, "same"),
    and23: w(23, "And"), getting: w(24, "Getting"), hard: w(24, "hard"), ads: w(24, "ads"), rollout: w(24, "rollout"), year: w(24, "year"),
    keeping: w(25, "Keeping"), easy: w(25, "EASY"), loses: w(25, "loses,"), forgotten: w(25, "forgotten"), mistake: w(25, "mistake"), feels: w(25, "feels"), busy: w(26, "busy"),
    now26: w(26, "now"), forecast: w(26, "forecast,"), move: w(26, "move"), but27: w(27, "But"), what28: w(28, "what"), written: w(28, "written"),
    built: w(29, "I"), free29: w(29, "free"), comment: w(30, "Comment"), free30: w(30, "FREE"),
  };

  // ----------------------------------------------------------------- the world
  // Zones sit far apart; the camera CUTS between them, fog hides the rest.
  const Z = { stage: [0, 0, 0], portrait: [60, 0, 0], album: [120, 0, 0], fest: [180, 0, 0], crowd: [240, 0, 0], offer: [300, 0, 0], apps: [360, 0, 0], hard: [420, 0, 0], life: [0, 0, -80], reveal: [0, 0, -200] };
  const at = (z, dx = 0, dy = 0, dz = 0) => [Z[z][0] + dx, Z[z][1] + dy, Z[z][2] + dz];
  const months = (n) => Array.from({ length: n }, (_, i) => i + 1);
  const cam = [];
  const shot = (t0, pos, look, fov = 36, ease = "inOut", cut = true) => cam.push({ t: T(t0), pos, look, fov, ease, cut });
  const move = (t1, pos, look, fov = 36, ease = "inOut") => cam.push({ t: T(t1), pos, look, fov, ease });
  const objects = [], tags = [];
  const tag = (text, start, end, o) => tags.push({ text, start: T(start), end: T(end), ...o });
  const show = (t0, t1, fade = 0.25) => [{ t: T(t0 - fade), v: 0 }, { t: T(t0), v: 1 }, { t: T(t1), v: 1 }, { t: T(t1 + fade), v: 0 }];
  const sfx = [];
  const s = (kind, at, gain) => sfx.push({ kind, at: T(at), ...(gain !== undefined ? { gain } : {}) });

  const SMINO = { skin: 0x6b4128, shirtPattern: "pinstripe", shirtCss: "#EFE6D2", trimCss: "#B3261E", trim: 0xb3261e, pants: 0x23293a, shoes: 0xf2f2f2, hair: 0x17110e, headband: 0xc62828 };
  const pulse = (t0, t1, v = 1) => [{ t: T(t0), v: 0 }, { t: T(t0 + 0.45), v }, { t: T(t1 - 0.3), v }, { t: T(t1), v: 0 }];

  // HOOK (0 - 6.1): Smino on a festival stage, his name lettered on the screen behind him
  // (the Governors Ball 2021 reference), 100 fans in front, the value unknown. All four
  // facts inside the first second.
  objects.push({ id: "stageMain", type: "stage", pos: at("stage", 0, 0, -0.6), width: 6.2, depth: 3.0, height: 0.8, backdrop: { text: "SMINO", w: 3.7, h: 1.8, lift: 0.3 }, beams: 4 });
  objects.push({ id: "sminoStage", type: "figure", artist: true, style: SMINO, keys: { pos: [{ t: 0, v: at("stage", 0, 0.8, -0.2) }], scale: [{ t: 0, v: 1.3 }], mic: [{ t: 0, v: 1 }], rot: [{ t: 0, v: [0, 0, 0] }] } });
  objects.push({ id: "fansStage", type: "fans", count: 100, cols: 20, spacing: 0.5, keys: { arrive: [{ t: 0.15, v: 0 }, { t: 1.2, v: 1, ease: "out" }] } });
  objects[objects.length - 1].root = at("stage", 0, 0, 4.2);
  shot(0, at("stage", 0, 2.25, 9.6), at("stage", 0, 2.45, 0), 38);
  move(t.youre - 0.05, at("stage", 0.25, 2.2, 8.0), at("stage", 0, 2.4, 0), 38, "soft");
  tag("INDEPENDENT", 0.35, t.youre, { screen: [540, 250], style: "tag" });
  tag("$ ? ? ?", 0.95, t.youre, { screen: [540, 400], style: "gold", label: "the withheld answer, masked" });
  tag("100 PAYING FANS", 0.7, t.youre, { screen: [540, 1440], style: "dark" });
  s("pass", 0.12); s("tick", 0.95);

  // "Smino went independent": close on him under one spotlight; the mic comes up.
  objects.push({ id: "spotPortrait", type: "stage", pos: at("portrait", 0, 0, -0.8), width: 3, depth: 2, height: 0.02, backdrop: { text: "", w: 3, h: 2.4 }, beams: 1 });
  objects.push({ id: "sminoPortrait", type: "figure", artist: true, style: SMINO, keys: { pos: [{ t: 0, v: at("portrait") }], mic: [{ t: T(t.sminoWent), v: 0 }, { t: T(t.sminoWent + 0.7), v: 1 }], turn: [{ t: T(t.sminoWent), v: -0.25 }, { t: T(t.sminoWent + 0.8), v: 0 }] } });
  shot(t.sminoWent - 0.1, at("portrait", 0.5, 1.9, 2.8), at("portrait", 0, 1.62, 0), 36);
  move(t.what2 + 0.2, at("portrait", 0.2, 1.85, 2.2), at("portrait", 0, 1.66, 0), 36, "soft");
  tag("WENT INDEPENDENT", t.sminoWent + 0.25, t.what2 + 0.2, { screen: [540, 1150], style: "dark" });

  // SETUP: the album, the collective and the road, the fanbase that buys.
  objects.push({ id: "sleeve", type: "card", face: "sleeve", size: [1.5, 1.5], px: 900, data: { title: "MAYBE IN\nNIRVANA", sub: "DECEMBER 2024" }, label: null,
    keys: { pos: [{ t: 0, v: at("album", 0.62, 2.35, 0.4) }], rot: [{ t: T(t.maybe - 0.4), v: [0, -0.9, 0.1] }, { t: T(t.he3), v: [0, -0.25, 0], ease: "out" }], opacity: show(t.now3, t.he3, 0.05) } });
  objects.push({ id: "sminoAlbum", type: "figure", artist: true, style: SMINO, keys: { pos: [{ t: 0, v: at("album", -0.42, 0, -0.4) }], rot: [{ t: 0, v: [0, 0.35, 0] }], scale: [{ t: 0, v: 1.15 }], point: [{ t: T(t.maybe), v: 0 }, { t: T(t.maybe + 0.5), v: 1 }, { t: T(t.first3 + 0.5), v: 1 }, { t: T(t.first3 + 1.0), v: 0 }], turn: [{ t: T(t.maybe), v: 0 }, { t: T(t.maybe + 0.5), v: 0.35 }] } });
  shot(t.now3 - 0.1, at("album", -0.1, 1.95, 7.4), at("album", 0.08, 1.75, -0.2), 38);
  move(t.he3 - 0.06, at("album", 0.3, 1.9, 6.4), at("album", 0.08, 1.8, -0.2), 38, "inOut");
  tag("FIRST INDEPENDENT ALBUM", t.first3, t.he3, { screen: [540, 1150], style: "tag" });
  s("pass", T(t.maybe - 0.35));

  // The road and the festivals: a wide stage, six beams, a crowd, a lateral dolly.
  objects.push({ id: "stageFest", type: "stage", pos: at("fest", 0, 0, -0.8), width: 8, depth: 3.2, height: 1.0, backdrop: { text: "", w: 7, h: 3.2 }, beams: 6 });
  objects.push({ id: "sminoFest", type: "figure", artist: true, style: SMINO, keys: { pos: [{ t: 0, v: at("fest", 0, 1.0, -0.4) }], scale: [{ t: 0, v: 1.25 }], mic: [{ t: 0, v: 1 }], point: [{ t: T(t.festivals - 0.2), v: 0 }, { t: T(t.festivals + 0.3), v: 1 }], bob: [{ t: 0, v: 1.6 }] } });
  objects.push({ id: "fansFest", type: "fans", count: 100, cols: 20, spacing: 0.5, pos: at("fest", 0, 0, 3.6), keys: { arrive: [{ t: 0, v: 1 }] } });
  shot(t.he3 - 0.02, at("fest", -1.3, 2.2, 11.0), at("fest", 0, 2.4, 0), 40);
  move(t.and4 - 0.1, at("fest", 1.3, 2.1, 9.6), at("fest", 0, 2.4, 0), 40, "linear");
  tag("HIS OWN COLLECTIVE", t.collective - 0.1, t.tour, { screen: [540, 330], style: "dark" });
  tag("ON TOUR", t.tour, t.festivals, { screen: [540, 330], style: "dark" });
  tag("FESTIVALS", t.festivals, t.and4, { screen: [540, 330], style: "dark" });

  objects.push({ id: "fansCrowd", type: "fans", count: 100, cols: 14, spacing: 0.5, keys: { arrive: [{ t: T(t.and4 - 0.2), v: 0 }, { t: T(t.and4 + 0.7), v: 1 }] } });
  objects[objects.length - 1].root = at("crowd");
  objects.push({ id: "ticket", type: "card", face: "ticket", size: [1.6, 0.73], data: {}, keys: { pos: [{ t: T(t.tickets - 0.1), v: at("crowd", -0.9, 6, 2) }, { t: T(t.tickets + 0.5), v: at("crowd", -0.9, 2.7, 2.0), ease: "out" }], rot: [{ t: 0, v: [-0.1, 0.3, 0.12] }], opacity: show(t.tickets, t.streaming + 0.6, 0.1) } });
  objects.push({ id: "tee", type: "card", face: "tee", size: [1.3, 1.3], data: {}, keys: { pos: [{ t: T(t.merch - 0.1), v: at("crowd", 0.9, 6, 2) }, { t: T(t.merch + 0.5), v: at("crowd", 0.9, 2.4, 2.0), ease: "out" }], rot: [{ t: 0, v: [-0.1, -0.3, -0.1] }], opacity: show(t.merch, t.streaming + 0.6, 0.1) } });
  objects.push({ id: "play", type: "card", face: "play", size: [1.1, 1.1], data: {}, keys: { pos: [{ t: 0, v: at("crowd", 0, 4.4, -0.5) }], scale: [{ t: T(t.streaming), v: 1 }, { t: T(t.streaming + 0.5), v: 0.2, ease: "in" }], opacity: [{ t: T(t.and4), v: 0 }, { t: T(t.and4 + 0.3), v: 0.55 }, { t: T(t.streaming), v: 0.55 }, { t: T(t.streaming + 0.5), v: 0 }] } });
  shot(t.and4 - 0.02, at("crowd", 0, 5.6, 12.5), at("crowd", 0, 2.2, 0), 40);
  move(t.hes5 - 0.05, at("crowd", 0, 4.9, 11.0), at("crowd", 0, 2.4, 0), 40, "soft");
  tag("TICKETS", t.tickets + 0.3, t.hes5, { obj: "ticket", offset: [0, 1.1, 0], style: "tag" });
  tag("MERCH", t.merch + 0.3, t.hes5, { obj: "tee", offset: [0, 1.4, 0], style: "tag" });
  s("pass", t.tickets); s("pass", t.merch);

  // DELIVERY: the rail. Launch is a spike; delivery is the rest of the rail.
  objects.push({ id: "lifeRail", type: "rail", months: 60, step: 1.6, pos: at("life"), keys: { length: [{ t: T(t.going7), v: 1 }, { t: T(t.delivery), v: 1 }, { t: T(t.rest + 0.6), v: 60, ease: "in" }] } });
  objects.push({ id: "spike", type: "spike", height: 3.6, width: 0.55, keys: { h: [{ t: T(t.going7), v: 0 }, { t: T(t.going7 + 0.5), v: 0.18, ease: "out" }, { t: T(t.launch - 0.1), v: 0.18 }, { t: T(t.launch + 0.35), v: 1, ease: "back" }, { t: T(t.delivery - 0.1), v: 1 }, { t: T(t.delivery + 0.5), v: 0.12, ease: "inOut" }] } });
  objects[objects.length - 1].root = at("life", 0, 0, -1.6);
  shot(t.going7 - 0.02, at("life", 6.5, 3.4, 7.5), at("life", 0, 1.8, -2.5), 40);
  move(t.delivery, at("life", 5.2, 3.0, 5.0), at("life", 0, 1.6, -3.0), 40, "soft");
  move(t.rest + 0.95, at("life", 2.6, 2.4, -2.5), at("life", 0, 0.5, -36), 44, "inOut");
  tag("GOING INDEPENDENT", t.going7 + 0.1, t.launch, { screen: [540, 330], style: "dark" });
  tag("LAUNCH", t.launch, t.delivery + 0.4, { screen: [540, 330], style: "big" });
  tag("ABOUT A MONTH", t.launch + 0.6, t.delivery + 0.4, { screen: [540, 460], style: "dark" });
  tag("DELIVERY", t.delivery, t.because8, { screen: [540, 360], style: "big" });
  tag("THE REST OF YOUR LIFE", t.rest, t.because8, { screen: [540, 470], style: "dark" });
  s("tick", t.launch); s("travel", T(t.delivery - 0.25)); s("impact", t.delivery, -10);

  // Every month you owe something: the fans, the membership, a tile per month.
  objects.push({ id: "fansLife", type: "fans", count: 100, cols: 10, spacing: 0.3, keys: { arrive: [{ t: T(t.because8), v: 0 }, { t: T(t.pays + 0.4), v: 1 }], leave: [{ t: T(t.stop - 0.1), v: 0 }, { t: T(t.stop + 1.1), v: 1 }] } });
  objects[objects.length - 1].root = at("life", -2.4, 0, 1.2);
  objects.push({ id: "tierLife", type: "card", face: "tier", size: [2.1, 2.8], data: { title: "EVERY MONTH", price: "", lines: ["Early listens", "Behind the scenes"] },
    keys: { pos: [{ t: 0, v: at("life", -5.3, 2.3, 1.0) }], rot: [{ t: 0, v: [0, -0.59, 0] }], scale: [{ t: 0, v: 0.62 }], opacity: show(t.pays, t.whatever, 0.25) } });
  objects.push({ id: "lifeTiles", type: "tiles", rail: "lifeRail", months: months(12), keys: { shown: [{ t: T(t.owe8), v: 0 }, { t: T(t.schedule + 0.8), v: 12, ease: "linear" }], checked: [{ t: 0, v: 0 }, { t: T(t.market17 + 0.4), v: 0 }, { t: T(t.promise17), v: 12, ease: "linear" }] }, missed: [{ month: 4, t: T(t.forget + 0.1), until: T(t.market17 + 0.6) }, { month: 10, t: T(t.feels) }] });
  shot(t.because8 - 0.02, at("life", -9.5, 5.2, 8.5), at("life", -1.8, 1.2, -3), 40);
  move(t.early - 0.2, at("life", -7.2, 4.0, 3.5), at("life", 0, 0.8, -7), 40, "inOut");
  move(t.whatever + 0.3, at("life", -8.5, 6.5, 5.5), at("life", 0, 0.5, -9), 42, "inOut");
  move(t.and9 + 0.4, at("life", -5.5, 3.4, 0.5), at("life", 0.8, 0.5, -6.4), 40, "inOut");
  move(t.stop + 1.2, at("life", -10.5, 7.0, 8.0), at("life", -2, 0.4, -3), 42, "inOut");
  tag("EARLY LISTENS", t.early, t.whatever, { obj: "lifeRail", month: 1, offset: [1.3, 1.5, 0], style: "tag" });
  tag("BEHIND THE SCENES", t.behind, t.whatever, { obj: "lifeRail", month: 2, offset: [1.3, 2.3, 0], style: "tag" });
  tag("WHAT YOU OWE", t.whatever + 0.4, t.and9, { screen: [540, 360], style: "big" });
  tag("FORGET ONE", t.forget + 0.2, t.stop, { obj: "lifeRail", month: 4, offset: [1.3, 1.6, 0], style: "dark" });
  tag("STOP PAYING", t.stop, t.thats10, { screen: [540, 360], style: "big" });
  s("pop", T(t.pays + 0.1)); s("tick", t.early); s("tick", t.behind); s("thud", T(t.forget + 0.1)); s("pass", T(t.stop + 0.2), -20);

  // OFFER vs CALENDAR: the beautiful tier card everybody builds, the promises floating loose
  // behind it, then the calendar that holds them.
  objects.push({ id: "offerCard", type: "card", face: "tier", size: [2.6, 3.5], data: { title: "THE OFFER", price: "", lines: ["Early listens", "Behind the scenes"] }, label: "recurring card: the promises he named at 53s",
    keys: { pos: [{ t: 0, v: at("offer", 0, 1.1, 2) }], rot: [{ t: T(t.everybody11), v: [0, -0.5, 0] }, { t: T(t.offer + 0.3), v: [0, 0.12, 0], ease: "out" }, { t: T(t.nobody11), v: [0, 0.12, 0] }, { t: T(t.nobody11 + 0.6), v: [0, 1.2, 0] }], opacity: show(t.everybody11, t.and12, 0.05) } });
  const notePos = [[-1.5, 4.3, -1.5, 0.3], [1.4, 4.7, -2.4, -0.4], [-0.3, 5.5, -3.2, 0.2], [1.7, 3.0, -1.2, 0.5], [-1.8, 2.6, -2.8, -0.3]];
  const noteText = ["Early listens", "Behind the scenes", "Early listens", "Behind the scenes", "Early listens"];
  notePos.forEach(([x, y, z, r], i) => {
    const gx = -1.1 + (i % 3) * 1.1, gy = 2.55 - Math.floor(i / 3) * 0.85;
    objects.push({ id: `note${i}`, type: "card", face: "note", size: [1.2, 0.9], px: 480, data: { text: noteText[i], size: 70 }, label: "recurring notes: the promises he named at 53s",
      keys: { pos: [{ t: T(t.everybody11), v: at("offer", x, y, z) }, { t: T(t.nobody11), v: at("offer", x + 0.3, y - 0.2, z + 0.4) }, { t: T(t.calendar11 + 0.1 + i * 0.07), v: at("offer", gx, gy, -2.35), ease: "inOut" }],
        rot: [{ t: T(t.everybody11), v: [0.1, r, r * 0.6] }, { t: T(t.nobody11), v: [0.1, r * 1.3, r] }, { t: T(t.calendar11 + 0.1 + i * 0.07), v: [0, 0, 0], ease: "inOut" }], opacity: show(t.everybody11, t.and12, 0.05), scale: [{ t: 0, v: 1 }, { t: T(t.calendar11 + 0.1), v: 1 }, { t: T(t.calendar11 + 0.6), v: 0.72 }] } });
  });
  objects.push({ id: "calendarCard", type: "card", face: "calendar", size: [3.5, 3.0], px: 900, data: { title: "CALENDAR" }, keys: { pos: [{ t: 0, v: at("offer", 0, 0.7, -2.5) }], opacity: show(t.calendar11 - 0.1, t.and12, 0.4) } });
  shot(t.everybody11 - 0.02, at("offer", 0.5, 2.9, 11.0), at("offer", 0, 2.8, 1.5), 38);
  move(t.nobody11, at("offer", -0.4, 3.3, 9.5), at("offer", 0, 3.2, -1), 40, "inOut");
  move(t.and12 - 0.05, at("offer", 0, 2.6, 8.2), at("offer", 0, 2.2, -2.4), 40, "inOut");
  tag("THE OFFER", t.offer - 0.2, t.nobody11, { screen: [540, 330], style: "big" });
  tag("NOBODY BUILDS THE CALENDAR", t.nobody11 + 0.3, t.and12, { screen: [540, 330], style: "dark" });
  s("pass", t.nobody11); s("tick", T(t.calendar11 + 0.45));

  // Your problem TODAY: the caption, the people in one app, the promise in another.
  objects.push({ id: "post", type: "card", face: "app", size: [1.9, 1.9], data: { title: "caption", rows: 1, icon: "question" }, label: "a social post, drawn",
    // Held until its move: a two-key track from t=0 drifted for 86 seconds.
    keys: { pos: [{ t: 0, v: at("apps", 0, 2.2, 0) }, { t: T(t.people12 - 0.1), v: at("apps", 0, 2.2, 0) }, { t: T(t.people12 + 0.6), v: at("apps", 0, 4.4, -3) }], rot: [{ t: 0, v: [0, 0, 0.04] }], opacity: show(t.announced, t.people12 + 0.6, 0.2) } });
  objects.push({ id: "appA", type: "card", face: "app", size: [1.5, 2.2], data: { title: "one app", rows: 4, icon: null }, label: "his words: the people are in one app",
    keys: { pos: [{ t: T(t.people12), v: at("apps", -3.0, 1.5, 0) }, { t: T(t.people12 + 0.5), v: at("apps", -0.85, 1.5, 0), ease: "out" }], rot: [{ t: 0, v: [0, 0.35, 0] }], opacity: show(t.people12, t.so13 - 0.2, 0.2) } });
  objects.push({ id: "appB", type: "card", face: "app", size: [1.5, 2.2], data: { title: "another", rows: 0, icon: "gift" }, label: "his words: the thing you owe is in another",
    keys: { pos: [{ t: T(t.thing12), v: at("apps", 3.0, 1.5, 0) }, { t: T(t.thing12 + 0.5), v: at("apps", 0.85, 1.5, 0), ease: "out" }], rot: [{ t: 0, v: [0, -0.35, 0] }], opacity: show(t.thing12, t.so13 - 0.2, 0.2) } });
  ["?", "?", "?"].forEach((q, i) => objects.push({ id: `tierQ${i}`, type: "card", face: "tier", size: [0.85, 1.12], px: 420, data: { title: "TIER", price: "?", lines: [] },
    keys: { pos: [{ t: T(t.remember), v: at("apps", -0.95 + i * 0.95, 5.6, 0.6) }, { t: T(t.remember + 0.6), v: at("apps", -0.95 + i * 0.95, 3.85, 0.6), ease: "back" }], rot: [{ t: 0, v: [0, 0, (i - 1) * 0.12] }], opacity: show(t.remember, t.so13 - 0.2, 0.15) } }));
  shot(t.announced - 0.05, at("apps", 0, 3.0, 7.0), at("apps", 0, 3.0, 0), 38);
  move(t.people12 + 0.1, at("apps", 0, 2.6, 8.6), at("apps", 0, 2.4, 0), 40, "inOut");
  move(t.so13 - 0.1, at("apps", 0, 2.8, 8.0), at("apps", 0, 2.6, 0), 40, "soft");
  tag("6 WEEKS AGO", t.caption, t.people12, { screen: [540, 330], style: "dark" });
  tag("THE PEOPLE: ONE APP", t.people12 + 0.2, t.remember, { screen: [540, 330], style: "dark" });
  tag("WHAT YOU OWE: ANOTHER", t.another, t.remember, { screen: [540, 430], style: "dark" });
  tag("WHICH TIER?", t.tier12, t.so13 - 0.2, { screen: [540, 330], style: "big" });
  s("pop", t.announced); s("pass", t.people12); s("pass", t.thing12); s("tick", T(t.remember + 0.55));

  // TWO VERSIONS of the same fanbase: two rails, 100 fans at each, the gap masked.
  const railA = at("reveal", -2.2), railB = at("reveal", 2.2);
  objects.push({ id: "railA", type: "rail", months: 36, step: 1.1, pos: railA, keys: { length: [{ t: 0, v: 0.2 }, { t: T(t.drift), v: 0.2 }, { t: T(t.three20 + 0.4), v: 3, ease: "out" }] } });
  objects.push({ id: "railB", type: "rail", months: 36, step: 1.1, pos: railB, keys: { length: [{ t: 0, v: 0.2 }, { t: T(t.stayed - 0.2), v: 0.2 }, { t: T(t.is21), v: 36, ease: "inOut" }] } });
  objects.push({ id: "fansA", type: "fans", count: 100, cols: 10, spacing: 0.27, keys: { arrive: [{ t: T(t.so13 - 0.9), v: 0 }, { t: T(t.so13 + 0.3), v: 1 }], leave: [{ t: T(t.drift), v: 0 }, { t: T(t.three20 + 0.6), v: 1 }] } });
  objects[objects.length - 1].root = [railA[0], 0, railA[2] + 2.4];
  objects.push({ id: "fansB", type: "fans", count: 100, cols: 10, spacing: 0.27, keys: { arrive: [{ t: T(t.so13 - 0.7), v: 0 }, { t: T(t.so13 + 0.5), v: 1 }] } });
  objects[objects.length - 1].root = [railB[0], 0, railB[2] + 2.4];
  objects.push({ id: "tilesA", type: "tiles", rail: "railA", months: months(3), side: -1.1, keys: { shown: [{ t: T(t.ten20), v: 0 }, { t: T(t.three20), v: 3, ease: "linear" }], checked: [{ t: 0, v: 0 }] } });
  objects.push({ id: "tilesB", type: "tiles", rail: "railB", months: months(36), side: 1.1, keys: { shown: [{ t: T(t.stayed - 0.2), v: 0 }, { t: T(t.is21), v: 36, ease: "inOut" }], checked: [{ t: T(t.stayed), v: 0 }, { t: T(t.is21 + 0.2), v: 36, ease: "inOut" }] } });
  objects.push({ id: "coinsA", type: "stacks", rail: "railA", months: months(3), side: 1.0, keys: { filled: [{ t: T(t.ten20 + 0.4), v: 0 }, { t: T(t.three000), v: 3, ease: "linear" }] } });
  objects.push({ id: "coinsB", type: "stacks", rail: "railB", months: months(36), side: -1.0, keys: { filled: [{ t: T(t.stayed), v: 0 }, { t: T(t.k36), v: 36, ease: "inOut" }] } });
  objects.push({ id: "gap", type: "bracket", from: [railB[0] - 1.0, 0.9, railB[2] - 4 * 1.1], to: [railB[0] - 1.0, 0.9, railB[2] - 36 * 1.1], keys: { grow: [{ t: T(t.diff - 0.05), v: 0 }, { t: T(t.diff + 0.8), v: 1, ease: "out" }] } });
  shot(t.so13 - 0.05, [0, 7.2, railA[2] + 14], [0, 0.5, railA[2] + 1.6], 42);
  move(t.gap, [0, 6.0, railA[2] + 11], [0, 0.6, railA[2] + 1.2], 42, "soft");
  move(t.one15 - 0.1, [0, 5.6, railA[2] + 10], [0, 0.7, railA[2] + 1.0], 42, "soft");
  tag("TWO VERSIONS", t.versions, t.same13, { screen: [540, 330], style: "big" });
  tag("SAME 100 PEOPLE", t.same13, t.gap, { screen: [540, 330], style: "dark" });
  tag("SAME PRICE", t.price13, t.gap, { screen: [540, 420], style: "dark" });
  tag("ONE DIFFERENCE", t.difference13, t.gap, { screen: [540, 510], style: "tag" });
  tag("$ ? ? ?", t.gap, t.one15, { screen: [540, 360], style: "gold", label: "the withheld gap, masked" });
  s("pass", t.versions); s("tick", t.difference13); s("swell", T(t.small - 0.9));

  // The stage again: "to Smino?"
  shot(t.so19 - 0.05, at("stage", -0.25, 2.25, 9.4), at("stage", 0, 2.45, 0), 38);
  move(t.members - 0.05, at("stage", 0.2, 2.2, 8.0), at("stage", 0, 2.4, 0), 38, "soft");
  tag("100 PAYING FANS", t.so19 + 0.2, t.members, { screen: [540, 1440], style: "dark" });
  tag("$ ? ? ?", t.so19 + 0.4, t.members, { screen: [540, 400], style: "gold", label: "the withheld answer, masked" });

  // THE REVEAL. Path A: 3 months, the fans drift off, $3,000.
  shot(t.members - 0.02, [railA[0] - 3.0, 8.5, railA[2] + 11.5], [railA[0], 0.3, railA[2] - 0.8], 40);
  move(t.three000, [railA[0] - 2.4, 6.2, railA[2] + 7.0], [railA[0], 0.4, railA[2] - 2.0], 40, "inOut");
  tag("100 MEMBERS", t.members + 0.1, t.three000, { obj: "fansA", offset: [0, 1.6, 0], style: "tag" });
  tag("$10 A MONTH", t.ten20, t.three000, { screen: [540, 330], style: "dark" });
  tag("3 MONTHS", t.three20, t.the21, { obj: "railA", month: 3, offset: [0, 1.4, 0], style: "tag" });
  tag("", t.ten20 + 0.4, t.the21, { screen: [540, 470], style: "num", counter: { from: 0, to: 3000, t0: T(t.ten20 + 0.4), t1: T(t.three000), prefix: "$", ease: "linear" } });
  s("coin", T(t.ten20 + 0.4 + (t.three000 - t.ten20 - 0.4) / 3)); s("coin", T(t.ten20 + 0.4 + 2 * (t.three000 - t.ten20 - 0.4) / 3)); s("impact", t.three000, -8);

  // Path B: the same fans, the same $10, three years because he kept showing up: $36,000.
  shot(t.the21 - 0.02, [railB[0] + 3.0, 8.5, railB[2] + 11.5], [railB[0], 0.3, railB[2] - 0.8], 40);
  move(t.stayed, [railB[0] + 3.0, 6.6, railB[2] + 7.5], [railB[0], 0.4, railB[2] - 4], 40, "inOut");
  move(t.k36, [railB[0] + 6.5, 9.5, railB[2] - 8], [railB[0], 0.3, railB[2] - 28], 44, "inOut");
  tag("SAME 100 PEOPLE", t.the21 + 0.1, t.stayed, { screen: [540, 330], style: "dark" });
  tag("SAME $10", t.ten21, t.stayed, { screen: [540, 420], style: "dark" });
  tag("3 YEARS", t.years, t.diff, { screen: [540, 610], style: "tag" });
  tag("KEPT SHOWING UP", t.showing, t.k36, { screen: [540, 330], style: "dark" });
  tag("", t.stayed, t.diff, { screen: [540, 470], style: "num", counter: { from: 0, to: 36000, t0: T(t.stayed), t1: T(t.k36), prefix: "$", ease: "inOut" } });
  s("shimmer", T(t.stayed + 0.3)); s("travel", T(t.stayed + 0.6), -18); s("impact", t.k36, -5);

  // The comparison: both rails from above, the 33 stacks bracketed.
  shot(t.diff - 0.02, [0, 13.5, railA[2] + 9], [0, 0, railA[2] - 11], 46);
  move(t.and23 - 0.05, [0, 15.5, railA[2] + 10.5], [0, 0, railA[2] - 13], 46, "soft");
  tag("$33,000", t.diff, t.and23, { screen: [540, 360], style: "gold" });
  tag("DIFFERENCE", t.diff + 0.25, t.and23, { screen: [540, 490], style: "dark" });
  tag("SAME FANS. SAME PRICE.", t.sameFans, t.and23, { screen: [540, 1150], style: "tag" });
  s("impact_big", t.diff);

  // Getting them is hard: ads, rollout, a year of work, walls in front of the fans.
  objects.push({ id: "fansHard", type: "fans", count: 100, cols: 10, spacing: 0.42, keys: { arrive: [{ t: T(t.getting - 1.1), v: 0 }, { t: T(t.getting + 0.2), v: 1 }] } });
  objects[objects.length - 1].root = at("hard", 0, 0, -3.2);
  [["ADS", t.ads], ["ROLLOUT", t.rollout], ["YEAR OF WORK", t.year]].forEach(([txt, t0], i) => objects.push({ id: `wall${i}`, type: "card", face: "app", size: [2.0, 0.8], data: { title: txt, rows: 0 },
    keys: { pos: [{ t: T(t0 - 0.05), v: at("hard", (i - 1) * 0.15, -1.2, 0.8 - i * 0.2) }, { t: T(t0 + 0.4), v: at("hard", (i - 1) * 0.15, 0.05 + i * 0.9, 0.8 - i * 0.2), ease: "back" }], rot: [{ t: 0, v: [0, (i - 1) * 0.12, 0] }], opacity: show(t0, t.keeping, 0.05) } }));
  shot(t.getting - 0.02, at("hard", 1.8, 3.6, 11.5), at("hard", 0, 2.0, -1), 40);
  move(t.keeping - 0.06, at("hard", 1.0, 3.2, 9.8), at("hard", 0, 2.1, -1), 40, "soft");
  tag("THE HARD PART", t.hard - 0.1, t.keeping, { screen: [540, 330], style: "big" });
  s("pop", t.ads); s("pop", t.rollout); s("pop", t.year);

  // Keeping them is the easy part, and a forgotten promise feels like a busy week.
  shot(t.keeping - 0.02, at("life", -5.0, 3.0, -8.5), at("life", 0.5, 0.6, -15), 40);
  move(t.forgotten, at("life", -3.4, 2.0, -12.0), at("life", 1.3, 0.6, -16.0), 38, "inOut");
  move(t.busy + 0.3, at("life", -2.4, 1.6, -13.4), at("life", 1.3, 0.5, -16.0), 36, "soft");
  tag("THE EASY PART", t.easy - 0.1, t.forgotten, { screen: [540, 330], style: "big" });
  tag("EVERYBODY LOSES", t.loses - 0.1, t.forgotten, { screen: [540, 440], style: "dark" });
  tag("A FORGOTTEN PROMISE", t.forgotten, t.feels, { screen: [540, 330], style: "dark" });
  tag("A BUSY WEEK", t.feels + 0.2, T(t.now26), { obj: "lifeRail", month: 10, offset: [1.3, 1.5, 0], style: "tag" });
  s("thud", t.feels, -16);

  // ------------------------------------------------------------------ beats
  const world = (at0, scene, medium, extra = {}) => B(at0, scene, { aroll: "world", medium, ...extra });
  // Hook: split at "much" so the frame visibly changes inside a second (the fans land).
  world(0, "hook_open", "3d", { lines: [0], role: "hook", phrase: L(0), sound: "pop", notes: "3D Smino on a festival stage, his name on the screen; 100 fans drop in; value masked" });
  world(t.much, "hook_open", "3d", { lines: [0], role: "hook", phrase: L(0), continued: true, notes: "camera keeps pushing in" });
  B(t.youre, "aroll_punch", { lines: [1], role: "hook_turn", phrase: L(1), sound: "riser_drop", medium: "aroll", transition: "punch" });
  world(t.sminoWent, "fullscreen_proof", "3d", { lines: [2], role: "setup", phrase: L(2), notes: "close on the 3D Smino under a spotlight" });
  B(t.what2 + 0.2, "aroll_hero", { lines: [2], role: "setup", phrase: L(2), medium: "aroll" });
  world(t.now3, "fullscreen_proof", "3d", { lines: [3], role: "setup", phrase: L(3), text: ["FIRST INDEPENDENT ALBUM"], notes: "designed sleeve (no album art) + the 3D Smino pointing to it" });
  world(t.he3, "fullscreen_proof", "3d", { lines: [4], role: "setup", phrase: L(4), notes: "the 3D Smino performing to a crowd, six beams" });
  world(t.and4, "motion_concept", "3d", { lines: [4], role: "setup", phrase: L(4), notes: "tickets and merch reach the crowd, the stream fades" });
  B(t.hes5, "aroll_hero", { lines: [5], role: "setup", phrase: L(5), medium: "aroll", transition: "whip", sound: "whoosh" });
  B(t.nobody5, "aroll_punch", { lines: [5], role: "setup", phrase: L(5), medium: "aroll", notes: "'nobody above him'" });
  B(t.now6, "aroll_hero", { lines: [6], role: "mechanism", phrase: L(6), medium: "aroll" });
  world(t.going7, "motion_concept", "3d", { lines: [7], role: "mechanism", phrase: L(7), notes: "launch spike, then DELIVERY: the rail runs into the fog" });
  world(t.because8, "motion_concept", "3d", { lines: [8], role: "mechanism", phrase: L(8), notes: "fans pay, a tile per month, the promises named" });
  world(t.and9, "motion_concept", "3d", { lines: [9], role: "mechanism", phrase: L(9), notes: "one tile missed; the fans quietly leave" });
  B(t.thats10, "aroll_punch", { lines: [10], role: "mechanism", phrase: L(10), medium: "aroll" });
  world(t.everybody11, "comparison", "3d", { lines: [11], role: "mechanism", phrase: L(11), notes: "the offer card, the loose promises, the calendar that holds them" });
  B(t.and12, "aroll_hero", { lines: [12], role: "mechanism", phrase: L(12), medium: "aroll" });
  B(t.today - 0.2, "aroll_punch", { lines: [12], role: "mechanism", phrase: L(12), medium: "aroll", notes: "TODAY" });
  world(t.announced, "motion_concept", "3d", { lines: [12], role: "mechanism", phrase: L(12), notes: "the caption, one app, another app, which tier" });
  world(t.so13, "comparison", "3d", { lines: [13, 14], role: "mechanism", phrase: L(13), notes: "two versions, the gap masked" });
  B(t.one15, "aroll_punch", { lines: [15], role: "detour_open", phrase: L(15), medium: "aroll", transition: "whip", sound: "whoosh", text: ["SIDENOTE"], labels: ["SIDENOTE"], graphic: { component: "Chip", props: { text: "SIDENOTE" } } });
  B(t.your16, "motion_concept", { aroll: "hidden", lines: [16], role: "detour_thesis", phrase: L(16), medium: "2d", captions: "off", text: ["YOUR PROBLEM AINT MARKETING THE FANS.", "IT'S THAT YOU NEED A MARKET FOR FANS."], graphic: { component: "Thesis", props: { lines: ["YOUR PROBLEM AINT MARKETING THE FANS.", "IT'S THAT YOU NEED A MARKET FOR FANS."] } }, notes: "the thesis: the one place type is the visual" });
  world(t.market17, "motion_concept", "3d", { lines: [17], role: "detour_crwn", phrase: L(17), notes: "kept promises: every tile turns gold" });
  B(t.every17, "crwn_mechanism", { aroll: "hidden", lines: [17], role: "detour_crwn", phrase: L(17), medium: "ui", evidence: "product", text: ["EVERY BENEFIT ON A TIER"], graphic: { component: "Footage", props: { footage: "crwn-tier-benefits-plug", offset: 3.0, move: [{ scale: 1.08, y: 40 }, { scale: 1.22, y: -60 }], labels: [{ text: "EVERY BENEFIT ON A TIER", at: T(t.every17 + 0.3), y: 300 }] } }, broll: { asset: "crwn-tier-benefits-plug" }, assetSource: "CRWN app screen recording (owned)", notes: "real CRWN: a tier's benefit list" });
  world(t.dated - 0.3, "crwn_mechanism", "3d", { lines: [17], role: "detour_crwn", phrase: L(17), notes: "the benefit lands on a date, tied to the fans it is owed to (tierObligations.ts)" });
  B(t.anyway, "aroll_punch", { lines: [18], role: "detour_close", phrase: L(18), medium: "aroll", transition: "whip", sound: "whoosh" });
  world(t.so19, "withheld_tease", "3d", { lines: [19], role: "restate", phrase: L(19), notes: "back to Smino and his 100 fans" });
  world(t.members, "numeric_reveal", "3d", { lines: [20], role: "reveal", phrase: L(20), captions: "on", notes: "path A: 3 stacks, the fans drift off" });
  world(t.the21, "numeric_reveal", "3d", { lines: [21], role: "payoff", phrase: L(21), notes: "path B: 36 stacks, every promise kept" });
  world(t.diff, "numeric_reveal", "3d", { lines: [22], role: "payoff", phrase: L(22), captions: "off", notes: "both paths from above, the 33 stacks bracketed" });
  B(t.and23, "aroll_hero", { lines: [23], role: "payoff", phrase: L(23), medium: "aroll" });
  world(t.getting, "motion_concept", "3d", { lines: [24], role: "payoff", phrase: L(24), notes: "ads, rollout, a year of work stack up in front of the fans" });
  world(t.keeping, "motion_concept", "3d", { lines: [25], role: "payoff", phrase: L(25), notes: "the easy part, and one tile quietly missed" });
  B(t.now26, "aroll_hero", { lines: [26], role: "qualifier", phrase: L(26), medium: "aroll", text: ["NOT A FORECAST", "ARITHMETIC, NOT A FORECAST"], labels: ["ARITHMETIC, NOT A FORECAST"], graphic: { component: "QualifierCard", props: { text: "ARITHMETIC, NOT A FORECAST", sub: "Real fanbases move in and out." } }, notes: "the qualifier he spoke, legible for its whole line" });
  B(t.but27, "aroll_hero", { lines: [27, 28], role: "question", phrase: L(28), medium: "aroll" });
  B(t.written - 0.1, "aroll_punch", { lines: [28], role: "question", phrase: L(28), medium: "aroll" });
  B(t.built, "cta_tool", { aroll: "hidden", lines: [29], role: "cta_tool", phrase: L(29), medium: "calculator", evidence: "product", text: ["FREE CALCULATOR"], graphic: { component: "Footage", props: { footage: "tool-opportunity-calculator-v2", offset: 0, rate: 0.7, move: [{ scale: 1.02, y: 0 }, { scale: 1.12, y: -30 }], labels: [{ text: "FREE CALCULATOR", at: T(t.free29), y: 300 }] } }, broll: { asset: "tool-opportunity-calculator-v2" }, assetSource: "CRWN calculator screen recording (owned)", notes: "the calculator owns the frame; ends before the demo result figure" });
  B(t.comment, "cta_keyword", { lines: [30], role: "cta_keyword", phrase: L(30), medium: "aroll", captions: "off", sound: "pop", text: ["COMMENT FREE"], graphic: { component: "Keyword", props: { keyword: P.structure.ctaKeyword } } });

  // The product benefit becomes a dated obligation: a benefit card flies to a date tile.
  objects.push({ id: "benefitCard", type: "card", face: "tier", size: [1.6, 2.1], px: 520, data: { title: "BENEFIT", price: "", lines: ["Early listens"] }, label: "the tier benefit he names",
    keys: { pos: [{ t: T(t.dated - 0.3), v: at("life", -3.2, 2.6, -3) }, { t: T(t.dated + 0.6), v: at("life", 1.3, 1.25, -6.4), ease: "inOut" }], scale: [{ t: T(t.dated - 0.3), v: 1 }, { t: T(t.dated + 0.6), v: 0.45, ease: "inOut" }], rot: [{ t: 0, v: [0, -0.3, 0] }], opacity: show(t.dated - 0.3, t.anyway, 0.2) } });
  shot(t.market17 - 0.02, at("life", -6.5, 3.4, 2.5), at("life", 0.6, 0.6, -8), 38);
  move(t.every17, at("life", -5.2, 2.8, -1.5), at("life", 0.6, 0.6, -10), 38, "soft");
  shot(t.dated - 0.32, at("life", -4.0, 3.0, -1.0), at("life", 0.8, 0.9, -6.4), 38);
  move(t.anyway, at("life", -2.6, 2.2, -3.6), at("life", 1.3, 0.9, -6.4), 36, "soft");
  tag("KEPT PROMISES", t.kept, t.every17, { screen: [540, 330], style: "big" });
  tag("PROMISE CALENDAR", t.promise17, t.every17, { screen: [540, 450], style: "dark" });
  tag("A DATED OBLIGATION", t.dated, t.fans17, { screen: [540, 330], style: "dark" });
  tag("THE FANS IT'S OWED TO", t.fans17, t.anyway, { screen: [540, 330], style: "dark" });
  tag("STOPS LIVING IN YOUR HEAD", t.stops, t.anyway, { screen: [540, 430], style: "tag" });
  s("tick", T(t.promise17 - 0.8)); s("tick", T(t.promise17 - 0.3)); s("shimmer", T(t.promise17 - 1.2), -20); s("tap", T(t.every17 + 0.6)); s("tap", T(t.every17 + 1.9)); s("travel", T(t.dated - 0.3), -18); s("tick", T(t.dated + 0.6));

  P.set("world", { env: { bg: "#0D0D0D", fog: [18, 70] }, camera: cam.sort((a, b) => a.t - b.t), objects: objects.map((o) => (o.root && !o.pos ? { ...o, keys: { ...o.keys }, pos: o.root } : o)), tags });
  P.set("sfx", sfx);
  // Silence before the payoffs: the music drops out under the last breath before each
  // figure lands, then returns with the impact.
  P.set("musicDrops", [{ from: T(t.three000 - 0.6), to: t.three000, fade: 0.25 }, { from: T(t.k36 - 0.7), to: t.k36, fade: 0.25 }, { from: T(t.diff - 1.0), to: t.diff, fade: 0.35 }]);
}
