// Composable slide pieces for the CRWN VSL deck.
// The SHELL (crown rail, headline block, footer note) is shared by every slide, which is what
// makes 16 slides read as one deck. Everything below it is a body primitive the deck composes.
import { PALETTE as C, CROWN, SLIDE, rich, brush, arrow } from "./theme.mjs";
import { icon, person } from "./icons.mjs";

const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ------------------------------------------------------------------ shell */

/**
 * The frame every slide wears.
 * @param head      headline copy; [[gold]] and ~~struck~~ are honoured
 * @param headSize  px; set it per slide rather than letting long copy shrink silently
 * @param brushUnder width in px of the hand-drawn underline beneath the headline, or 0
 * @param foot      { hand, handUnderline, disclaim, bold } rendered under the body
 * @param faint     background doodles: [{icon, size, top, left, right, bottom, rotate}]
 */
export function shell({
  num,
  deck = "HOW MUCH IS ONE REAL FAN WORTH?",
  head,
  headSize = 92,
  sub = "",
  align = "center",
  brushUnder = 0,
  brushOffset = 0,
  subHand = false,
  body = "",
  foot = null,
  faint = [],
}) {
  const doodles = faint
    .map((f) => {
      const pos = ["top", "left", "right", "bottom"]
        .filter((k) => f[k] != null)
        .map((k) => `${k}:${f[k]}px`)
        .join(";");
      return `<div class="faint" style="${pos};transform:rotate(${f.rotate || 0}deg)">${icon(
        f.icon,
        f.size || 150,
      )}</div>`;
    })
    .join("");

  return `<div class="slide">
  ${doodles ? `<div class="faintlayer">${doodles}</div>` : ""}
  <div class="rail">
    <div class="mark"><img src="${CROWN.gold}" alt=""><span class="word">CRWN</span></div>
    <div class="meta"><span class="deck">${esc(deck)}</span><span class="bar"></span><span class="num">${esc(
      String(num).padStart(2, "0"),
    )}</span></div>
  </div>
  ${
    head || sub
      ? `<div class="head ${align}" style="--hs:${headSize}px">
    ${head ? `<h1>${rich(head)}</h1>` : ""}
    ${
      brushUnder
        ? `<div style="transform:translateX(${brushOffset}px)">${brush({ width: brushUnder })}</div>`
        : ""
    }
    ${sub ? `<div class="sub${subHand ? " hand" : ""}">${rich(sub)}</div>` : ""}
  </div>`
      : ""
  }
  <div class="body">${body}</div>
  <div class="foot">${footer(foot)}</div>
</div>`;
}

function footer(f) {
  if (!f) return "";
  const parts = [];
  if (f.bold) parts.push(`<div class="foot-bold">${rich(f.bold)}</div>`);
  if (f.hand) {
    const t = f.handUnderline
      ? rich(f.hand).replace(
          esc(f.handUnderline),
          `<span class="hand-u">${esc(f.handUnderline)}</span>`,
        )
      : rich(f.hand);
    parts.push(`<div class="hand">${t}</div>`);
  }
  if (f.small) parts.push(`<div class="foot-small">${rich(f.small)}</div>`);
  if (f.disclaim) parts.push(`<div class="disclaim">${esc(f.disclaim)}</div>`);
  return `<div class="stack">${parts.join("")}</div>`;
}

/* ------------------------------------------------- body primitives */

/** Slide 1: evenly spaced possibilities split by thin gold dividers. */
export function optionRow(items) {
  return `<div class="optrow">${items
    .map((t) => `<div class="opt">${esc(t)}</div>`)
    .join('<div class="optdiv"></div>')}</div>`;
}

/** Two equal panels with an optional symbol between them (slides 2, 5, 15). */
export function panelCompare({ left, right, middle = "" }) {
  const col = (p) => `<div class="cmp">
    ${p.badge ? `<div class="cmp-badge">${esc(p.badge)}</div>` : ""}
    <div class="cmp-title">${esc(p.title)}</div>
    <div class="cmp-body">${p.body}</div>
    ${p.note ? `<div class="note cmp-note">${rich(p.note)}</div>` : ""}
  </div>`;
  return `<div class="cmprow">${col(left)}${
    middle ? `<div class="cmpmid">${middle}</div>` : ""
  }${col(right)}</div>`;
}

/** A row of uniform icon tiles with uppercase labels (slide 3). */
export function iconTiles(items, { size = 46 } = {}) {
  return `<div class="tiles">${items
    .map(
      (it) => `<div class="tile">
      <div class="tile-ic">${icon(it.icon, size)}</div>
      <div class="tile-lb">${esc(it.label)}</div>
    </div>`,
    )
    .join("")}</div>`;
}

/** Small stacked value cards used inside a comparison column (slides 5, 15). */
export function miniCards(items, { gold = false } = {}) {
  return `<div class="minis">${items
    .map(
      (it) =>
        `<div class="mini ${gold ? "gold" : ""}">${
          it.icon ? icon(it.icon, 26) : ""
        }<span>${esc(it.label)}</span></div>`,
    )
    .join("")}</div>`;
}

/**
 * Slide 4: a field of audience silhouettes with a few groups called out in gold.
 * The groups are drawn as outlined clusters sitting ON the field, because the point of the
 * slide is that they are not visible from the follower count alone.
 */
export function audienceField({ rows = 9, cols = 46, groups = [], dot = 17, gap = 6 }) {
  // The width is computed from the column count, not left to flex wrapping. Otherwise "cols" is
  // a lie: the row breaks wherever the container happens to end and the block loses its shape.
  const width = cols * (dot + gap) - gap;
  let dots = "";
  for (let i = 0; i < rows * cols; i++) dots += person(dot, "#CFC9BE");
  const marks = groups
    .map(
      (g) => `<div class="cluster" style="left:${g.left}%;top:${g.top}%;width:${g.w}%;height:${g.h}%">
      <div class="cluster-box"></div>
      <div class="cluster-lb">${rich(g.label)}</div>
    </div>`,
    )
    .join("");
  return `<div class="fieldwrap" style="width:${width}px"><div class="field" style="gap:${gap}px">${dots}</div>${marks}</div>`;
}

/** Slide 6: stages left to right under a gently rising gold line. */
export function spectrum(stages) {
  const n = stages.length;
  const pts = stages
    .map((_, i) => {
      const x = (i / (n - 1)) * 100;
      const y = 74 - (i / (n - 1)) * 56;
      return `${x},${y}`;
    })
    .join(" ");
  return `<div class="spec">
    <svg class="spec-line" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${
      C.goldInk
    }" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>
    <div class="spec-row">${stages
      .map((s, i) => {
        const scale = 0.68 + (i / (n - 1)) * 0.5;
        const op = 0.42 + (i / (n - 1)) * 0.58;
        return `<div class="spec-col">
        <div class="spec-fig" style="transform:scale(${scale.toFixed(2)});opacity:${op.toFixed(2)}">${person(56, C.ink)}</div>
        <div class="spec-lb">${esc(s)}</div>
      </div>`;
      })
      .join("")}</div>
  </div>`;
}

/** Slide 7: a start item, then arrow-linked additions. Deliberately never totalled. */
export function additivePath({ start, adds }) {
  return `<div class="addpath">
    <div class="add-start"><div class="add-slot">${icon(start.icon, 92)}</div><div class="add-lb">${esc(start.label)}</div></div>
    ${adds
      .map(
        (a) => `<div class="add-arrow">${arrow({ len: 104, color: C.goldInk })}</div>
      <div class="add-item"><div class="add-slot">${icon(a.icon, 58)}</div><div class="add-lb">${esc(a.label)}</div></div>`,
      )
      .join("")}
  </div>`;
}

/** Slide 8: an arithmetic line above a twelve-month marker strip. */
export function mathRows(rows) {
  return `<div class="mathwrap">${rows
    .map(
      (r) => `<div class="mathrow">
      <div class="math-eq">${rich(r.eq)}</div>
      <div class="months">${Array.from({ length: 12 }, (_, i) => `<span class="mo">${i + 1}</span>`).join(
        "",
      )}</div>
    </div>`,
    )
    .join("")}</div>`;
}

/** Slide 9: the tier ladder, with the audience thinning as the rungs rise. */
export function ladder(rungs) {
  return `<div class="ladder">${rungs
    .map((r, i) => {
      const count = r.people;
      const dots = Array.from({ length: count }, () => person(20, i === 0 ? "#C6C0B4" : C.goldInk)).join(
        "",
      );
      return `<div class="rung" style="--i:${i}">
      <div class="rung-name">${esc(r.name)}</div>
      <div class="rung-price">${esc(r.price)}</div>
      <div class="rung-people">${dots}</div>
    </div>`;
    })
    .join("")}</div>`;
}

/** Slide 10: stages that visibly shrink, the last one split by depth. */
export function funnel(stages, { split = [] } = {}) {
  return `<div class="funnel">${stages
    .map((s, i) => {
      const w = 100 - i * 17;
      const isLast = i === stages.length - 1;
      const inner =
        isLast && split.length
          ? `<div class="fn-split">${split
              .map((p) => `<div class="fn-seg"><span>${esc(p)}</span></div>`)
              .join("")}</div>`
          : "";
      return `<div class="fn-stage" style="--w:${w}%">
        <div class="fn-bar ${isLast ? "last" : ""}"><span class="fn-lb">${esc(s.label)}</span>${inner}</div>
        ${s.note ? `<div class="hand fn-note">${esc(s.note)}</div>` : ""}
      </div>`;
    })
    .join("")}</div>`;
}

/** Slide 11: a silhouette filling with gold as the relationship becomes identifiable. */
export function progression(steps) {
  return `<div class="prog">${steps
    .map((s, i) => {
      const fill = i === 0 ? "#C4BEB2" : i === steps.length - 1 ? C.goldInk : C.gold;
      return `<div class="prog-step">
      <div class="prog-fig" style="opacity:${(0.55 + i * 0.15).toFixed(2)}">${person(76, fill)}</div>
      <div class="prog-name">${esc(s.name)}</div>
      <div class="prog-gain">${esc(s.gain)}</div>
    </div>${i < steps.length - 1 ? `<div class="prog-arrow">${arrow({ len: 74, color: C.goldInk, weight: 3.4 })}</div>` : ""}`;
    })
    .join("")}</div>`;
}

/** Slide 12: candidate answers, each struck out by hand. */
export function struckNumbers(nums) {
  return `<div class="strucks">${nums
    .map((n) => `<div class="struck-n"><span class="struck">${esc(n)}</span></div>`)
    .join("")}</div>`;
}

/** Slide 14: nested groups beside the questions they raise. */
export function nestedMap({ groups, questions }) {
  return `<div class="mapwrap">
    <div class="nest">${groups
      .map(
        (g, i) =>
          `<div class="nest-row" style="--w:${100 - i * 15}%;--o:${(0.28 + i * 0.18).toFixed(2)}"><span>${esc(
            g,
          )}</span></div>`,
      )
      .join("")}</div>
    <div class="mapline"></div>
    <div class="qstack">${questions.map((q) => `<div class="q">${esc(q)}</div>`).join("")}</div>
  </div>`;
}

/** Slide 16: the numbered step list. */
export function stepList(steps) {
  return `<div class="steps">${steps
    .map(
      (s, i) => `<div class="step"><span class="step-n">${i + 1}</span><span>${esc(s)}</span></div>`,
    )
    .join("")}</div>`;
}

/** Slide 16: the editing placeholder. Deliberately empty: never fabricate CRWN UI. */
export function recordingSlot(label) {
  return `<div class="slot"><span>${esc(label)}</span></div>`;
}

export function ctaButton(label) {
  return `<div class="cta">${esc(label)}</div>`;
}

/**
 * Brand poster art inside a dark bleed panel.
 * People are only ever drawn in the CRWN flat-vector poster style (near-black silhouette,
 * sunburst rays, the five-colour warm palette). That art is built for a near-black page, so on a
 * cream slide it must sit in a dark panel and bleed to that panel's edges: no mat, no white frame.
 */
export function figurePanel({ src, height = 420, radius = 26 }) {
  return `<div class="figpanel" style="height:${height}px;border-radius:${radius}px">
    <img src="${src}" alt="">
  </div>`;
}

/* ------------------------------------------------------------------ css */

export const LAYOUT_CSS = `
.faintlayer{position:absolute;inset:0;pointer-events:none}
.faint{position:absolute;opacity:.055}
.faint svg{stroke:${C.ink};stroke-width:1.2}

.foot-bold{font-size:34px;font-weight:800;letter-spacing:-.02em}
.foot-small{font-size:25px;font-weight:500;color:${C.ink};text-align:center;max-width:1180px}
.sub.hand{font-family:'Caveat',cursive;font-weight:700;color:${C.goldInk};font-size:46px}

/* slide 13, the reveal */
.reveal{display:flex;flex-direction:column;align-items:center;gap:18px}
.reveal .lead{font-size:24px;font-weight:800;letter-spacing:.2em;color:${C.gray}}
.reveal .big{font-size:66px;font-weight:800;letter-spacing:-.035em;line-height:1;text-align:center;max-width:1500px}
.reveal .big.old{color:${C.gray}}
.reveal .down{margin:2px 0}

/* slide 1 */
.optrow{display:flex;align-items:center;justify-content:center;gap:0}
.opt{font-size:96px;font-weight:800;letter-spacing:-.03em;padding:0 58px}
.optdiv{width:2px;height:84px;background:${C.gold};opacity:.55}

/* slides 2,5,15 */
.cmprow{display:flex;align-items:stretch;justify-content:center;gap:34px}
.cmp{flex:1 1 0;background:#fff;border:2px solid ${C.rule};border-radius:26px;padding:32px 34px;display:flex;flex-direction:column;align-items:center;gap:18px;max-width:720px}
.cmp-badge{font-size:19px;font-weight:800;letter-spacing:.13em;color:${C.goldInk};background:${C.goldSoft};border-radius:999px;padding:8px 22px}
.cmp-title{font-size:31px;font-weight:800;letter-spacing:.11em;text-transform:uppercase}
.cmp-body{flex:1 1 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;width:100%}
.cmp-note{font-size:29px;color:${C.ink};text-align:center}
.cmpmid{display:flex;align-items:center;font-size:88px;font-weight:800;color:${C.goldInk};padding:0 4px}
.pair{display:flex;align-items:center;justify-content:center;gap:22px}
.buys{display:grid;grid-template-columns:1fr 1fr;gap:14px 26px;margin-top:4px}
.buy{display:flex;align-items:center;gap:11px;font-size:25px;font-weight:600}
.buy svg{stroke:${C.goldInk}}
.minis{display:flex;flex-direction:column;gap:12px;width:100%}
.mini{display:flex;align-items:center;gap:14px;font-size:25px;font-weight:600;border:2px solid ${C.rule};border-radius:14px;padding:13px 20px;background:${C.bg}}
.mini.gold{border-color:${C.gold};background:${C.goldSoft}}
.mini svg{stroke:${C.goldInk};flex:0 0 auto}

/* slide 3 */
.tiles{display:flex;justify-content:center;gap:20px}
.tile{flex:1 1 0;max-width:216px;background:#fff;border:2px solid ${C.rule};border-radius:22px;padding:30px 12px 24px;display:flex;flex-direction:column;align-items:center;gap:16px}
.tile-lb{font-size:17px;font-weight:800;letter-spacing:.09em;text-align:center;line-height:1.25}

/* slide 4 */
.fieldwrap{position:relative;padding:6px 0;margin:0 auto}
.field{display:flex;flex-wrap:wrap;justify-content:flex-start;opacity:.95}
.cluster{position:absolute}
.cluster-box{position:absolute;inset:0;border:3px dashed ${C.goldInk};border-radius:16px;background:rgba(212,175,55,.15)}
.cluster-lb{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(100% + 9px);white-space:nowrap;font-family:'Patrick Hand',cursive;font-size:25px;color:${C.goldInk}}

/* slide 6 */
.spec{position:relative;padding-top:30px}
.spec-line{position:absolute;left:6%;right:6%;top:0;width:88%;height:132px}
.spec-row{display:flex;justify-content:space-between;align-items:flex-end;gap:8px;position:relative;padding-top:112px}
.spec-col{flex:1 1 0;display:flex;flex-direction:column;align-items:center;gap:14px}
.spec-fig{height:82px;display:flex;align-items:flex-end}
.spec-lb{font-size:23px;font-weight:700;text-align:center;line-height:1.2}

/* slide 7 */
.addpath{display:flex;align-items:center;justify-content:center;gap:6px}
.add-start{display:flex;flex-direction:column;align-items:center;gap:14px}
.add-start .icon,.add-item .icon{display:block}
.add-slot{height:96px;display:flex;align-items:center;justify-content:center}
.add-start svg{stroke:${C.ink};stroke-width:1.5}
.add-item{display:flex;flex-direction:column;align-items:center;gap:14px}
.add-item svg{stroke:${C.goldInk}}
.add-lb{font-size:26px;font-weight:700;text-align:center;max-width:210px;line-height:1.2}
.add-arrow{opacity:.9;margin-bottom:52px}

/* slide 8 */
.mathwrap{display:flex;flex-direction:column;gap:44px;align-items:center}
.mathrow{display:flex;flex-direction:column;align-items:center;gap:16px}
.math-eq{font-size:70px;font-weight:800;letter-spacing:-.02em}
.months{display:flex;gap:9px}
.mo{width:52px;height:38px;border:2px solid ${C.rule};border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:${C.gray};background:#fff}

/* slide 9 */
.ladder{display:flex;flex-direction:column-reverse;gap:14px;align-items:stretch;padding:0 40px}
.rung{display:flex;align-items:center;gap:30px;border:2px solid ${C.rule};border-radius:16px;background:#fff;padding:22px 30px}
.rung-name{font-size:34px;font-weight:800;letter-spacing:.08em;width:190px}
.rung-price{font-size:30px;font-weight:600;color:${C.gray};width:150px}
.rung-people{display:flex;gap:4px;flex-wrap:wrap;flex:1 1 auto}

/* slide 10 */
.funnel{display:flex;flex-direction:column;align-items:center;gap:13px}
.fn-stage{width:var(--w);display:flex;align-items:center;gap:20px;justify-content:center;position:relative}
.fn-bar{flex:1 1 auto;background:${C.goldSoft};border:2px solid ${C.gold};border-radius:14px;padding:16px 22px;display:flex;align-items:center;justify-content:center;gap:20px}
.fn-bar.last{background:transparent;border-style:dashed}
.fn-lb{font-size:27px;font-weight:800;letter-spacing:.08em}
.fn-split{display:flex;gap:12px}
.fn-seg{background:${C.gold};border-radius:10px;padding:8px 16px;font-size:19px;font-weight:700;color:#fff}
.fn-note{position:absolute;left:calc(100% + 18px);font-size:34px;white-space:nowrap}

/* slide 11 */
.prog{display:flex;align-items:flex-start;justify-content:center;gap:6px}
.prog-step{display:flex;flex-direction:column;align-items:center;gap:12px;width:230px}
.prog-name{font-size:23px;font-weight:800;letter-spacing:.08em;text-align:center;line-height:1.2;height:60px;display:flex;align-items:flex-start;justify-content:center}
.prog-gain{font-size:25px;font-weight:600;color:${C.goldInk};font-family:'Patrick Hand',cursive}
.prog-arrow{padding-top:46px}

/* slide 12 */
.strucks{display:flex;justify-content:center;gap:96px}
.struck-n{font-size:110px;font-weight:800;letter-spacing:-.03em;color:${C.gray}}

/* slide 14 */
.mapwrap{display:flex;align-items:center;justify-content:center;gap:0}
.nest{display:flex;flex-direction:column;align-items:center;gap:11px;width:620px}
.nest-row{width:var(--w);background:rgba(212,175,55,var(--o));border:2px solid ${C.gold};border-radius:12px;padding:14px 0;display:flex;align-items:center;justify-content:center}
.nest-row span{font-size:24px;font-weight:800;letter-spacing:.1em}
.mapline{width:110px;height:2px;background:${C.gold};opacity:.6}
.qstack{display:flex;flex-direction:column;gap:13px;width:480px}
.q{font-size:29px;font-weight:600;border-left:4px solid ${C.gold};padding-left:20px}

/* slide 15 */
.ba{display:flex;align-items:center;justify-content:center;gap:56px}
.ba-left{text-align:center;width:520px}
.ba-big{font-size:82px;font-weight:800;letter-spacing:-.03em;color:${C.grayMute}}
.ba-cap{font-size:27px;color:${C.grayMute};margin-top:12px}
.ba-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;width:760px}

/* slide 16 */
.ctarow{display:flex;align-items:center;gap:54px}
.ctaleft{flex:0 0 620px;display:flex;flex-direction:column;gap:26px}
.steps{display:flex;flex-direction:column;gap:16px}
.step{display:flex;align-items:center;gap:18px;font-size:29px;font-weight:600}
.step-n{width:44px;height:44px;border-radius:50%;background:${C.goldInk};color:#fff;font-weight:800;font-size:22px;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.slot{flex:1 1 auto;height:390px;background:${C.dark};border-radius:24px;display:flex;align-items:center;justify-content:center;text-align:center;padding:30px}
.slot span{color:#8B8B8B;font-size:22px;font-weight:800;letter-spacing:.16em;line-height:1.5}
.cta{background:${C.goldInk};color:#fff;font-size:32px;font-weight:800;letter-spacing:.05em;padding:20px 58px;border-radius:999px;display:inline-block}

/* brand poster art */
.figpanel{overflow:hidden;background:${C.dark};width:100%}
.figpanel img{width:100%;height:100%;object-fit:cover;display:block}
`;

export { icon, person, arrow, brush };
