# Image Scorecard

Grade every short-form image PROMPT on this **before generating** (and re-check the rendered image). On a muted autoplay feed the thumbnail is judged in the first second, before audio — so the image sets skip before a word is heard. Calibrated from the 15-video set in `reference_shortform_metrics_dataset`; composition model in `crwn-image-gen` (Story-First Composition) and `feedback_shortform_performance_model`.

---

## Why this gate exists (the action lever)

Beyond "have a face," the single biggest image driver is whether the **named subject is mid-action dramatizing the payoff.** #2 (Drake hauling the debt-bag in chains) and #58 (DMX shoving the money boulder into the vault) encode the thesis as motion — read in one second. #8 had an action (Drake hammering ice) and still died, because the action depicted the **news event**, not the claim. Static portraits, homework-density text walls, stray desk objects, and generic stick figures (#57, #7) are the floor.

---

## Hard gates (any fail = rewrite the prompt, regenerate)

1. **PRIMARY subject DOMINANT + LARGE + mid-ACTION (dynamic verb, never a static pose).** The person named in the title is the largest, most central figure, drawn LARGE and close (filling roughly half the page height or more, a big close hero, not a small full-body figure marooned in white space), caught performing a dynamic action — hauling, grabbing, snatching, shoving, locking, climbing, pushing. A static pose (standing, arms-crossed, posing on a block, floating head-shot) FAILS even if recognizable. The action must be a WHOLE-BODY motion (walking, striding, running, climbing, lunging, bursting through), NOT just an arm gesture (holding, pointing, one hand up) on an otherwise standing figure. Secondary people are clearly smaller and peripheral, never co-equal. `skip-people` only for true faceless concept posts.
2. **The top HEADLINE IS the script's opening QUESTION hook — a full question, ≥38 characters, never a statement, never the payoff.** Letter the script's sentence-1 question across the top. A fragment or a declarative setup ("HE TOLD THE MAJORS NO.") fails. The payoff (the answer) is NEVER in text — only a small visual hint the viewer decodes (a note passing hands, a hand reaching in with money, a tiny check dwarfed by a record mountain). Spelling the reveal in text spoils the gap. *(MJ: "WHO TOLD MICHAEL TO GRAB PAUL'S OWN SONGS?"; the answer is a note slipping from Paul's hand, not a caption.)*
3. **PURE WHITE FLAT SHEET, 100% SHARPIE.** #FFFFFF, no desk/surface/stray objects (no stapler), no typeset/printed/bold-font text anywhere.
4. **RECOGNIZABLE PERSON, NOT A STICK FIGURE/ICON** for named-artist posts (person ref attached) — and the face must FACE THE CAMERA (front or 3/4 view, fully visible), never a pure profile or back-of-head, or the likeness dies even with a good ref.
5. **HIGH CONTRAST — heavy black, ≥~33% of the page filled solid black** (clothing, hair, suits, bags, vaults, key shapes filled with marker texture; thick strokes). A thin all-outline look fails; the page reads bold black-on-white from across a room. *(Also: never draw 3+ identically-labeled figures — the model duplicates them; use one representative figure + text.)*

---

## Score it: 100 points (must clear 80 AND all hard gates)

### HERO (45) — the dramatized scene
- [ ] **One central illustration that DRAMATIZES the payoff is the largest element** (20) — character in an action/situation encoding the emotional point; never a calculation or floating head as the focal point.
- [ ] **The recognizable artist is PERFORMING that action** (15) — star power fused into the scene, not beside it.
- [ ] **The action dramatizes the CLAIM, not the news event** (10) — (#8's hammer-on-ice = event = didn't help).

### LEGIBILITY (30)
- [ ] **One oversized legible hook** (a single huge number or the contradiction headline); no sub-penny fractions or equation wall as focal point (12).
- [ ] **One focal point + whitespace, OR a clear top-to-bottom eye-path if dense** (10) — #21 worked dense via a spine; #4/#9 failed scattered.
- [ ] **No homework-density wall of small text** — clutter cap: one hero + ~2 supporting numbers dominate (8).

### SUBSTANCE + SAVE (15) — the hybrid
- [ ] **Key data retained as supporting structure** beneath/around the hero (the real numbers, the split, the comparison) (8) — gives save/rewatch value; the hero makes them feel it, the data makes them keep it. **Include SEVERAL data lines (~4-6 short setup labels/numbers), not just 1-2 — a headline + 2 labels reads thin.** Keep the PAYOFF/reveal out of text.
- [ ] **The kept data is the save-worthy concrete payload** (a number/mechanism), not a slogan (7).

### CRAFT (10)
- [ ] **Hand-drawn marker texture on fills** (uneven, directional strokes), thin lines clean (5).
- [ ] **No CRWN/crown/brand bleed from the style refs; draw only what the prompt specifies** (5).
- [ ] **No leaked directions as text** — only the intended headline/labels/data appear as words; no scene/camera/action directions ("face the camera", "swat away", "mid-stride") rendered as text. (Guard: quote only text-to-render; write directions in lowercase prose. Enforced by the STYLE_INSTRUCTION TEXT DISCIPLINE rule.)
- [ ] **No emphasis/instruction words leaking onto a labeled object.** An UPPERCASE or stressed directive word placed right next to a quoted label list gets rendered onto the label. Real bug (Jay-Z crates): "each crate labeled ONCE with..." → drew "ONCE" on every crate; reworded to "as its ONLY text" → drew "ONLY". Fix: state labels BARE and self-contained ("the crates say CHAMPAGNE, COGNAC, TIDAL, ROC NATION; no other words on the crates"), keep directive words (once, only, exactly, labeled, single) in a SEPARATE sentence far from the quoted labels, and add the offending word to the forbidden-text list.

---

## Grade bands

| Score (gates passed) | Verdict |
|---|---|
| 90–100 | Hero image (the #2/#58 profile) — generate |
| 80–89 | Strong — generate |
| 65–79 | Static or cluttered — recompose into a dramatized scene before generating |
| under 80, or any hard gate failed | Rewrite the prompt (action-ify the hero, cut clutter, fix the headline) |

## The one rule

**Draw the PRIMARY artist mid-action (a dynamic verb, never a pose) so the picture argues the payoff silently, top it with a one-second HOOK or question (never the answer), let one small visual element hint the reveal, keep the save-worthy data beside it, on a clean white sheet.** A dramatized scene beats a correct spreadsheet every time; and text that spells the reveal spoils the gap.
