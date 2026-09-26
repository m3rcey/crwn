// PROTOTYPE plan (2026-09-25): ~23s of Fan Economy 23, Smino, built to answer ONE question
// from docs/REEL_MEDIA_ARCHITECTURE.md: can real media + 2.5D depth + annotation + sound
// design reach the premium-reference class? It is not the reel, never exported, and it
// carries an uncleared asset (the album cover, PROTOTYPE_ONLY_NOT_CLEARED_FOR_PUBLICATION).
//
// Spoken lines 0, 1, 3, 6, 7 (project.json "exclude" + "excludeSrc"). Line 6 is in because
// "after that" runs straight into "Going" with no room tone: the phrase-integrity gate
// refused a cut there, so the prototype enters line 7 through line 6 instead.
//
//   hook      2.5D: Smino matted over a separate photographic crowd, SMINO behind his head,
//             the fans in FRONT of him, the count, the value withheld ($???)
//   return    his A-roll, the portrait crop, on "You're about to find out"
//   collage   the album as the ONE dominant print; the 2024 photo and the facts pinned on
//   return    A-roll on "Now here's what actually happens right after that"
//   timeline  a short launch spike, then a delivery line that keeps going, over a real planner
//
// Media per beat: 2.5d | aroll | photo | motion (descriptive, for the coverage report).

export default async function plan(P) {
  const { w } = P;
  const B = (at, scene, extra = {}) => P.beat({ at, scene, captions: "on", ...extra });
  const T = (x) => +x.toFixed(3);

  const t = {
    smino: w(0, "Smino's"), hundred: w(0, "100"), fans: w(0, "fans"), worth: w(0, "worth"), independent0: w(0, "independent"), artist: w(0, "artist?"),
    youre: w(1, "You're"), now3: w(3, "Now"), maybe: w(3, "Maybe"), december: w(3, "December"), his3: w(3, "his"), independently: w(3, "independently"), album: w(3, "album."),
    now6: w(6, "Now"), going: w(7, "Going"), launch: w(7, "launch"), about: w(7, "about"), delivery: w(7, "DELIVERY"), rest: w(7, "rest"), life: w(7, "life."),
  };
  const hookEnd = T(t.youre - 0.16);
  const collageAt = T(t.maybe - 0.12);
  const returnAt = T(t.now6 - 0.1);
  // The timeline opens ON "launch": opening it at "Going" left 1.4s of a bare planner (render v1 review).
  const timelineAt = T(t.launch - 0.3);
  const sfx = [];
  const s = (kind, at, gain) => sfx.push({ kind, at: T(at), ...(gain !== undefined ? { gain } : {}) });

  // ----------------------------------------------------------------- 1. the hook (2.5D)
  // Depth, back to front: the crowd photograph (blurred, warm), an amber glow, SMINO
  // (partly behind his head), Smino himself (the matte), the fans IN FRONT of him, then
  // the count and the withheld value on the glass. The camera arrives, drifts, pushes on
  // "worth", and flies through him into his A-roll.
  B(0, "hook_open", {
    aroll: "hidden", medium: "2.5d", lines: [0], role: "hook", sound: null,
    text: ["SMINO", "100 PAYING FANS", "WORTH $???"], labels: ["WORTH $???"],
    notes: "withheld: the value is $??? (never $3,000/$36,000/$33,000 here)",
    graphic: {
      component: "Layers",
      props: {
        perspective: 1400,
        layers: [
          { id: "crowd", asset: "broll-crowd-silhouettes", z: -1100, cover: 1.45, filter: "blur(3px) brightness(.8) contrast(1.2) sepia(.55) saturate(1.4)" },
          { id: "glow", z: -650, sw: 1600, sh: 1600, sy: 820, sx: 640, fill: "radial-gradient(circle,rgba(232,163,61,.5),rgba(194,87,26,.16) 40%,rgba(0,0,0,0) 64%)" },
          { id: "name", z: -380, text: "SMINO", cls: "d25-name", sw: 1080, sh: 330, sy: 610, size: 330, in: { at: t.smino, from: { opacity: 0, y: 70, scale: 1.12 }, dur: 0.45, ease: "power4.out" } },
          { id: "smino", asset: "broll-smino-nye-2016-cutout", z: 0, sw: 900, aspect: 2580 / 1637, sx: 650, bottom: 1960, fit: "contain", pos: "50% 100%", shadow: true, in: { at: 0, from: { opacity: 0, y: 60, scale: 1.06 }, dur: 0.6, ease: "power3.out" } },
          { id: "fans", asset: "broll-stage-beams", z: 260, sw: 1560, sh: 560, sx: 540, bottom: 2000, fit: "cover", pos: "50% 100%", filter: "blur(2px) brightness(.85) sepia(.8) saturate(1.5) hue-rotate(-14deg) contrast(1.2)", mask: "linear-gradient(to top,#000 62%,transparent 100%)", in: { at: 0.05, from: { opacity: 0, y: 120 }, dur: 0.6, ease: "power3.out" },
            tweens: [{ at: t.hundred - 0.1, from: { y: 110 }, to: { y: -30 }, dur: 0.6, ease: "power3.out" }] },
        ],
        camera: [
          { t: 0, z: -260, x: 110, ry: -5 },
          { t: 0.8, z: -40, x: 50, ry: -2.5, ease: "power3.out" },
          { t: t.worth, z: 70, x: -30, ry: 1, ease: "sine.inOut" },
          { t: T(hookEnd - 0.34), z: 240, x: -90, ry: 3.5, ease: "power2.inOut" },
          { t: hookEnd, z: 950, x: -110, ry: 4, ease: "power3.in" },
        ],
        annotations: [
          { type: "counter", x: 80, y: 830, from: 0, to: 100, at: t.hundred, dur: 0.75, size: 128, unit: "PAYING FANS", w: 420 },
          { type: "label", style: "dark", x: 80, y: 1100, text: "WORTH $???", size: 44, at: t.worth, pop: true, w: 380 },
          { type: "circle", x: 245, y: 1134, rx: 200, ry: 66, at: t.independent0 - 0.1, dur: 0.5, color: "#D4AF37", width: 8 },
          { type: "label", style: "credit", x: 90, y: 1560, text: "Photo: swimfinfan, CC BY-SA 2.0", at: 0.4, box: false },
        ],
      },
    },
  });
  s("pass", 0, -16);
  s("soft_hit", 0.12, -12);
  s("impact", t.smino, -9);
  s("shimmer", t.hundred, -20);
  s("swell", t.worth - 0.4, -15);
  s("pass", hookEnd - 0.3, -14);

  // ----------------------------------------------------------------- 2. back to him
  // The founder's hook drop: the beat drops mid "You're about to find out" and a riser
  // peaks on the drop (soundPlan riser_drop).
  B(hookEnd, "aroll_hero", { aroll: "full", medium: "aroll", lines: [1, 3], transition: "whip", sound: "riser_drop", notes: "intentional return: the camera flew through him into his own frame" });

  // ----------------------------------------------------------------- 3. the collage
  // ONE dominant print (the album), one supporting print (him in 2024, the album's own
  // year), facts pinned on the words that state them, over a warm-graded stage.
  B(collageAt, "fullscreen_proof", {
    aroll: "hidden", medium: "photo", lines: [3],
    text: ["MAYBE IN NIRVANA", "DECEMBER 2024", "HIS FIRST INDEPENDENT ALBUM"],
    graphic: {
      component: "Collage",
      props: {
        bg: { asset: "broll-stage-beams", filter: "blur(7px) brightness(.4) sepia(.75) saturate(1.5) hue-rotate(-12deg) contrast(1.1)" },
        glowY: 760,
        items: [
          { id: "cover", asset: "broll-maybe-in-nirvana-cover", dominant: true, sx: 560, sy: 720, sw: 700, aspect: 1, rot: -2.5, at: t.maybe - 0.05,
            tweens: [{ at: T(t.album + 0.2), to: { scale: 1.03 }, dur: 0.6 }] },
          { id: "era", asset: "broll-smino-85south-2024-plate", sx: 215, sy: 1030, sw: 320, aspect: 808 / 618, rot: -7, z: 120, at: t.his3 - 0.1, pos: "50% 30%" },
        ],
        camera: [
          { t: collageAt, z: -60, x: 30, ry: -1.5 },
          { t: T(collageAt + 0.6), z: 0, x: 0, ry: 0, ease: "power3.out" },
          { t: returnAt, z: 120, x: -30, ry: 1.5, ease: "sine.inOut" },
        ],
        annotations: [
          { type: "label", style: "tag", x: 540, y: 262, align: "center", text: "MAYBE IN NIRVANA", at: t.maybe + 0.15, pop: true, w: 480 },
          { type: "label", style: "dark", x: 1000, y: 392, align: "right", rot: 5, text: "DECEMBER 2024", at: t.december, pop: true, size: 40, w: 340 },
          { type: "label", style: "marker", x: 936, y: 1098, align: "right", text: "HIS FIRST\nINDEPENDENT ALBUM", at: t.his3, size: 62, w: 470 },
          { type: "underline", x: 476, y: 1222, w: 275, at: t.independently, dur: 0.4, color: "#D4AF37", width: 9 },
          { type: "arrow", from: [560, 1112], to: [520, 1030], bend: 0.3, at: t.his3 + 0.25, dur: 0.4, color: "#FFFFFF", width: 7 },
        ],
        credit: "Cover: Maybe in Nirvana (PROTOTYPE ONLY, not cleared) · Photo: The 85 South Comedy Show, CC BY 4.0",
        creditY: 1585,
      },
    },
  });
  s("whoosh", collageAt, -13);
  s("soft_hit", t.maybe, -11);
  s("pop", t.december + 0.05, -16);
  s("whoosh", t.his3 - 0.1, -17);

  // ----------------------------------------------------------------- 4. back to him
  B(returnAt, "aroll_hero", { aroll: "push", medium: "aroll", lines: [6, 7], transition: "cut" });

  // ----------------------------------------------------------------- 5. the timeline
  B(timelineAt, "motion_concept", {
    aroll: "hidden", medium: "motion", lines: [7],
    text: ["LAUNCH", "ABOUT A MONTH", "DELIVERY", "THE REST OF YOUR LIFE"],
    graphic: {
      component: "Timeline",
      props: {
        bg: { asset: "broll-planner-month", pos: "50% 12%", y: 480, cover: 1.5 },
        startAt: T(timelineAt + 0.1),
        launch: { at: t.launch, label: "LAUNCH", sub: "ABOUT A MONTH", subAt: t.about },
        delivery: { at: t.delivery, label: "DELIVERY", restAt: t.rest, rest: "THE REST OF\nYOUR LIFE", drawEnd: T(t.life + 0.3) },
        markers: 12,
        baseY: 1010,
      },
    },
  });
  s("travel", timelineAt, -16);
  s("impact", t.launch, -6);
  s("soft_hit", t.delivery, -11);
  s("shimmer", t.delivery + 0.2, -17);
  s("swell", t.rest - 0.5, -15);

  P.set("sfx", sfx);
  P.set("sfxPerMinute", 40);
  // The bed BUILDS: low under the question, lifts into the album, sits back under the
  // A-roll, and rises to full on the launch/delivery line (relative dB; voice still wins
  // by the founder's fixed margin, and the sidechain still ducks it under speech).
  P.set("musicGain", [
    { t: 0, db: -8 }, { t: hookEnd, db: -5 }, { t: collageAt, db: -3 }, { t: returnAt, db: -6 },
    { t: T(t.going), db: -4 }, { t: t.launch, db: -1 }, { t: t.delivery, db: 0 },
  ]);
  P.set("musicDrops", [{ from: T(t.launch - 0.35), to: t.launch, fade: 0.12 }]);
}
