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
  <div class="body"><div class="bodyfit">${body}</div></div>
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
export function optionRow(items, { size = 0 } = {}) {
  return `<div class="optrow"${size ? ` style="--os:${size}px"` : ""}>${items
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
export function iconTiles(items, { size = 46, rail = false } = {}) {
  return `<div class="tiles${rail ? " rail" : ""}">${items
    .map(
      (it) => `<div class="tile">
      <div class="tile-ic">${icon(it.icon, size)}</div>
      <div class="tile-lb">${esc(it.label)}</div>
      ${it.example ? `<div class="tile-ex">${esc(it.example)}</div>` : ""}
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
export function ladder(rungs, { labelWidth = 150 } = {}) {
  return `<div class="ladder">${rungs
    .map((r, i) => {
      const count = r.people;
      const dots = Array.from({ length: count }, () => person(20, i === 0 ? "#C6C0B4" : C.goldInk)).join(
        "",
      );
      return `<div class="rung" style="--i:${i}">
      <div class="rung-name">${esc(r.name)}</div>
      <div class="rung-price" style="width:${labelWidth}px">${esc(r.price)}</div>
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

/** A row or grid of labelled chips. The workhorse for "here are the things" slides. */
export function chipRow(items, { gold = false, cols = 0 } = {}) {
  const style = cols ? `style="display:grid;grid-template-columns:repeat(${cols},1fr)"` : "";
  return `<div class="chips ${gold ? "gold" : ""}" ${style}>${items
    .map((it) => {
      const o = typeof it === "string" ? { label: it } : it;
      return `<div class="chip">${o.icon ? icon(o.icon, 28) : ""}<span>${esc(o.label)}</span></div>`;
    })
    .join("")}</div>`;
}

/** A quoted opinion. Only ever used to contrast an opinion against behaviour. */
export function speechBubble(text) {
  return `<div class="bubble">${esc(text)}</div>`;
}

/**
 * Slide 2: a list of guessed perks, with arrows running to the two ways guessing fails.
 * Both outcomes hang off the SAME list on purpose: that is the whole argument.
 */
export function trapDiagram({ items, outcomes }) {
  return `<div class="trap">
    <div class="trap-card">
      <div class="trap-card-lb">${esc("Ideas from nowhere")}</div>
      ${items.map((i) => `<div class="trap-item">${esc(i)}</div>`).join("")}
    </div>
    <div class="trap-arrows">
      <div style="transform:rotate(-32deg)">${arrow({ dir: "down", len: 92, color: C.goldInk, weight: 4 })}</div>
      <div style="transform:rotate(32deg)">${arrow({ dir: "down", len: 92, color: C.goldInk, weight: 4 })}</div>
    </div>
    <div class="trap-out">${outcomes
      .map(
        (o) => `<div class="trap-panel">
        <div class="trap-out-t">${esc(o.title)}</div>
        <div class="trap-out-s">${esc(o.sub)}</div>
      </div>`,
      )
      .join("")}</div>
  </div>`;
}

/** Slide 5: willingness levels along a rising line, with what deepens underneath. */
export function demandSpectrum({ levels, attributes }) {
  return `<div class="dspec">
    <svg class="dspec-line" viewBox="0 0 100 30" preserveAspectRatio="none">
      <polyline points="2,26 50,15 98,4" fill="none" stroke="${C.goldInk}" stroke-width="3"
        stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    </svg>
    <div class="dspec-levels">${levels
      .map((l) => `<div class="dspec-lv">${esc(l)}</div>`)
      .join("")}</div>
    ${chipRow(attributes, { cols: attributes.length })}
  </div>`;
}

/** Slide 9: one source opening into the assets already inside it. */
export function sourceToAssets({ source, assets }) {
  return `<div class="s2a">
    <div class="s2a-src">${icon(source.icon, 108)}<div class="s2a-src-lb">${esc(source.label)}</div></div>
    <div class="s2a-arrow">${arrow({ len: 96, color: C.goldInk })}</div>
    <div class="s2a-grid">${assets
      .map(
        (a) => `<div class="chip">${icon(a.icon, 28)}<span>${esc(a.label)}</span></div>`,
      )
      .join("")}</div>
  </div>`;
}

/**
 * Overlapping circles. Two circles read as a condition ("both must be true"); three read as
 * corroboration ("all three point the same way"). Same primitive, because the idea is the same.
 */
export function venn({ circles, center, size = 340, subsBelow = false }) {
  const three = circles.length === 3;
  const cls = three ? "venn3" : "venn2";
  return `<div class="venn ${cls}" style="--d:${size}px">
    ${circles
      .map(
        (c, i) => `<div class="venn-c v${i}">
        <div class="venn-t">${esc(c.title)}</div>
        ${c.sub && !subsBelow ? `<div class="venn-s">${esc(c.sub)}</div>` : ""}
      </div>`,
      )
      .join("")}
    <div class="venn-mid">${esc(center)}</div>
  </div>
  ${
    subsBelow
      ? `<div class="venn-caps">${circles
          .map((c) => `<div class="venn-cap"><b>${esc(c.title)}</b>${esc(c.sub || "")}</div>`)
          .join("")}</div>`
      : ""
  }`;
}

/** Slide 13: separate signals arriving at one conclusion. */
export function converge({ center, sources }) {
  return `<div class="conv">
    <div class="conv-row">${sources
      .map(
        (s) => `<div class="conv-card">
        <div class="conv-k">${esc(s.kind)}</div>
        <div class="conv-v">${esc(s.text)}</div>
      </div>`,
      )
      .join("")}</div>
    <div class="conv-arrows">${sources
      .map((_, i) => {
        const rot = (i - (sources.length - 1) / 2) * 26;
        return `<div style="transform:rotate(${rot}deg)">${arrow({
          dir: "down",
          len: 84,
          color: C.goldInk,
          weight: 4,
        })}</div>`;
      })
      .join("")}</div>
    <div class="conv-mid">${esc(center)}</div>
  </div>`;
}

/** Slide 14: questions crossed out by hand, stacked. */
export function struckStack(lines, { size = 62, cols = 1 } = {}) {
  return `<div class="sstack" style="--ss:${size}px;${cols > 1 ? `display:grid;grid-template-columns:repeat(${cols},1fr);column-gap:70px;justify-items:center;width:100%` : ""}">${lines
    .map((l) => `<div class="sline"><span class="struck">${esc(l)}</span></div>`)
    .join("")}</div>`;
}

/** Slide 16: the numbered tests a benefit has to pass. */
export function filterCards(items) {
  return `<div class="filters">${items
    .map(
      (t, i) => `<div class="filter">
      <span class="filter-n">${i + 1}</span>
      <div class="filter-t">${esc(t)}</div>
    </div>`,
    )
    .join("")}</div>`;
}

/** A compact horizontal restatement of the ladder, for a slide the ladder is not the subject of. */
export function miniLadder(rungs) {
  return `<div class="mladder">${rungs
    .map(
      (r) => `<div class="mrung"><span class="mrung-n">${esc(r.name)}</span>${
        r.sub ? `<span class="mrung-s">${esc(r.sub)}</span>` : ""
      }</div>`,
    )
    .join("")}</div>`;
}

/** A big muted crowd against a small bright one. The whole point is the size difference. */
export function crowdCompare({ left, right, middle = "" }) {
  const side = (s, gold) => `<div class="cw-side">
    <div class="cw-dots ${gold ? "gold" : ""}">${Array.from({ length: s.count }, () =>
      person(gold ? 26 : 15, gold ? C.goldInk : "#CFC9BE"),
    ).join("")}</div>
    <div class="cw-lb ${gold ? "gold" : ""}">${esc(s.label)}</div>
    ${
      s.items
        ? `<div class="cw-items">${s.items
            .map((i) => `<div class="cw-item">${esc(i)}</div>`)
            .join("")}</div>`
        : ""
    }
  </div>`;
  return `<div class="crowd">${side(left, false)}${
    middle ? `<div class="cw-mid hand">${rich(middle)}</div>` : ""
  }${side(right, true)}</div>`;
}

/**
 * A left-to-right process. Used by four slides, so it takes text-only nodes, optional icons, an
 * optional terminal mark, and wraps rather than crushing a nine-step chain into one row.
 */
export function flowChain(steps, { end = "", endMuted = "", compact = false } = {}) {
  const nodes = steps
    .map((s, i) => {
      const o = typeof s === "string" ? { label: s } : s;
      const arrow_ =
        i > 0 ? `<div class="fc-arrow">${arrow({ len: compact ? 58 : 82, color: C.goldInk })}</div>` : "";
      return `${arrow_}<div class="fc-node">${
        o.icon ? `<div class="fc-ic">${icon(o.icon, compact ? 32 : 44)}</div>` : ""
      }<div class="fc-lb">${esc(o.label)}</div></div>`;
    })
    .join("");
  return `<div class="flowchain ${compact ? "compact" : ""}">${nodes}${
    end ? `<div class="fc-end">${esc(end)}${brush({ width: 120, weight: 9 })}</div>` : ""
  }${endMuted ? `<div class="fc-muted">${esc(endMuted)}</div>` : ""}</div>`;
}

/** One dominant claim, with the things it proves arranged beneath it. */
export function centerpiece({ big, sub = "", around = [], plain = false, size = 0 }) {
  return `<div class="cpiece">
    <div class="cp-big${plain ? " plain" : ""}"${size ? ` style="font-size:${size}px"` : ""}>${rich(big)}</div>
    ${sub ? `<div class="cp-sub">${esc(sub)}</div>` : ""}
    <div class="cp-around">${around
      .map((a) => `<div class="cp-card">${esc(a)}</div>`)
      .join("")}</div>
  </div>`;
}

/** Slide 12: a closed improvement loop. Nodes sit on a circle so the return is visible. */
export function loopCycle(steps, { center = "", size = 430 } = {}) {
  const n = steps.length;
  const r = size / 2;
  const nodes = steps
    .map((s, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const x = 50 + Math.cos(a) * 50;
      const y = 50 + Math.sin(a) * 50;
      return `<div class="lc-node" style="left:${x}%;top:${y}%">${esc(s)}</div>`;
    })
    .join("");
  // The ring is drawn as a dashed circle with one gold arrowhead, rather than an arrow per gap:
  // at six nodes the per-gap arrows collided with the labels they were meant to connect.
  return `<div class="loop" style="width:${size}px;height:${size}px">
    <svg class="lc-ring" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="49" fill="none" stroke="${C.gold}" stroke-width="0.7"
        stroke-dasharray="2.4 2.4"/>
      <polygon points="46.6,-1.2 53.4,1.6 46.6,4.4" fill="${C.goldInk}"/>
    </svg>
    ${nodes}
    ${center ? `<div class="lc-mid hand">${esc(center)}</div>` : ""}
  </div>`;
}

/** Slide 13: rings widening outward, gold strongest at the centre. */
export function concentricRings(rings) {
  const n = rings.length;
  return `<div class="rings">${rings
    .map((label, i) => {
      // i === 0 is the innermost ring: smallest, strongest, and drawn on top.
      const d = 100 - (n - 1 - i) * (66 / (n - 1));
      const op = 0.62 - i * (0.44 / (n - 1));
      return `<div class="ring" style="width:${d}%;height:${d}%;background:rgba(212,175,55,${op.toFixed(
        2,
      )});z-index:${n - i}"><span>${esc(label)}</span></div>`;
    })
    .join("")}</div>`;
}

/**
 * Slide 15: a conceptual dashboard. Each card names a metric and shows a RULE where a number
 * would go, never a number: the sheet forbids fabricated values, and an invented figure in a
 * teaching deck is a claim CRWN would have to stand behind.
 */
export function metricGrid(items) {
  return `<div class="mgrid">${items
    .map(
      (m) => `<div class="mcard">
      <div class="mc-lb">${esc(m)}</div>
      <div class="mc-val"></div>
    </div>`,
    )
    .join("")}</div>`;
}

/** Slide 17: the reveal. Emphasis fades down the list, so rank reads without a legend. */
export function priorityStack(items) {
  const n = items.length;
  return `<div class="pstack">${items
    .map((t, i) => {
      const strong = i < 2;
      const op = 1 - i * 0.14;
      return `<div class="prow ${strong ? "hot" : ""}" style="opacity:${op.toFixed(2)}">
      <span class="prow-n">${i + 1}</span><span class="prow-t">${esc(t)}</span>
    </div>`;
    })
    .join("")}</div>`;
}

/** Gold-ticked conditions. Deliberately large: these are terms, and terms have to be readable. */
export function checklist(items, { cols = 1 } = {}) {
  return `<div class="cklist" style="grid-template-columns:repeat(${cols},1fr)">${items
    .map(
      (t) => `<div class="ckrow">
      <span class="cktick">${icon("check", 26)}</span><span class="cktext">${esc(t)}</span>
    </div>`,
    )
    .join("")}</div>`;
}

/** Slide 3: one result, many possible causes, drawn as real branch lines. */
export function branchOut({ center, items }) {
  const n = items.length;
  const pts = items
    .map((_, i) => {
      const x = ((i + 0.5) / n) * 100;
      return `<line x1="50" y1="0" x2="${x.toFixed(1)}" y2="26" stroke="${C.goldInk}"
        stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    })
    .join("");
  return `<div class="branch">
    <div class="br-mid">${esc(center)}</div>
    <svg class="br-fan" viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden="true">${pts}</svg>
    <div class="br-row">${items.map((t) => `<div class="br-card">${esc(t)}</div>`).join("")}</div>
  </div>`;
}

/** Slide 4: an observation, and the conclusion it does NOT support, with the leap struck out. */
export function blockedLeap({ from, to }) {
  return `<div class="leap">
    <div class="leap-box">${esc(from)}</div>
    <div class="leap-x">${icon("x", 92, "icon leapmark")}</div>
    <div class="leap-box weak">${esc(to)}</div>
  </div>`;
}

/**
 * Slide 11: the guarantee, stated once.
 * The qualifier is not decoration. This is a commercial term, so the promise and the limit are
 * rendered by the SAME primitive and cannot drift apart in a later edit.
 */
export function guaranteePanel({ lead, condition, promise }) {
  return `<div class="guar">
    <div class="guar-lead">${esc(lead)}</div>
    <div class="guar-band">${esc(condition)}</div>
    <div class="guar-promise">${esc(promise)}</div>
  </div>`;
}

/**
 * Three priced plans side by side: name, price, fee, who it is for.
 * Not `pathCards`: a plan is not a route the viewer takes right now, so it carries no action
 * label, and the PRICE is the subject rather than a subtitle. Every figure passed in here is a
 * real CRWN price read from `TIER_PRICING` / `TIER_LIMITS`, never an illustration, which is why
 * the calculator deck's guard treats a slide using this as pricing rather than example money.
 */
export function planCards(plans) {
  return `<div class="plans">${plans
    .map(
      (p) => `<div class="plan ${p.accent ? "accent" : ""}">
      <div class="plan-n">${esc(p.name)}</div>
      <div class="plan-p">${esc(p.price)}</div>
      ${p.per ? `<div class="plan-per">${esc(p.per)}</div>` : ""}
      <div class="plan-fee">${esc(p.fee)}</div>
      ${p.forWhom ? `<div class="plan-for">${esc(p.forWhom)}</div>` : ""}
    </div>`,
    )
    .join("")}</div>`;
}

/** Slide 17: two equal routes, each with its own action. */
export function pathCards(paths) {
  return `<div class="paths">${paths
    .map(
      (p) => `<div class="path ${p.accent ? "accent" : ""}">
      <div class="path-t">${esc(p.title)}</div>
      <div class="path-s">${esc(p.sub)}</div>
      <div class="path-cta">${esc(p.cta)}</div>
    </div>`,
    )
    .join("")}</div>`;
}

/**
 * The calculator's own number, which this deck never invents.
 * The result is per-viewer, so the slide ships a labelled slot the editor fills, exactly like
 * `recordingSlot`. A plausible-looking figure baked in here would read as a claim.
 */
export function resultSlot({ label = "YOUR ESTIMATED MONTHLY OPPORTUNITY", token = "$[CALCULATOR RESULT]" } = {}) {
  return `<div class="rslot">
    <div class="rslot-lb">${esc(label)}</div>
    <div class="rslot-token">${esc(token)}</div>
  </div>`;
}

/** Slides 7 and 13: a relationship that keeps going, against moments that stop. */
export function continuousLine({ markers = 5, label = "" } = {}) {
  const dots = Array.from({ length: markers }, () => `<span class="cl-dot"></span>`).join("");
  return `<div class="contline">
    <div class="cl-rail">${dots}</div>
    ${label ? `<div class="cl-lb">${esc(label)}</div>` : ""}
  </div>`;
}

/** Slides 7 and 12: purchases as separate moments with gaps, each ending. */
export function momentsTimeline(moments) {
  return `<div class="moments">${moments
    .map(
      (m) => `<div class="moment">
      <div class="mo-card">${esc(m)}</div>
      <div class="mo-end">ENDS</div>
    </div>`,
    )
    .join('<div class="mo-gap"></div>')}</div>`;
}

/** Slide 9: the tiers as a narrowing pyramid, widest at the free front door. */
export function pyramid(levels) {
  const n = levels.length;
  return `<div class="pyr">${levels
    .map((l, i) => {
      const w = 100 - i * (58 / (n - 1));
      const op = 0.2 + (i / (n - 1)) * 0.55;
      return `<div class="pyr-row" style="width:${w}%;background:rgba(212,175,55,${op.toFixed(2)})">
        <span class="pyr-n">${esc(l.name)}</span>
        <span class="pyr-p">${Array.from({ length: l.people }, () => person(19, C.ink)).join("")}</span>
      </div>`;
    })
    .join("")}</div>`;
}

/** Slide 18: a starting structure that is visibly editable, never a mock of CRWN. */
export function editableTiers(names) {
  return `<div class="etiers">${names
    .map(
      (n) => `<div class="etier">
      <div class="et-head"><span>${esc(n)}</span>${icon("pen", 22)}</div>
      <div class="et-lines"><i></i><i></i><i></i></div>
    </div>`,
    )
    .join("")}</div>`;
}

/** Slide 21: the artist as the integration layer nobody asked them to be. */
export function fragmentation({ center, nodes }) {
  const n = nodes.length;
  return `<div class="frag">
    <svg class="frag-links" viewBox="0 0 100 100" aria-hidden="true">${nodes
      .map((_, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const x = 50 + Math.cos(a) * 38;
        const y = 50 + Math.sin(a) * 38;
        return `<line x1="50" y1="50" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${C.grayMute}"
          stroke-width="0.5" stroke-dasharray="2 3" vector-effect="non-scaling-stroke"/>`;
      })
      .join("")}</svg>
    <div class="frag-mid">${icon("mic", 62)}<span>${esc(center)}</span></div>
    ${nodes
      .map((t, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const x = 50 + Math.cos(a) * 42;
        const y = 50 + Math.sin(a) * 42;
        return `<div class="frag-node" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%">${esc(t)}</div>`;
      })
      .join("")}
  </div>`;
}

/** Slides 23 and 40: the questions a stack either answers or does not. */
export function questionList(items, { size = 40, cols = 1 } = {}) {
  return `<div class="qlist" style="--qs:${size}px;grid-template-columns:repeat(${cols},1fr)">${items
    .map((q) => `<div class="qitem">${rich(q)}</div>`)
    .join("")}</div>`;
}

/**
 * Slides 24, 34 and 35: separate concerns joined by one operating line.
 * `layerLabel` turns it into the operating-layer picture (34) without a second primitive.
 */
export function pillars(items, { layerLabel = "", note = "" } = {}) {
  return `<div class="pillars">
    <div class="pl-row">${items
      .map((p) => {
        const o = typeof p === "string" ? { label: p } : p;
        return `<div class="pl-card">${o.icon ? icon(o.icon, 36) : ""}<span>${esc(o.label)}</span></div>`;
      })
      .join("")}</div>
    <div class="pl-line"></div>
    ${layerLabel ? `<div class="pl-layer">${esc(layerLabel)}</div>` : ""}
    ${note ? `<div class="pl-note">${esc(note)}</div>` : ""}
  </div>`;
}

/** Slide 26: what an active fan economy actually does, around the people doing it. */
export function orbit({ center, verbs }) {
  const n = verbs.length;
  return `<div class="orbit">
    <div class="orb-mid">${center}</div>
    ${verbs
      .map((v, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const x = 50 + Math.cos(a) * 46;
        const y = 50 + Math.sin(a) * 43;
        return `<div class="orb-v" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%">${esc(v)}</div>`;
      })
      .join("")}
  </div>`;
}

/* ------------------------------------------------------------------ css */

export const LAYOUT_CSS = `
.faintlayer{position:absolute;inset:0;pointer-events:none}
.faint{position:absolute;opacity:.055}
.faint svg{stroke:${C.ink};stroke-width:1.2}

.foot-bold{font-size:40px;font-weight:800;letter-spacing:-.02em;text-align:center;max-width:1500px;margin:0 auto;line-height:1.2}
.foot-small{font-size:28px;font-weight:500;color:${C.ink};text-align:center;max-width:1180px}
.sub.hand{font-family:'Caveat',cursive;font-weight:700;color:${C.goldInk};font-size:46px}

/* slide 13, the reveal */
.reveal{display:flex;flex-direction:column;align-items:center;gap:18px}
.reveal .lead{font-size:24px;font-weight:800;letter-spacing:.2em;color:${C.gray}}
.reveal .big{font-size:66px;font-weight:800;letter-spacing:-.035em;line-height:1;text-align:center;max-width:1500px}
.reveal .big.old{color:${C.gray}}
.reveal .down{margin:2px 0}

/* slide 1 */
.optrow{display:flex;align-items:center;justify-content:center;gap:0}
.opt{font-size:var(--os,96px);font-weight:800;letter-spacing:-.03em;padding:0 calc(var(--os,96px) * .5)}
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
.rung-price{font-size:30px;font-weight:600;color:${C.gray}}
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

/* chips */
.chips{display:flex;flex-wrap:wrap;justify-content:center;gap:16px}
.chip{display:flex;align-items:center;justify-content:center;gap:12px;font-size:25px;font-weight:600;
  border:2px solid ${C.rule};border-radius:14px;padding:16px 24px;background:#fff;text-align:center}
.chip svg{stroke:${C.goldInk};flex:0 0 auto}
.chips.gold .chip{border-color:${C.gold};background:${C.goldSoft}}

/* slide 2, the perks trap */
.trap{display:flex;flex-direction:column;align-items:center;gap:4px}
.trap-card{background:#fff;border:2px solid ${C.rule};border-radius:20px;padding:20px 44px;display:flex;
  flex-direction:column;align-items:center;gap:9px;min-width:600px}
.trap-card-lb{font-family:'Patrick Hand',cursive;font-size:23px;color:${C.grayMute};margin-bottom:2px}
.trap-item{font-size:26px;font-weight:600;color:${C.gray}}
.trap-arrows{display:flex;gap:300px}
.trap-out{display:flex;gap:56px;margin-top:-6px}
.trap-panel{border:2.5px solid ${C.goldInk};border-radius:18px;padding:18px 34px;text-align:center;width:470px}
.trap-out-t{font-size:29px;font-weight:800;letter-spacing:.07em}
.trap-out-s{font-size:23px;color:${C.gray};margin-top:7px}

/* slide 3, evidence tiles carry an example */
.tile-ex{font-size:16px;font-weight:600;color:${C.goldInk};font-family:'Patrick Hand',cursive;text-align:center}

/* slide 4, opinion */
.bubble{position:relative;background:#fff;border:2px solid ${C.rule};border-radius:22px;padding:22px 30px;
  font-size:31px;font-weight:600;font-style:italic;max-width:520px;text-align:center}
.bubble::after{content:'';position:absolute;left:50%;margin-left:-11px;bottom:-12px;width:22px;height:22px;
  background:#fff;border-right:2px solid ${C.rule};border-bottom:2px solid ${C.rule};transform:rotate(45deg)}
.trail{display:flex;flex-direction:column;gap:13px;width:100%}
.tag{font-size:19px;font-weight:800;letter-spacing:.2em;color:${C.gray};margin-top:10px}

/* slide 5, demand spectrum */
.dspec{position:relative;padding-top:14px;display:flex;flex-direction:column;gap:26px}
.dspec-line{position:absolute;left:4%;top:0;width:92%;height:96px}
.dspec-levels{display:flex;justify-content:space-between;padding:74px 3% 0;position:relative}
.dspec-lv{font-size:44px;font-weight:800;letter-spacing:-.02em;color:${C.goldInk}}

/* slide 9, vault to assets */
.s2a{display:flex;align-items:center;justify-content:center;gap:34px}
.s2a-src{display:flex;flex-direction:column;align-items:center;gap:12px}
.s2a-src svg{stroke:${C.ink};stroke-width:1.5}
.s2a-src-lb{font-size:26px;font-weight:800;letter-spacing:.08em}
.s2a-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;width:940px}

/* venn */
.venn{position:relative;margin:0 auto;height:calc(var(--d) * 1.05);display:flex;justify-content:center}
.venn.venn3{height:calc(var(--d) * 1.46)}
.venn-caps{display:flex;justify-content:center;gap:30px;margin-top:26px}
.venn-cap{width:400px;text-align:center;font-size:22px;color:${C.gray};line-height:1.3}
.venn-cap b{display:block;font-size:20px;letter-spacing:.16em;color:${C.goldInk};margin-bottom:6px}
.venn-c{position:absolute;width:var(--d);height:var(--d);border-radius:50%;border:3px solid ${C.gold};
  background:rgba(212,175,55,.16);display:flex;flex-direction:column;align-items:center;justify-content:center;
  text-align:center;padding:0 42px}
.venn-t{font-size:27px;font-weight:800;letter-spacing:.07em;line-height:1.2}
.venn-s{font-size:20px;color:${C.gray};margin-top:8px;line-height:1.25}
.venn-mid{position:absolute;font-size:26px;font-weight:800;letter-spacing:.07em;color:#fff;background:${C.goldInk};
  border-radius:999px;padding:12px 28px;z-index:3;white-space:nowrap}
.venn2 .venn-c{padding:0}
.venn2 .v0{left:calc(50% - var(--d) + 95px)}
.venn2 .v1{left:calc(50% - 95px)}
.venn2 .venn-t{position:absolute;top:50%;transform:translateY(-50%);width:calc(var(--d) - 190px);text-align:center}
.venn2 .v0 .venn-t{left:0}
.venn2 .v1 .venn-t{right:0}
.venn2 .venn-mid{top:calc(50% - 27px);font-size:23px;padding:12px 22px}
.venn2 .venn-t{font-size:25px}
.venn3 .v0{left:calc(50% - var(--d) * 0.78);top:0}
.venn3 .v1{left:calc(50% - var(--d) * 0.22);top:0}
.venn3 .v2{left:calc(50% - var(--d) * 0.5);top:calc(var(--d) * 0.42)}
.venn3 .venn-c{justify-content:flex-start;padding-top:40px}
.venn3 .v2{justify-content:flex-end;padding-bottom:30px}
.venn3 .venn-mid{top:calc(var(--d) * 0.58)}
.venn3 .venn-t{max-width:74%}

/* slide 13, converging signals */
.conv{display:flex;flex-direction:column;align-items:center;gap:2px}
.conv-row{display:flex;gap:34px}
.conv-card{border:2px solid ${C.rule};background:#fff;border-radius:18px;padding:20px 26px;width:420px;text-align:center}
.conv-k{font-size:20px;font-weight:800;letter-spacing:.18em;color:${C.goldInk}}
.conv-v{font-size:24px;font-weight:600;color:${C.gray};margin-top:9px;line-height:1.3}
.conv-arrows{display:flex;gap:270px}
.conv-mid{background:${C.goldInk};color:#fff;font-size:40px;font-weight:800;letter-spacing:.06em;
  border-radius:16px;padding:18px 54px;margin-top:-4px}

/* slide 14, struck questions */
.sstack{display:flex;flex-direction:column;align-items:center;gap:40px}
.sline{font-size:var(--ss);font-weight:800;letter-spacing:-.03em;color:${C.gray}}
.sstack .struck::after{left:0;right:0;top:46%}

/* slide 16 */
.filters{display:flex;justify-content:center;gap:22px}
.filter{flex:1 1 0;max-width:480px;border:2px solid ${C.gold};background:${C.goldSoft};border-radius:20px;
  padding:26px 26px;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center}
.filter-n{width:52px;height:52px;border-radius:50%;background:${C.goldInk};color:#fff;font-size:26px;
  font-weight:800;display:flex;align-items:center;justify-content:center}
.filter-t{font-size:27px;font-weight:800;letter-spacing:.02em;line-height:1.25}
.mladder{display:flex;justify-content:center;gap:14px;margin-top:26px}
.mrung{display:flex;flex-direction:column;align-items:center;gap:5px;border:2px solid ${C.rule};background:#fff;
  border-radius:14px;padding:14px 30px}
.mrung-n{font-size:23px;font-weight:800;letter-spacing:.1em}
.mrung-s{font-size:20px;color:${C.gray}}

/* crowd comparison */
.crowd{display:flex;align-items:center;justify-content:center;gap:44px}
.cw-side{flex:1 1 0;display:flex;flex-direction:column;align-items:center;gap:16px;max-width:660px}
.cw-dots{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 5px}
.cw-dots.gold{gap:8px 10px}
.cw-lb{font-size:27px;font-weight:800;letter-spacing:.12em;color:${C.grayMute}}
.cw-lb.gold{color:${C.goldInk}}
.cw-mid{font-size:36px;text-align:center;max-width:330px;flex:0 0 auto}
.cw-items{display:flex;flex-wrap:wrap;justify-content:center;gap:10px}
.cw-item{font-size:22px;font-weight:700;border:2px solid ${C.gold};background:${C.goldSoft};
  border-radius:999px;padding:8px 20px}

/* process chain */
.flowchain{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:center;gap:6px 4px}
.fc-node{display:flex;flex-direction:column;align-items:center;gap:10px;min-width:120px;padding:0 6px}
.fc-ic{height:52px;display:flex;align-items:center}
.fc-ic svg{stroke:${C.ink}}
.fc-lb{font-size:24px;font-weight:800;letter-spacing:.05em;text-align:center;line-height:1.2;max-width:210px}
.flowchain.compact .fc-lb{font-size:20px;max-width:160px}
.fc-arrow{padding-top:14px;flex:0 0 auto}
.flowchain.compact .fc-node{min-width:96px}
.fc-end{font-size:96px;font-weight:800;padding-left:18px;display:flex;flex-direction:column;align-items:center}

/* centrepiece */
.cpiece{display:flex;flex-direction:column;align-items:center;gap:26px}
.cp-big{background:${C.goldInk};color:#fff;font-size:76px;font-weight:800;letter-spacing:-.02em;
  border-radius:22px;padding:26px 62px;text-align:center}
.cp-big .g{color:#fff}
.cp-sub{font-size:28px;color:${C.gray}}
.cp-around{display:flex;flex-wrap:wrap;justify-content:center;gap:14px}
.cp-card{font-size:25px;font-weight:600;border:2px solid ${C.rule};background:#fff;border-radius:14px;
  padding:16px 26px;text-align:center}

/* improvement loop */
.loop{position:relative;margin:0 auto}
.lc-ring{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.lc-node{position:absolute;transform:translate(-50%,-50%);background:${C.bg};padding:10px 20px;
  font-size:25px;font-weight:800;letter-spacing:.06em;white-space:nowrap;text-align:center}
.lc-mid{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:34px;
  text-align:center;max-width:240px;line-height:1.15}

/* concentric rings */
.rings{position:relative;width:560px;height:560px;margin:0 auto}
.ring{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border-radius:50%;
  border:2px solid ${C.gold};display:flex;align-items:flex-start;justify-content:center;padding-top:2.4%}
.ring span{font-size:22px;font-weight:800;letter-spacing:.09em;text-align:center;white-space:nowrap}

/* metric grid: labels only, never invented values */
.mgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.mcard{border:2px solid ${C.rule};background:#fff;border-radius:16px;padding:20px 22px;
  display:flex;flex-direction:column;gap:14px;min-height:118px;justify-content:space-between}
.mc-lb{font-size:20px;font-weight:800;letter-spacing:.11em;line-height:1.2}
.mc-val{height:10px;width:62%;border-radius:6px;background:${C.goldSoft};border:1px solid ${C.gold}}

/* priority stack */
.pstack{display:flex;flex-direction:column;gap:13px;width:1080px;margin:0 auto}
.prow{display:flex;align-items:center;gap:24px;border:2px solid ${C.rule};background:#fff;
  border-radius:16px;padding:18px 28px}
.prow.hot{border-color:${C.goldInk};background:${C.goldSoft}}
.prow-n{width:52px;height:52px;border-radius:50%;background:${C.grayMute};color:#fff;font-size:25px;
  font-weight:800;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.prow.hot .prow-n{background:${C.goldInk}}
.prow-t{font-size:31px;font-weight:800;letter-spacing:.06em}

/* checklist: these are TERMS, so they are set large and never abbreviated */
.cklist{display:grid;gap:16px 34px;width:100%;max-width:1500px;margin:0 auto}
.ckrow{display:flex;align-items:center;gap:20px;border:2px solid ${C.rule};background:#fff;
  border-radius:16px;padding:18px 26px}
.cktick{width:48px;height:48px;border-radius:50%;background:${C.goldSoft};border:2px solid ${C.gold};
  display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.cktick svg{stroke:${C.goldInk};stroke-width:3}
.cktext{font-size:29px;font-weight:700;letter-spacing:.03em;line-height:1.2}

/* branch out: one result, many candidate causes */
.branch{display:flex;flex-direction:column;align-items:center;gap:0;width:100%}
.br-mid{background:${C.goldInk};color:#fff;font-size:56px;font-weight:800;letter-spacing:.02em;
  border-radius:18px;padding:20px 52px}
.br-fan{width:100%;height:74px;display:block}
.br-row{display:flex;justify-content:space-between;gap:12px;width:100%}
.br-card{flex:1 1 0;border:2px solid ${C.rule};background:#fff;border-radius:14px;padding:18px 10px;
  text-align:center;font-size:23px;font-weight:800;letter-spacing:.07em}

/* the leap the evidence does not support */
.leap{display:flex;flex-direction:column;align-items:center;gap:14px}
.leap-box{font-size:46px;font-weight:800;letter-spacing:-.01em;border:2px solid ${C.rule};
  background:#fff;border-radius:18px;padding:24px 52px;text-align:center}
.leap-box.weak{color:${C.grayMute};border-style:dashed}
.leapmark{stroke:${C.goldInk};stroke-width:3.4}
.leap-x{display:flex;align-items:center;justify-content:center}

/* slide 7's conceptual result card: deliberately not CRWN UI */
.resultcard{border:2px solid ${C.rule};background:#fff;border-radius:22px;padding:26px 60px;
  display:flex;flex-direction:column;align-items:center;gap:6px;margin:0 auto}
.resultcard .rc-n{font-size:96px;font-weight:800;line-height:1}
.resultcard .rc-l{font-size:22px;font-weight:800;letter-spacing:.18em;color:${C.gray}}
.midhead{font-size:44px;font-weight:800;letter-spacing:-.02em;color:${C.goldInk};text-align:center}

/* the guarantee, promise and limit rendered together */
.guar{display:flex;flex-direction:column;align-items:center;gap:20px;width:100%}
.guar-lead{font-size:40px;font-weight:600;color:${C.gray};text-align:center;max-width:1300px}
.guar-band{background:${C.goldInk};color:#fff;font-size:34px;font-weight:800;letter-spacing:.16em;
  border-radius:999px;padding:12px 44px}
.guar-promise{font-size:54px;font-weight:800;letter-spacing:-.02em;text-align:center;max-width:1500px;
  line-height:1.12}

/* two routes */
.paths{display:flex;justify-content:center;gap:40px;width:100%}
.path{flex:1 1 0;max-width:700px;border:2px solid ${C.rule};background:#fff;border-radius:24px;
  padding:36px 34px;display:flex;flex-direction:column;align-items:center;gap:18px;text-align:center}
.path.accent{border-color:${C.goldInk};background:${C.goldSoft}}
.path-t{font-size:36px;font-weight:800;letter-spacing:.06em}
.path-s{font-size:25px;color:${C.gray};line-height:1.35;flex:1 1 auto}
.path-cta{background:${C.goldInk};color:#fff;font-size:27px;font-weight:800;letter-spacing:.05em;
  border-radius:999px;padding:16px 40px}

/* Priced plan comparison. Distinct from .path because a plan is not a route the viewer takes now:
   the price is the subject, so it is the largest thing in the card, and there is no action label. */
.plans{display:flex;justify-content:center;gap:34px;width:100%}
.plan{flex:1 1 0;max-width:620px;border:2px solid ${C.rule};background:#fff;border-radius:24px;
  padding:34px 28px;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center}
.plan.accent{border-color:${C.goldInk};background:${C.goldSoft}}
.plan-n{font-size:34px;font-weight:800;letter-spacing:.08em}
.plan-p{font-size:78px;font-weight:800;letter-spacing:-.03em;line-height:1;color:${C.goldInk}}
.plan-per{font-size:24px;color:${C.gray};margin-top:-6px}
.plan-fee{font-size:30px;font-weight:700;border-top:2px solid ${C.rule};padding-top:16px;width:100%}
.plan-for{font-size:23px;color:${C.gray};line-height:1.35}

/* slide 6's diagnostic rail */
.tiles.rail{position:relative}
.tiles.rail::before{content:'';position:absolute;left:3%;right:3%;top:50%;height:2px;
  background:${C.gold};opacity:.5;z-index:0}
.tiles.rail .tile{position:relative;z-index:1}

/* muted non-result at the end of a chain */
.fc-muted{align-self:center;font-size:30px;font-weight:700;color:${C.grayMute};padding-left:18px}

/* plain display centrepiece, on cream rather than a slab */
.cp-big.plain{background:transparent;color:${C.ink};padding:0;font-size:118px;letter-spacing:-.04em}
.cp-big.plain .g{color:${C.goldInk}}

/* slide 15's strongest-fit note */
.fitbox{margin-top:30px;border:2px solid ${C.gold};background:${C.goldSoft};border-radius:18px;
  padding:22px 40px;text-align:center;max-width:1200px;margin-left:auto;margin-right:auto}
.fit-lb{font-size:21px;font-weight:800;letter-spacing:.19em;color:${C.goldInk}}
.fit-tx{font-size:27px;font-weight:600;margin-top:8px;line-height:1.3}

/* the calculator's own number: a slot the editor fills, never a figure we invent */
.rslot{border:3px dashed ${C.gold};background:${C.goldSoft};border-radius:26px;padding:34px 70px;
  display:flex;flex-direction:column;align-items:center;gap:16px;margin:0 auto}
.rslot-lb{font-size:24px;font-weight:800;letter-spacing:.18em;color:${C.gray};text-align:center}
.rslot-token{font-size:86px;font-weight:800;letter-spacing:-.02em;color:${C.goldInk};text-align:center}

/* a relationship that keeps going */
.contline{width:100%;display:flex;flex-direction:column;align-items:center;gap:14px}
.cl-rail{position:relative;width:92%;height:10px;border-radius:6px;background:${C.goldInk};
  display:flex;align-items:center;justify-content:space-around}
.cl-dot{width:26px;height:26px;border-radius:50%;background:${C.goldInk};border:5px solid ${C.bg}}
.cl-lb{font-size:26px;font-weight:800;letter-spacing:.09em;color:${C.goldInk}}

/* moments that end, with the gaps between them visible */
.moments{display:flex;align-items:center;justify-content:center;width:100%}
.moment{display:flex;flex-direction:column;align-items:center;gap:10px}
.mo-card{border:2px solid ${C.rule};background:#fff;border-radius:14px;padding:18px 30px;
  font-size:26px;font-weight:800;letter-spacing:.06em;white-space:nowrap}
.mo-end{font-size:19px;font-weight:800;letter-spacing:.2em;color:${C.grayMute}}
.mo-gap{flex:1 1 auto;height:2px;border-top:3px dotted ${C.rule};margin:0 10px;align-self:flex-start;
  margin-top:38px}

/* the tiers, narrowing */
.pyr{display:flex;flex-direction:column;align-items:center;gap:10px;width:100%}
.pyr-row{border:2px solid ${C.gold};border-radius:14px;padding:16px 26px;display:flex;
  align-items:center;justify-content:space-between;gap:26px}
.pyr-n{font-size:29px;font-weight:800;letter-spacing:.1em}
.pyr-p{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}

/* a starting structure that reads as editable */
.etiers{display:flex;justify-content:center;gap:20px;width:100%}
.etier{flex:1 1 0;max-width:400px;border:2px solid ${C.rule};background:#fff;border-radius:20px;padding:24px 26px}
.et-head{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:27px;
  font-weight:800;letter-spacing:.1em;padding-bottom:14px;border-bottom:2px solid ${C.rule}}
.et-head svg{stroke:${C.goldInk};flex:0 0 auto}
.et-lines{display:flex;flex-direction:column;gap:13px;margin-top:18px}
.et-lines i{display:block;height:10px;border-radius:6px;background:${C.goldSoft}}
.et-lines i:nth-child(2){width:78%}
.et-lines i:nth-child(3){width:56%}

/* the artist as the integration layer */
.frag{position:relative;width:760px;height:560px;margin:0 auto}
.frag-links{position:absolute;inset:0;width:100%;height:100%}
.frag-mid{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;
  flex-direction:column;align-items:center;gap:8px;background:${C.bg};padding:14px 24px;z-index:2}
.frag-mid svg{stroke:${C.ink};stroke-width:1.6}
.frag-mid span{font-size:23px;font-weight:800;letter-spacing:.11em}
.frag-node{position:absolute;transform:translate(-50%,-50%);border:2px dashed ${C.rule};background:#fff;
  border-radius:999px;padding:12px 24px;font-size:23px;font-weight:700;white-space:nowrap}

/* the questions */
.qlist{display:grid;gap:20px 44px;width:100%;max-width:1600px;margin:0 auto}
.qitem{font-size:var(--qs,40px);font-weight:800;letter-spacing:-.01em;line-height:1.15;
  border-left:6px solid ${C.gold};padding-left:26px}

/* separate concerns, one operating line */
.pillars{display:flex;flex-direction:column;align-items:center;width:100%;gap:0}
.pl-row{display:flex;justify-content:center;gap:18px;width:100%}
.pl-card{flex:1 1 0;max-width:330px;border:2px solid ${C.rule};background:#fff;border-radius:18px;
  padding:24px 16px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center}
.pl-card svg{stroke:${C.goldInk}}
.pl-card span{font-size:24px;font-weight:800;letter-spacing:.09em;line-height:1.2}
.pl-line{width:94%;height:8px;border-radius:6px;background:${C.goldInk};margin-top:26px}
.pl-layer{background:${C.goldInk};color:#fff;font-size:28px;font-weight:800;letter-spacing:.16em;
  border-radius:0 0 16px 16px;padding:12px 44px}
.pl-note{font-size:21px;color:${C.grayMute};font-style:italic;margin-top:16px}

/* what the fan economy does */
.orbit{position:relative;width:1120px;height:560px;margin:0 auto}
.orb-mid{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;gap:8px;
  background:${C.goldSoft};border:2px solid ${C.gold};border-radius:999px;padding:22px 34px;z-index:2}
.orb-v{position:absolute;transform:translate(-50%,-50%);background:${C.goldInk};color:#fff;
  border-radius:999px;padding:13px 30px;font-size:25px;font-weight:800;letter-spacing:.1em;white-space:nowrap}

/* slide 43's closing mark */
.closemark{display:flex;justify-content:center;margin-top:44px}
.closemark img{height:96px;width:auto;display:block}

/* slide 2's struck equation, slide 16's blank offer */
.equation{font-size:62px;font-weight:800;letter-spacing:-.02em;color:${C.gray}}
.blankcard{border:3px dashed ${C.rule};background:#fff;border-radius:24px;width:620px;height:330px;
  margin:0 auto;display:flex;align-items:center;justify-content:center;position:relative}
.blankcard span{font-size:110px;font-weight:800;color:${C.rule}}

/* slide 10, the private invitation */
.invite{display:flex;align-items:center;justify-content:center;gap:24px;margin-top:40px}
.invite .icon{stroke:${C.ink}}
.invite .send{stroke:${C.goldInk}}
.invite-group{display:flex;gap:7px}
.invite-group::before{content:'';display:block}
.invite .bubble{font-size:27px;max-width:600px}
`;

export { icon, person, arrow, brush };
export { CROWN } from "./theme.mjs";
