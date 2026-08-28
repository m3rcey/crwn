// The locked CRWN VSL visual system.
// Palette and type are sampled from the reference deck, not invented. Change a token here,
// never inside a layout, or the deck stops looking like one deck.
import fs from "node:fs";
import path from "node:path";

const ASSETS = path.join("scripts", "vsl", "assets");

const b64 = (p) => fs.readFileSync(p).toString("base64");
const font = (name) => `data:font/woff2;base64,${b64(path.join(ASSETS, "fonts", name))}`;
const img = (name) => `data:image/png;base64,${b64(path.join(ASSETS, name))}`;

export const CROWN = {
  black: img("crown-black.png"),
  gold: img("crown-gold.png"),
  cream: img("crown-cream.png"),
};

export const PALETTE = {
  bg: "#FBF8F4", // warm cream, sampled from the reference deck
  ink: "#141414", // headline black
  gray: "#606363", // secondary body copy
  grayMute: "#9C9A96", // illustrative / disclaimer notes
  rule: "#E4DDD2", // hairline dividers
  gold: "#D4AF37", // CRWN brand gold: logo, display numerals, dark-card accents
  goldInk: "#B8761A", // deeper ochre: handwriting, brushstrokes, arrows on cream
  goldSoft: "#F2E6CB", // gold at low opacity for fills
  green: "#406741", // icon badge, sampled from the reference deck
  dark: "#1A1A1A", // dark panels
  darkSoft: "#242424",
};

export const SLIDE = { w: 1920, h: 1080 };

/** The only knobs on the fit pass. Raise `maxBodyScale` and sparse slides fill harder. */
export const FIT_LIMITS = {
  minHead: 54, // px; below this a headline has stopped being a headline
  headGrow: 1.42, // how far past a slide's `headSize` the fitter may grow it
  headBudget: 330, // px the headline block may occupy before the body starts starving
  maxBodyScale: 1.5,
  headGap: 30, // px of air the headline must always leave above the body
};

/** Inline gold emphasis and strike-through inside otherwise plain copy.
 *  [[word]] renders gold, ~~word~~ renders struck through in a hand-drawn gold stroke. */
export function rich(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/~~(.+?)~~/g, '<span class="struck">$1</span>')
    .replace(/\[\[(.+?)\]\]/g, '<span class="g">$1</span>')
    .replace(/\n/g, "<br>");
}

/** A hand-drawn tapered brushstroke. Never a straight CSS rule: the deck's
 *  underlines read as drawn, and a flat border gives that away instantly. */
export function brush({ width = 320, color = PALETTE.goldInk, weight = 8 } = {}) {
  return `<svg class="brush" width="${width}" height="18" viewBox="0 0 320 18" preserveAspectRatio="none" aria-hidden="true">
    <path d="M5,12.5 C62,5.5 118,14.5 176,8.5 C224,3.8 268,11.2 315,6.5"
      fill="none" stroke="${color}" stroke-width="${weight}" stroke-linecap="round"/>
  </svg>`;
}

/** A hand-drawn arrow, used only for annotations. dir: right | left | down */
export function arrow({ dir = "right", len = 120, color = PALETTE.ink, weight = 4 } = {}) {
  if (dir === "down") {
    return `<svg width="46" height="${len}" viewBox="0 0 46 ${len}" aria-hidden="true">
      <path d="M23,4 C19,${len * 0.35} 27,${len * 0.6} 23,${len - 20}" fill="none" stroke="${color}" stroke-width="${weight}" stroke-linecap="round"/>
      <path d="M13,${len - 32} L23,${len - 6} L33,${len - 32}" fill="none" stroke="${color}" stroke-width="${weight}" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }
  const flip = dir === "left" ? ` transform="scale(-1,1) translate(-${len},0)"` : "";
  return `<svg width="${len}" height="40" viewBox="0 0 ${len} 40" aria-hidden="true"><g${flip}>
    <path d="M4,22 C${len * 0.3},14 ${len * 0.6},27 ${len - 18},19" fill="none" stroke="${color}" stroke-width="${weight}" stroke-linecap="round"/>
    <path d="M${len - 34},9 L${len - 6},19 L${len - 33},31" fill="none" stroke="${color}" stroke-width="${weight}" stroke-linecap="round" stroke-linejoin="round"/>
  </g></svg>`;
}

export function css() {
  return `
@font-face{font-family:'Inter';src:url('${font("inter.woff2")}') format('woff2');font-weight:100 900;font-display:block}
@font-face{font-family:'Caveat';src:url('${font("caveat.woff2")}') format('woff2');font-weight:400 700;font-display:block}
@font-face{font-family:'Patrick Hand';src:url('${font("patrickhand.woff2")}') format('woff2');font-weight:400;font-display:block}

*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${SLIDE.w}px;height:${SLIDE.h}px;overflow:hidden}
body{
  background:${PALETTE.bg};
  color:${PALETTE.ink};
  font-family:'Inter',sans-serif;
  font-feature-settings:'ss01','cv05';
  -webkit-font-smoothing:antialiased;
}
.slide{width:${SLIDE.w}px;height:${SLIDE.h}px;display:flex;flex-direction:column;padding:44px 84px 38px;position:relative}

/* ---------- header rail ---------- */
.rail{display:flex;align-items:center;justify-content:space-between;flex:0 0 auto;height:60px}
.mark{display:flex;align-items:center;gap:18px}
.mark img{height:52px;width:auto;display:block}
.mark .word{font-size:44px;font-weight:800;letter-spacing:.05em;line-height:1}
.rail .meta{display:flex;align-items:center;gap:22px}
.rail .deck{font-size:16px;font-weight:700;letter-spacing:.17em;text-transform:uppercase;color:${PALETTE.gray}}
.rail .bar{width:2px;height:30px;background:${PALETTE.gold};opacity:.75}
.rail .num{font-size:30px;font-weight:800;color:${PALETTE.goldInk};letter-spacing:.02em}

/* ---------- headline block ---------- */
.head{flex:0 0 auto;text-align:center;margin-top:16px;margin-bottom:26px}
.head h1{
  font-weight:800;letter-spacing:-.035em;line-height:.98;
  font-size:var(--hs,92px);text-wrap:balance;
}
.head.left{text-align:left}
.head .sub{margin-top:18px;font-size:38px;font-weight:500;color:${PALETTE.gray};line-height:1.3}
.g{color:${PALETTE.goldInk}}
.struck{position:relative;white-space:nowrap}
/* The tilt is deliberately tiny: over a headline-width span even 1.5deg lifts the ends clear
   of the words, and the stroke stops reading as a strike-through. */
.struck::after{
  content:'';position:absolute;left:-1%;right:-1%;top:50%;height:9px;border-radius:6px;
  background:${PALETTE.goldInk};transform:rotate(-0.5deg);opacity:.9;
}
.brush{display:block;margin:6px auto 0}
.head.left .brush{margin-left:0}

/* ---------- body ---------- */
.body{flex:1 1 auto;display:flex;flex-direction:column;justify-content:center;min-height:0}
.bodyfit{width:100%;margin:0 auto}

/* ---------- handwriting ---------- */
.hand{font-family:'Caveat',cursive;font-weight:700;color:${PALETTE.goldInk};line-height:1.1}
.note{font-family:'Patrick Hand',cursive;color:${PALETTE.ink};line-height:1.25}
.hand-u{display:inline-block;position:relative}
.hand-u::after{
  content:'';position:absolute;left:0;right:0;bottom:-2px;height:5px;border-radius:4px;
  background:currentColor;opacity:.85;
}

/* ---------- footer ---------- */
.foot{flex:0 0 auto;display:flex;align-items:flex-end;justify-content:center;gap:14px;min-height:52px;padding:10px 0 6px}
.foot .hand{font-size:50px;line-height:1.24;padding-bottom:2px}
.foot .disclaim{font-size:22px;color:${PALETTE.grayMute};font-weight:500;font-style:italic}
.stack{display:flex;flex-direction:column;align-items:center;gap:8px}

/* ---------- shared pieces ---------- */
.panel{background:#fff;border:2px solid ${PALETTE.rule};border-radius:26px;padding:38px 40px}
.panel.dark{background:${PALETTE.dark};border-color:${PALETTE.dark};color:#fff}
.badge{
  width:76px;height:76px;border-radius:50%;background:${PALETTE.green};
  display:flex;align-items:center;justify-content:center;flex:0 0 auto;
}
.badge svg{width:38px;height:38px;stroke:#fff;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.icon{stroke:${PALETTE.ink};fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.dashbox{border:2.5px dashed ${PALETTE.goldInk};border-radius:20px;padding:24px 42px;display:flex;align-items:center;gap:26px;justify-content:center}
.callout{border:2.5px solid ${PALETTE.goldInk};border-radius:16px;padding:22px 40px;display:flex;align-items:center;gap:24px;justify-content:center}
.eyebrow{font-size:19px;font-weight:800;letter-spacing:.19em;text-transform:uppercase;color:${PALETTE.gray}}
`;
}

/**
 * Fills the frame.
 *
 * A slide's body is centred in whatever height the headline leaves it, so a short diagram used to
 * sit marooned in ~700px of box with 200px of dead air above and below. Hand-picking a size per
 * slide is guesswork that goes stale the moment copy changes, so the page measures instead:
 *
 *  1. The headline grows to the largest size that still fits its height budget. `headSize` stops
 *     being a chosen value and becomes the CAP, which is the only part a human should judge.
 *  2. The body is then scaled to fill the height the headline actually left, capped, so a sparse
 *     slide reads as deliberate rather than unfinished.
 *
 * It runs synchronously before first paint, so the screenshot never catches an unfitted layout.
 */
const FIT = `
(function () {
  var MAXK = ${FIT_LIMITS.maxBodyScale}, MINH = ${FIT_LIMITS.minHead}, HEADROOM = ${FIT_LIMITS.headBudget};
  var body = document.querySelector('.body');
  var fit = document.querySelector('.bodyfit');
  var head = document.querySelector('.head h1');

  if (head) {
    var cap = parseFloat(getComputedStyle(head).fontSize) || 92;
    // The headline may only claim space the body does not need. Sizing it against a fixed budget
    // let a three-line headline starve a tall diagram, which then overran the footer: the body
    // was already past its box at zoom 1, so the fitter below had nothing left to give back.
    var budget = HEADROOM;
    if (body && fit) {
      var shared = head.getBoundingClientRect().height + body.clientHeight;
      budget = Math.min(HEADROOM, shared - fit.getBoundingClientRect().height - ${FIT_LIMITS.headGap});
    }
    // Grow first: the cap is a ceiling, not a target, and most headlines have room above it.
    var best = MINH;
    for (var s = MINH; s <= cap * ${FIT_LIMITS.headGrow}; s += 2) {
      head.style.fontSize = s + 'px';
      if (head.getBoundingClientRect().height <= budget) best = s; else break;
    }
    head.style.fontSize = best + 'px';
  }

  if (fit && body) {
    // Read the body box only AFTER the headline settled, or the budget is the pre-fit one.
    var availH = body.clientHeight;
    // zoom, not transform: a transform squeezes a full-width diagram, while zoom RE-LAYS-OUT, so
    // a ladder rung keeps its width and gains the taller row and bigger type that actually fill
    // the frame. Chrome resolves a percentage width under zoom against the parent DIVIDED by the
    // zoom, so plain width:100% already lands at the right visual width. Dividing it again here
    // (the obvious move) shrank every zoomed body to 1/k of the frame.
    var k = MAXK;
    for (; k > 1.02; k -= 0.02) {
      fit.style.zoom = k.toFixed(3);
      // Both axes, measured after applying. Height alone is not enough: a nowrap line (the reveal
      // slides) cannot reflow, so it silently overflowed the frame and was clipped at both edges.
      var fitsH = fit.getBoundingClientRect().height <= availH;
      var fitsW = fit.scrollWidth <= fit.clientWidth + 1;
      if (fitsH && fitsW) break;
    }
    if (k <= 1.02) fit.style.zoom = '';
  }
})();
`;

export function page({ css: extra = "", html }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css()}${extra}</style></head><body>${html}<script>${FIT}</script></body></html>`;
}
