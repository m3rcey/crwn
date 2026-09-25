// Composition: beats.json -> one HyperFrames HTML composition (index.html + assets).
//
// The CRWN Fan Economy motion language, derived from the brand and the printed-sheet
// series (not borrowed from any creator):
//   - ground: near-black #0D0D0D with a slow gold dot-row motif (the brand's repeating
//     dot rows), never a busy particle field
//   - evidence lives on warm PAPER cards (#F4F1EA) with a physical drop shadow and marker
//     notes in Patrick Hand, the same hand the filmed sheets use: proof looks like a
//     page you could hold
//   - figures in heavy Inter; gold #D4AF37 marks the answer, amber/burnt orange only for
//     qualifiers; white type everywhere else
//   - motion that means something: the thesis strikes "TO fans" through when "FOR fans"
//     lands; the reveal is the only full-frame burst; cards drift, never sit dead
//
// One A-roll <video> runs the whole timeline; each beat moves its frame (full, punch,
// split, hidden). Every component is a function of (beat, times) -> { html, js, boxes }.
// Boxes are the text boxes a component draws, checked against the safe zone before
// any render starts.

import fs from "node:fs";
import path from "node:path";
import { subjectIn } from "./track.mjs";

export const PALETTE = { ink: "#0D0D0D", card: "#1A1A1A", raised: "#2A2A2A", gold: "#D4AF37", amber: "#E8A33D", burnt: "#C2571A", paper: "#F4F1EA", white: "#FFFFFF" };

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r3 = (n) => Math.round(n * 1000) / 1000;

/** Font size that fits `text` across `width` px at an average glyph width ratio. */
export function fitSize(text, width, { max = 200, min = 40, ratio = 0.6 } = {}) {
  const longest = Math.max(...String(text).split("\n").map((l) => l.length), 1);
  return Math.max(min, Math.min(max, Math.floor(width / (longest * ratio))));
}

/** Split a headline into balanced lines of at most `maxChars`. */
export function wrapLines(text, maxChars) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > maxChars) { lines.push(cur); cur = w; } else cur = cur ? cur + " " + w : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

// ------------------------------------------------------------------ A-roll framing

export function arollState(mode, rules) {
  switch (mode) {
    case "punch": return { scale: rules.visual.punchScale, y: 0, clipTop: 0, opacity: 1 };
    case "push": return { scale: 1 + (rules.visual.punchScale - 1) / 2, y: 0, clipTop: 0, opacity: 1 };
    case "split": return { scale: 1.0, y: 470, clipTop: 880, opacity: 1 };
    case "pip": return { scale: 0.42, y: 560, clipTop: 0, opacity: 1 };
    case "hidden": case "world": return { scale: 1.0, y: 0, clipTop: 0, opacity: 0 };
    default: return { scale: 1.0, y: 0, clipTop: 0, opacity: 1 };
  }
}

function arollTimeline(beats, rules) {
  const js = [];
  let prev = null;
  for (const b of beats) {
    const s = arollState(b.aroll, rules);
    const d = Math.max(0.1, b.end - b.start);
    const smooth = prev && (prev.aroll === "split") !== (b.aroll === "split") ? 0.38 : 0;
    if (smooth) {
      const p = arollState(prev.aroll, rules);
      js.push(`tl.fromTo('#arollClip',{clipPath:'inset(${p.clipTop}px 0px 0px 0px)',opacity:${p.opacity}},{clipPath:'inset(${s.clipTop}px 0px 0px 0px)',opacity:${s.opacity},duration:${smooth},ease:'power3.inOut',immediateRender:false},${r3(b.start)});`);
      js.push(`tl.fromTo('#arollWrap',{scale:${p.scale},y:${p.y},x:0},{scale:${s.scale},y:${s.y},x:0,duration:${smooth},ease:'power3.inOut',immediateRender:false},${r3(b.start)});`);
    } else {
      js.push(`tl.set('#arollClip',{clipPath:'inset(${s.clipTop}px 0px 0px 0px)',opacity:${s.opacity}},${r3(b.start)});`);
      js.push(`tl.set('#arollWrap',{scale:${s.scale},y:${s.y}${b.transition === "whip" ? "" : ",x:0,filter:'blur(0px)'"}},${r3(b.start)});`);
    }
    if (b.transition === "whip") js.push(`tl.fromTo('#arollWrap',{x:${b.aroll === "hidden" || b.aroll === "world" ? 0 : -140},filter:'blur(14px)'},{x:0,filter:'blur(0px)',duration:0.22,ease:'power3.out',immediateRender:false},${r3(b.start)});`);
    // Sustain: a slow push so no A-roll beat is ever a dead frame.
    if (b.aroll !== "hidden" && b.aroll !== "world" && d > 0.5) js.push(`tl.fromTo('#arollWrap',{scale:${s.scale}},{scale:${r3(s.scale * 1.025)},duration:${r3(Math.max(0.05, d - smooth - 1 / rules.format.fps))},ease:'none',immediateRender:false},${r3(b.start + smooth)});`);
    prev = b;
  }
  return js.join("\n");
}

// ------------------------------------------------------------------ landscape framing
//
// A landscape source (1920x1080) is ONE video; every beat is a transform of it around
// where the speaker actually is (lib/track.mjs):
//   full   portrait crop: the frame height fills the canvas, centred on the speaker
//   punch  tighter, centred on the eyes (limited by source resolution: rules.landscape)
//   split  portrait crop in the lower part, a graphic above
//   band   landscape-within-vertical: a wide crop that starts past the static occluder,
//          across the middle of the canvas, with room above and below for a graphic
//   hidden
// The crop moves only at a real cut or a change of treatment, and only if the speaker
// moved more than holdPx: a crop that drifts mid-sentence reads as a mistake.

/** Source-time windows that make up an output-time window. */
export function sourceWindows(edl, t0, t1) {
  const out = [];
  for (const s of edl.segments) {
    const a = Math.max(t0, s.outStart), b = Math.min(t1, s.outEnd);
    if (b > a) out.push([s.srcIn + (a - s.outStart), s.srcIn + (b - s.outStart)]);
  }
  return out;
}

export function faceFor(framing, t0, t1) {
  const wins = sourceWindows(framing.edl, t0, t1);
  const pts = [];
  for (const [a, b] of wins) {
    const f = subjectIn(framing.track, a, b);
    if (f) for (let i = 0; i < f.n; i++) pts.push(f);
  }
  if (!pts.length) return subjectIn(framing.track, 0, 1e9);
  const med = (k) => { const v = pts.map((p) => p[k]).sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
  return { x: med("x"), eyeY: med("eyeY"), headTop: med("headTop") };
}

export function landscapeState(mode, face, rules, occluder) {
  const L = rules.landscape;
  const W = rules.format.width, H = rules.format.height;
  const SW = 1920, SH = 1080;
  const fit = H / SH; // 1.7778: the portrait crop
  const leftLimit = occluder ? occluder.to : 0; // never show the occluder if avoidable
  const clampX = (tx, s) => {
    const minTx = W - SW * s; // right edge covers
    const maxTx = Math.min(0, -leftLimit * s); // left edge past the occluder
    return Math.max(minTx, Math.min(maxTx >= minTx ? maxTx : 0, tx));
  };
  const clampY = (ty, s, h = H) => Math.max(h - SH * s, Math.min(0, ty));
  const fx = face?.x ?? SW / 2, fe = face?.eyeY ?? SH * 0.4;
  switch (mode) {
    case "push": {
      // A gentle push that holds the EYES where the full crop has them, so text placed in
      // the headroom above his head stays clear of it (the hook's first visual change).
      const s = fit * L.pushScale;
      return { s, tx: clampX(W / 2 - fx * s, s), ty: clampY(fe * fit - fe * s, s), clipTop: 0, clipBottom: 0, opacity: 1 };
    }
    case "punch": {
      const s = fit * L.punchScale;
      return { s, tx: clampX(W / 2 - fx * s, s), ty: clampY(L.punchEyeY - fe * s, s), clipTop: 0, clipBottom: 0, opacity: 1 };
    }
    case "split": {
      const s = fit;
      return { s, tx: clampX(W / 2 - fx * s, s), ty: Math.max(0, L.splitEyeY - fe * s), clipTop: rules.captions.splitSeamY - 25, clipBottom: 0, opacity: 1 };
    }
    case "band": {
      // A square crop at 1:1 (no upscale from a 1080p source): the sharpest treatment, and
      // it reads as designed for vertical where a 16:9 strip reads as a pasted landscape.
      const s = 1;
      const x0 = Math.max(leftLimit, Math.min(SW - W, fx - W / 2));
      return { s, tx: -x0, ty: L.bandTop, clipTop: L.bandTop, clipBottom: Math.max(0, H - (L.bandTop + SH)), opacity: 1 };
    }
    case "hidden":
    case "world":
      return { s: fit, tx: clampX(W / 2 - fx * fit, fit), ty: 0, clipTop: 0, clipBottom: 0, opacity: 0 };
    default: {
      const s = fit;
      return { s, tx: clampX(W / 2 - fx * s, s), ty: 0, clipTop: 0, clipBottom: 0, opacity: 1 };
    }
  }
}

function landscapeTimeline(beats, rules, framing) {
  const js = [];
  const cuts = new Set(framing.edl.segments.map((s) => +s.outStart.toFixed(2)));
  let prev = null, prevFace = null;
  for (const b of beats) {
    let face = faceFor(framing, b.start, b.end);
    const atCut = cuts.has(+b.start.toFixed(2));
    const modeChange = !prev || prev.aroll !== b.aroll;
    if (prevFace && face && (!(atCut || modeChange) || Math.abs(face.x - prevFace.x) < rules.landscape.holdPx)) face = { ...face, x: prevFace.x, eyeY: prevFace.eyeY };
    const st = landscapeState(b.aroll, face, rules, framing.track.occluder);
    const clip = `inset(${Math.round(st.clipTop)}px 0px ${Math.round(st.clipBottom)}px 0px)`;
    const smooth = prev && ((prev.aroll === "split") !== (b.aroll === "split") || (prev.aroll === "band") !== (b.aroll === "band")) ? 0.38 : 0;
    const d = Math.max(0.1, b.end - b.start);
    const prevSt = prev ? prev.__st : null;
    if (smooth && prevSt) {
      js.push(`tl.fromTo('#arollClip',{clipPath:'${prevSt.clip}',opacity:${prevSt.opacity}},{clipPath:'${clip}',opacity:${st.opacity},duration:${smooth},ease:'power3.inOut',immediateRender:false},${r3(b.start)});`);
      js.push(`tl.fromTo('#arollWrap',{x:${r3(prevSt.tx)},y:${r3(prevSt.ty)},scale:${r3(prevSt.s)}},{x:${r3(st.tx)},y:${r3(st.ty)},scale:${r3(st.s)},duration:${smooth},ease:'power3.inOut',immediateRender:false},${r3(b.start)});`);
    } else {
      js.push(`tl.set('#arollClip',{clipPath:'${clip}',opacity:${st.opacity},x:0,filter:'blur(0px)'},${r3(b.start)});`);
      js.push(`tl.set('#arollWrap',{x:${r3(st.tx)},y:${r3(st.ty)},scale:${r3(st.s)}},${r3(b.start)});`);
    }
    if (b.transition === "whip" && b.aroll !== "hidden" && b.aroll !== "world") js.push(`tl.fromTo('#arollClip',{x:-120,filter:'blur(12px)'},{x:0,filter:'blur(0px)',duration:0.22,ease:'power3.out',immediateRender:false},${r3(b.start)});`);
    // Sustain: a slow push about the speaker's eyes, never a dead frame.
    if (b.aroll !== "hidden" && b.aroll !== "world" && b.aroll !== "band" && d > 0.6 && face) {
      const s2 = st.s * rules.landscape.sustain;
      const px = st.tx + face.x * st.s, py = st.ty + face.eyeY * st.s;
      const tx2 = Math.max(rules.format.width - 1920 * s2, Math.min(0, px - face.x * s2));
      const ty2 = b.aroll === "split" ? st.ty : Math.max(rules.format.height - 1080 * s2, Math.min(0, py - face.eyeY * s2));
      js.push(`tl.fromTo('#arollWrap',{x:${r3(st.tx)},y:${r3(st.ty)},scale:${r3(st.s)}},{x:${r3(tx2)},y:${r3(ty2)},scale:${r3(s2)},duration:${r3(Math.max(0.05, d - smooth - 1 / rules.format.fps))},ease:'none',immediateRender:false},${r3(b.start + smooth)});`);
    }
    b.__st = { ...st, clip };
    prev = b; prevFace = face;
  }
  return js.join("\n");
}

// ------------------------------------------------------------------ components

const PANEL_TOP = 240, PANEL_BOTTOM = 860;
const centerIn = (h, top = PANEL_TOP, bottom = PANEL_BOTTOM) => Math.round(top + Math.max(0, (bottom - top - h) / 2));
const scrim = (b) => (b.aroll === "full" || b.aroll === "punch" || b.aroll === "push" ? `<div class="scrim-top"></div>` : "");
const TOP = 250; // first text line below the platform header
const C = {};

C.HookOpen = (b) => {
  const { headline, mask, maskInline, size: fixedSize, lineTop, maskSize } = b.graphic.props;
  const text = headline.join(" ");
  const lines = headline.length > 1 ? headline : wrapLines(text, 18);
  const measure = maskInline ? lines.map((l, i) => (i === lines.length - 1 ? `${l} ${mask.text}` : l)) : lines;
  const size = fixedSize || Math.min(92, fitSize(measure.join("\n"), 860, { ratio: 0.6, max: 92, min: 54 }));
  const id = `h${b.id}`;
  const html = `
${scrim(b)}
<div class="tag" id="${id}-tag" style="left:72px;top:${TOP}px">FAN ECONOMY</div>
<div class="headline" id="${id}-hl" style="left:72px;top:${lineTop ?? TOP + 70}px;width:936px;font-size:${size}px;white-space:nowrap">${lines.map((l, i) => `<div class="hl-line" id="${id}-l${i}">${esc(l)}${maskInline && i === lines.length - 1 ? ` <span class="mask-inline" id="${id}-mask"><span class="mask-q">${esc(mask.text)}</span></span>` : ""}</div>`).join("")}</div>
${maskInline ? "" : `<div class="mask" id="${id}-mask" style="left:72px;top:${(lineTop ?? TOP + 70) + 16 + lines.length * size * 1.05}px"><span class="mask-q"${maskSize ? ` style="font-size:${maskSize}px"` : ""}>${esc(mask.text)}</span>${mask.unit ? `<span class="mask-unit">${esc(mask.unit)}</span>` : ""}</div>`}`;
  // A pacing split of the hook (b.continued) holds the headline: re-running the entrance
  // on every zoom change made the question blink out and rebuild mid-sentence.
  const js = (b.continued ? [
    `tl.set('#${id}-tag,#${id}-mask,${lines.map((_, i) => `#${id}-l${i}`).join(",")}',{opacity:1,x:0,y:0,scale:1},${r3(b.start)});`,
  ] : [
    `tl.fromTo('#${id}-tag',{opacity:0,x:-30},{opacity:1,x:0,duration:0.3,ease:'power3.out'},${r3(b.start)});`,
    ...lines.map((_, i) => `tl.fromTo('#${id}-l${i}',{opacity:${i === 0 ? 1 : 0},y:${i === 0 ? 0 : 50},scale:${i === 0 ? 1.08 : 1}},{opacity:1,y:0,scale:1,duration:0.35,ease:'power4.out'},${r3(b.start + i * 0.18)});`),
    `tl.fromTo('#${id}-mask',{opacity:0,scale:0.6},{opacity:1,scale:1,duration:0.45,ease:'back.out(2)'},${r3(b.start + 0.55)});`,
  ]).concat([
    `tl.to('#${id}-mask .mask-q',{opacity:0.45,duration:0.5,repeat:${Math.max(1, Math.floor((b.end - b.start) / 1))},yoyo:true,ease:'sine.inOut'},${r3(b.start + (b.continued ? 0.1 : 1))});`,
  ]).join("\n");
  const hlTop = lineTop ?? TOP + 70;
  const boxes = [{ what: "headline", x: 72, y: hlTop, w: 868, h: lines.length * size * 1.05 }, ...(maskInline ? [] : [{ what: "mask", x: 72, y: hlTop + 16 + lines.length * size * 1.05, w: 500, h: (maskSize ?? 78) * 1.4 }])];
  return { html, js, boxes };
};

C.MaskedFigure = (b) => {
  const { mask, pulse } = b.graphic.props;
  const id = `m${b.id}`;
  const html = `<div class="mask mask-lg" id="${id}" style="left:72px;top:${TOP + 20}px"><span class="mask-label">THE NUMBER</span><span class="mask-q">${esc(mask.text)}</span>${mask.unit ? `<span class="mask-unit">${esc(mask.unit)}</span>` : ""}</div>`;
  const js = [
    b.continued ? "" : `tl.fromTo('#${id}',{opacity:0,y:-40},{opacity:1,y:0,duration:0.35,ease:'power3.out'},${r3(b.start)});`,
    `tl.to('#${id} .mask-q',{opacity:${pulse ? 0.35 : 0.6},duration:0.45,repeat:${Math.max(1, Math.floor((b.end - b.start) / 0.9))},yoyo:true,ease:'sine.inOut'},${r3(b.start + 0.3)});`,
  ].join("\n");
  return { html, js, boxes: [{ what: "mask", x: 72, y: TOP + 20, w: 600, h: 150 }] };
};

C.Chip = (b) => {
  const { text, tone } = b.graphic.props;
  const id = `c${b.id}`;
  const size = text.length > 26 ? 34 : 40;
  const html = `<div class="chip ${tone === "quiet" ? "chip-quiet" : ""}" id="${id}" style="left:72px;top:${TOP + 10}px;font-size:${size}px">${esc(text)}</div>`;
  const js = `tl.fromTo('#${id}',{opacity:0,x:-40},{opacity:1,x:0,duration:0.3,ease:'power3.out'},${r3(b.start + 0.05)});\ntl.to('#${id}',{opacity:0,duration:0.2},${r3(Math.max(b.start + 0.4, b.end - 0.2))});\ntl.set('#${id}',{opacity:0},${r3(b.end)});`;
  return { html, js, boxes: [{ what: "chip", x: 72, y: TOP + 10, w: Math.min(868, text.length * size * 0.72 + 64), h: size * 1.8 }] };
};

C.NameTag = (b) => {
  const id = `n${b.id}`;
  const name = String(b.graphic.props.name).toUpperCase();
  const size = fitSize(name, 800, { max: 96, min: 56, ratio: 0.62 });
  const html = `<div class="nametag" id="${id}" style="left:72px;top:${TOP + 40}px"><div class="nt-bar"></div><div class="nt-name" style="font-size:${size}px">${esc(name)}</div></div>`;
  const js = `tl.fromTo('#${id}',{opacity:0,x:-80},{opacity:1,x:0,duration:0.4,ease:'power4.out'},${r3(b.start)});\ntl.fromTo('#${id} .nt-bar',{scaleX:0},{scaleX:1,duration:0.5,ease:'power3.out'},${r3(b.start + 0.1)});\ntl.to('#${id}',{opacity:0,x:-40,duration:0.25},${r3(Math.max(b.start + 0.6, b.end - 0.25))});\ntl.set('#${id}',{opacity:0},${r3(b.end)});`;
  return { html, js, boxes: [{ what: "name", x: 72, y: TOP + 40, w: 820, h: size * 1.3 }] };
};

function paperCard(id, inner, { x = 110, y = TOP + 10, w = 860, h = 560, rot = -1.5 } = {}) {
  return `<div class="paper" id="${id}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;transform:rotate(${rot}deg)">${inner}</div>`;
}

C.FigureCard = (b) => {
  const { figure, qualifier, unit, tag } = b.graphic.props;
  const id = `f${b.id}`;
  const size = fitSize(figure, 700, { max: 190, min: 90, ratio: 0.62 });
  const inner = `${qualifier ? `<div class="fc-qual">${esc(qualifier)}</div>` : ""}<div class="fc-fig" style="font-size:${size}px">${esc(figure)}</div><div class="fc-line" id="${id}-u"></div>${unit ? `<div class="fc-unit">${esc(unit)}</div>` : ""}${tag ? `<div class="fc-tag">${esc(tag)}</div>` : ""}`;
  const html = paperCard(id, inner, { h: 560 });
  const js = [
    `tl.fromTo('#${id}',{opacity:0,y:-120,rotation:-7,scale:0.9},{opacity:1,y:0,rotation:-1.5,scale:1,duration:0.5,ease:'back.out(1.4)'},${r3(b.start + 0.05)});`,
    `tl.fromTo('#${id}-u',{scaleX:0},{scaleX:1,duration:0.45,ease:'power2.out'},${r3(b.start + 0.45)});`,
    `tl.to('#${id}',{y:-14,rotation:-0.6,duration:${r3(Math.max(0.5, b.end - b.start - 0.6))},ease:'sine.inOut'},${r3(b.start + 0.55)});`,
  ].join("\n");
  return { html, js, boxes: [{ what: "figure card", x: 110, y: TOP + 10, w: 860, h: 560 }] };
};

C.Calculation = (b) => {
  const { steps } = b.graphic.props;
  const id = `k${b.id}`;
  const rows = steps.map((s, i) => {
    const size = fitSize(s.figure, 520, { max: 120, min: 64, ratio: 0.62 });
    return `<div class="calc-row" id="${id}-r${i}">${s.qualifier ? `<span class="calc-q">${esc(s.qualifier)}</span>` : ""}<span class="calc-fig ${i === steps.length - 1 ? "calc-last" : ""}" style="font-size:${size}px">${esc(s.figure)}</span>${s.unit ? `<span class="calc-unit">${esc(s.unit)}</span>` : ""}</div>`;
  });
  const html = paperCard(id, `<div class="calc">${rows.join('<div class="calc-arrow">&#8595;</div>')}</div>`, { h: 600 });
  const js = [
    `tl.fromTo('#${id}',{opacity:0,y:-100,rotation:-5},{opacity:1,y:0,rotation:-1.5,duration:0.45,ease:'back.out(1.3)'},${r3(b.start)});`,
    ...steps.map((s, i) => `tl.fromTo('#${id}-r${i}',{opacity:0,x:-60},{opacity:1,x:0,duration:0.35,ease:'power3.out'},${r3(Math.max(b.start + 0.1, (s.at ?? b.start + i * 0.8) - 0.05))});`),
  ].join("\n");
  return { html, js, boxes: [{ what: "calculation", x: 110, y: TOP + 10, w: 860, h: 600 }] };
};

C.Reveal = (b) => {
  const { figure, qualifier, unit } = b.graphic.props;
  const id = `r${b.id}`;
  const size = fitSize(figure, 880, { max: 260, min: 110, ratio: 0.6 });
  const html = `
<div class="rays" id="${id}-rays"></div>
<div class="reveal" id="${id}" style="top:700px">
  ${qualifier ? `<div class="rv-qual">${esc(qualifier)}</div>` : ""}
  <div class="rv-fig" style="font-size:${size}px">${esc(figure)}</div>
  <div class="rv-line" id="${id}-u"></div>
  ${unit ? `<div class="rv-unit">${esc(unit)}</div>` : ""}
</div>
<div class="flash" id="${id}-flash"></div>`;
  const js = [
    `tl.fromTo('#${id}-flash',{opacity:0.85},{opacity:0,duration:0.18,ease:'power2.out'},${r3(b.start)});`,
    `tl.fromTo('#${id}',{scale:1.18,opacity:0},{scale:1,opacity:1,duration:0.42,ease:'back.out(1.4)'},${r3(b.start)});`,
    `tl.fromTo('#${id}-u',{scaleX:0},{scaleX:1,duration:0.5,ease:'power2.out'},${r3(b.start + 0.35)});`,
    `tl.fromTo('#${id}-rays',{rotation:0,opacity:0},{rotation:24,opacity:1,duration:${r3(Math.max(1, b.end - b.start))},ease:'none'},${r3(b.start)});`,
    `tl.to('#${id}',{scale:1.04,duration:${r3(Math.max(0.5, b.end - b.start - 0.5))},ease:'sine.inOut'},${r3(b.start + 0.45)});`,
  ].join("\n");
  return { html, js, boxes: [{ what: "reveal", x: 100, y: 700, w: 880, h: size * 1.1 + 200 }] };
};

C.Thesis = (b, ctx) => {
  const id = `t${b.id}`;
  const lines = b.graphic.props.lines;
  // Sentence times from the spoken words, so each sentence lands when it is said.
  const ws = ctx.outWords.filter((w) => b.lines.includes(w.line));
  const starts = [b.start];
  for (let i = 0; i < ws.length && starts.length < lines.length; i++) {
    if (/[.?!]$/.test(ws[i].text) && ws[i + 1]) starts.push(ws[i + 1].start);
  }
  const html = `<div class="thesis" id="${id}" style="top:${lines.length > 1 ? 380 : 700}px">${lines.map((l, i) => {
    const wrapped = wrapLines(l, 15);
    const size = fitSize(wrapped.join("\n"), 900, { max: 108, min: 64, ratio: 0.68 });
    const marked = wrapped.map((w) => esc(w)).join("<br>").replace(/\bFOR(<br>| )FANS\b/, '<span class="th-for">FOR</span>$1FANS');
    return `<div class="th-line ${i === 0 && lines.length > 1 ? "th-first" : ""}" id="${id}-l${i}" style="font-size:${size}px">${marked}${i === 0 && lines.length > 1 ? `<div class="th-strike" id="${id}-s"></div>` : ""}</div>`;
  }).join("")}</div>`;
  const js = [
    ...lines.map((_, i) => `tl.fromTo('#${id}-l${i}',{opacity:0,y:50},{opacity:1,y:0,duration:0.4,ease:'power4.out'},${r3(starts[i] ?? b.start + i)});`),
    lines.length > 1 ? `tl.fromTo('#${id}-s',{scaleX:0},{scaleX:1,duration:0.35,ease:'power2.inOut'},${r3((starts[1] ?? b.start + 1) + 0.1)});\ntl.to('#${id}-l0',{opacity:0.45,duration:0.3},${r3((starts[1] ?? b.start + 1) + 0.1)});` : "",
    `tl.to('#${id}',{scale:1.03,duration:${r3(Math.max(0.5, b.end - b.start))},ease:'none'},${r3(b.start)});`,
  ].join("\n");
  return { html, js, boxes: [{ what: "thesis", x: 110, y: lines.length > 1 ? 440 : 700, w: 860, h: 900 }] };
};

C.Kinetic = (b) => {
  const id = `w${b.id}`;
  const big = b.graphic.props.big;
  const words = b.graphic.props.words;
  const html = words.map((w, i) => {
    const size = big ? fitSize(w.text, 860, { max: 150, min: 70, ratio: 0.62 }) : fitSize(w.text, 700, { max: 150, min: 70, ratio: 0.62 });
    return `<div class="kin ${big ? "kin-big" : ""}" id="${id}-${i}" style="top:${big ? 760 : TOP + 40}px;font-size:${size}px">${esc(w.text)}</div>`;
  }).join("");
  const js = words.map((w, i) => {
    const at = Math.max(b.start, w.at ?? b.start);
    const next = words[i + 1]?.at ?? b.end;
    const out = Math.min(b.end, Math.max(at + 0.7, Math.min(next, at + 1.1)));
    return `tl.fromTo('#${id}-${i}',{opacity:0,scale:0.55,y:30},{opacity:1,scale:1,y:0,duration:0.22,ease:'back.out(2.2)'},${r3(at)});\ntl.to('#${id}-${i}',{opacity:0,scale:1.08,duration:0.18},${r3(Math.max(at + 0.3, out - 0.18))});`;
  }).join("\n");
  return { html, js, boxes: [{ what: "kinetic", x: 110, y: big ? 760 : TOP + 40, w: 860, h: 200 }] };
};

// HyperFrames discovers media by id and extracts a video's frames from ITS OWN
// data-start, so a <video> may not sit inside a timed scene (it would freeze). Videos go
// to a top-level layer, positioned over the frame drawn in the scene, and every tween on
// the frame is applied to the video too.
function floatingVideo(id, assetId, ctx, { start, dur, offset = 0, box, radius = 38, rate = 1 }) {
  const a = ctx.assetFiles[assetId];
  if (!a || a.type !== "video") return "";
  // data-playback-rate is a constant, render-safe speed (HyperFrames): it lets a short
  // product recording cover a longer line without reaching a screen we must not show.
  return `<video id="${id}" class="clip float-media${radius === 0 ? " ft" : ""}" data-start="${r3(start)}" data-duration="${r3(dur)}" data-media-start="${r3(offset)}"${rate !== 1 ? ` data-playback-rate="${rate}"` : ""} muted playsinline src="${esc(a.rel)}" style="left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;border-radius:${radius}px"></video>`;
}

/**
 * Product footage that OWNS the frame (founder, 2026-09-25: CRWN UI and the calculator
 * are the hero when they are the subject, never a small card over his face). A virtual
 * camera moves inside the recording: `move` is [from, to] of {scale, x, y} (y > 0 pans
 * down the screen). Labels land on their spoken words.
 */
C.Footage = (b, ctx) => {
  const id = `f${b.id}`;
  const p = b.graphic.props;
  const d = Math.max(0.3, b.end - b.start);
  const vid = floatingVideo(`${id}-vid`, p.footage, ctx, { start: b.start, dur: d, offset: p.offset ?? ctx.assetFiles[p.footage]?.startAt ?? 0, box: { x: 0, y: 0, w: 1080, h: 1920 }, radius: 0, rate: p.rate ?? 1 });
  const [m0, m1] = p.move || [{ scale: 1.04 }, { scale: 1.12 }];
  const labels = (p.labels || []).map((l, i) => `<div class="ft-label" id="${id}-l${i}" style="top:${l.y ?? 300}px">${esc(l.text)}</div>`).join("");
  // Labels ride in the media layer, AFTER the video: scene HTML renders beneath floating
  // media, which hid the first footage label under its own recording.
  const html = ``;
  const js = [
    `tl.fromTo('#${id}-vid',{scale:${m0.scale ?? 1},x:${m0.x ?? 0},y:${m0.y ?? 0}},{scale:${m1.scale ?? 1},x:${m1.x ?? 0},y:${m1.y ?? 0},duration:${r3(d)},ease:'${p.ease || "power1.inOut"}',immediateRender:false},${r3(b.start)});`,
    ...(p.labels || []).map((l, i) => `tl.fromTo('#${id}-l${i}',{opacity:0,y:18,scale:0.9},{opacity:1,y:0,scale:1,duration:0.3,ease:'back.out(2)',immediateRender:false},${r3(l.at ?? b.start + 0.3)});\ntl.set('#${id}-l${i}',{opacity:0},${r3(b.end)});`),
  ].join("\n");
  return { html, js, media: vid + labels, boxes: (p.labels || []).map((l) => ({ what: "footage label", x: 140, y: l.y ?? 300, w: 800, h: 70 })) };
};

C.SheetCard = (b, ctx) => {
  const id = `s${b.id}`;
  const full = b.aroll === "hidden";
  const asset = b.graphic.props.asset;
  const box = full ? { x: 120, y: 300, w: 840, h: 1120 } : { x: 130, y: TOP - 10, w: 820, h: 610 };
  const pos = b.graphic.props.focus === "top" ? "50% 8%" : b.graphic.props.focus === "bottom" ? "50% 92%" : "50% 40%";
  const html = `<div class="sheet" id="${id}" style="left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px"><img src="${esc(ctx.assetFiles[asset]?.rel || "")}" style="object-position:${pos}" alt=""></div>`;
  const d = Math.max(0.5, b.end - b.start);
  const js = [
    `tl.fromTo('#${id}',{opacity:0,y:140,rotation:4,scale:0.94},{opacity:1,y:0,rotation:${full ? -1 : 1},scale:1,duration:0.5,ease:'power4.out'},${r3(b.start)});`,
    `tl.fromTo('#${id} img',{scale:1.02},{scale:1.1,duration:${r3(d)},ease:'none'},${r3(b.start)});`,
  ].join("\n");
  return { html, js, boxes: [] };
};

C.CrwnMechanism = (b, ctx) => {
  const id = `x${b.id}`;
  const { footage, chip = "LIVE ON CRWN" } = b.graphic.props;
  // Labels may carry their own spoken time ({text, at}) so each lands on its word.
  const labels = (b.graphic.props.labels || []).map((l) => (typeof l === "string" ? { text: l } : l));
  const split = b.aroll === "split";
  const card = split ? { x: 80, y: PANEL_TOP, w: 450, h: 580 } : { x: 190, y: 380, w: 700, h: 790 };
  const vid = footage ? floatingVideo(`${id}-vid`, footage, ctx, { start: b.start, dur: b.end - b.start, offset: ctx.assetFiles[footage]?.startAt ?? 2, box: card }) : "";
  const tgt = vid ? `#${id}-card,#${id}-vid` : `#${id}-card`;
  const listX = split ? 560 : 190, listY = split ? PANEL_TOP + 90 : card.y + card.h + 40;
  const html = `
<div class="chip chip-gold" id="${id}-chip" style="left:${split ? 560 : 190}px;top:${split ? TOP : 320}px;font-size:${chip.length > 16 ? 28 : 36}px">${esc(chip)}</div>
<div class="device" id="${id}-card" style="left:${card.x}px;top:${card.y}px;width:${card.w}px;height:${card.h}px"></div>${b.graphic.props.deviceLabel ? `<div class="device-label" id="${id}-dl" style="left:${card.x}px;top:${card.y + card.h + 14}px;width:${card.w}px">${esc(b.graphic.props.deviceLabel)}</div>` : ""}
<div class="caplist" id="${id}-list" style="left:${listX}px;top:${listY}px;width:${split ? 380 : 700}px">${labels.map((l, i) => `<div class="cap-item" id="${id}-i${i}">${esc(l.text)}</div>`).join("")}</div>`;
  const d = Math.max(0.5, b.end - b.start);
  const js = [
    `tl.fromTo('${tgt}',{opacity:0,y:160,rotationX:18,scale:0.9},{opacity:1,y:0,rotationX:0,scale:1,duration:0.55,ease:'power4.out'},${r3(b.start)});`,
    `tl.to('${tgt}',{y:-18,duration:${r3(Math.max(0.1, d - 0.55))},ease:'sine.inOut'},${r3(b.start + 0.55)});`,
    `tl.fromTo('#${id}-chip',{opacity:0,y:-20},{opacity:1,y:0,duration:0.3},${r3(b.start + 0.2)});`,
    ...labels.map((l, i) => `tl.fromTo('#${id}-i${i}',{opacity:0,x:40},{opacity:1,x:0,duration:0.3,ease:'power3.out'},${r3(Math.max(b.start + 0.3, l.at ?? b.start + 0.5 + i * Math.min(0.9, d / (labels.length + 1))))});`),
  ].join("\n");
  return { html, js, media: vid, boxes: [{ what: "labels", x: listX, y: listY, w: split ? 380 : 700, h: labels.length * 70 }, { what: "chip", x: split ? 560 : 190, y: split ? TOP : 320, w: 380, h: 64 }] };
};

C.ToolCard = (b, ctx) => {
  const id = `y${b.id}`;
  const { name, footage } = b.graphic.props;
  const title = String(name).toUpperCase();
  const titleLines = wrapLines(title, footage ? 12 : 22);
  const size = fitSize(titleLines.join("\n"), footage ? 420 : 820, { max: 72, min: 40, ratio: 0.64 });
  const cardBox = { x: 90, y: TOP - 20, w: 440, h: 590 };
  const vid = footage ? floatingVideo(`${id}-vid`, footage, ctx, { start: b.start, dur: b.end - b.start, offset: ctx.assetFiles[footage]?.startAt ?? 1, box: cardBox }) : "";
  const html = footage
    ? `<div class="device" id="${id}-card" style="left:90px;top:${TOP - 20}px;width:440px;height:590px"></div>
<div class="tool" id="${id}" style="left:560px;top:${TOP + 40}px;width:380px"><div class="tool-free">FREE</div><div class="tool-name" style="font-size:${size}px">${titleLines.map(esc).join("<br>")}</div></div>`
    : `<div class="tool" id="${id}" style="left:110px;top:${TOP + 80}px;width:830px"><div class="tool-free">FREE</div><div class="tool-name" style="font-size:${size}px">${titleLines.map(esc).join("<br>")}</div></div>`;
  const js = [
    footage ? `tl.fromTo('#${id}-card${vid ? `,#${id}-vid` : ""}',{opacity:0,x:-120,rotation:-6},{opacity:1,x:0,rotation:-2,duration:0.5,ease:'power4.out'},${r3(b.start)});` : "",
    `tl.fromTo('#${id}',{opacity:0,y:40},{opacity:1,y:0,duration:0.4,ease:'power3.out'},${r3(b.start + 0.15)});`,
    `tl.fromTo('#${id} .tool-free',{scale:0.4},{scale:1,duration:0.4,ease:'back.out(2.5)'},${r3(b.start + 0.35)});`,
  ].join("\n");
  return { html, js, media: vid, boxes: [{ what: "tool", x: footage ? 560 : 110, y: TOP + 40, w: footage ? 380 : 830, h: 360 }] };
};

C.Keyword = (b) => {
  const id = `q${b.id}`;
  const kw = String(b.graphic.props.keyword).toUpperCase();
  const size = fitSize(kw, 700, { max: 190, min: 90, ratio: 0.66 });
  const html = `${scrim(b)}<div class="kw" id="${id}" style="top:${TOP + 10}px"><div class="kw-label">COMMENT</div><div class="kw-word" style="font-size:${size}px">${esc(kw)}</div><div class="kw-ring" id="${id}-ring"></div></div>`;
  const js = [
    `tl.fromTo('#${id}',{opacity:0,scale:0.7},{opacity:1,scale:1,duration:0.45,ease:'back.out(2)'},${r3(b.start)});`,
    `tl.fromTo('#${id}-ring',{scale:1,opacity:0.9},{scale:1.25,opacity:0,duration:0.9,repeat:${Math.max(1, Math.floor((b.end - b.start) / 0.9) - 1)},ease:'power2.out'},${r3(b.start + 0.4)});`,
  ].join("\n");
  return { html, js, boxes: [{ what: "keyword", x: 190, y: TOP + 10, w: 700, h: size + 150 }] };
};

C.EndCard = (b, ctx) => {
  const id = `e${b.id}`;
  const { asset, keyword, text } = b.graphic.props;
  const img = asset && ctx.assetFiles[asset] ? `<img src="${esc(ctx.assetFiles[asset].rel)}" alt="">` : `<div class="ec-fallback">&#128081;<br>${esc(text)}</div>`;
  const html = `<div class="endcard" id="${id}"><div class="ec-paper" id="${id}-p">${img}</div>${keyword ? `<div class="ec-kw" id="${id}-k">COMMENT ${esc(keyword)}</div>` : ""}</div>`;
  const js = [
    `tl.fromTo('#${id}-p',{opacity:0,scale:0.86,rotation:-4},{opacity:1,scale:1,rotation:-1,duration:0.5,ease:'back.out(1.5)'},${r3(b.start)});`,
    `tl.to('#${id}-p',{scale:1.03,duration:${r3(Math.max(0.5, b.end - b.start - 0.5))},ease:'sine.out'},${r3(b.start + 0.5)});`,
    keyword ? `tl.fromTo('#${id}-k',{opacity:0,y:30},{opacity:1,y:0,duration:0.35},${r3(b.start + 0.35)});` : "",
  ].join("\n");
  return { html, js, boxes: [{ what: "endcard keyword", x: 190, y: 1390, w: 700, h: 80 }] };
};

C.Comparison = (b) => {
  const id = `v${b.id}`;
  const { left, right } = b.graphic.props;
  const size = fitSize(`${left}`.length > `${right}`.length ? left : right, 380, { max: 76, min: 40, ratio: 0.62 });
  const html = `<div class="versus" id="${id}"><div class="vs-side" id="${id}-a" style="font-size:${size}px">${esc(String(left).toUpperCase())}</div><div class="vs-mid" id="${id}-m">VS</div><div class="vs-side" id="${id}-b" style="font-size:${size}px">${esc(String(right).toUpperCase())}</div></div>`;
  const js = [
    `tl.fromTo('#${id}-a',{opacity:0,x:-200},{opacity:1,x:0,duration:0.4,ease:'power4.out'},${r3(b.start)});`,
    `tl.fromTo('#${id}-b',{opacity:0,x:200},{opacity:1,x:0,duration:0.4,ease:'power4.out'},${r3(b.start + 0.1)});`,
    `tl.fromTo('#${id}-m',{scale:0},{scale:1,duration:0.35,ease:'back.out(3)'},${r3(b.start + 0.3)});`,
  ].join("\n");
  return { html, js, boxes: [{ what: "versus", x: 90, y: 760, w: 880, h: 300 }] };
};

C.Media = (b, ctx) => {
  const id = `u${b.id}`;
  const a = ctx.assetFiles[b.graphic.props.asset];
  const full = b.aroll === "hidden";
  const box = full ? { x: 90, y: 330, w: 900, h: 1150 } : { x: 110, y: TOP - 10, w: 860, h: 600 };
  const vid = a?.type === "video" ? floatingVideo(`${id}-vid`, b.graphic.props.asset, ctx, { start: b.start, dur: b.end - b.start, box, radius: 12 }) : "";
  const inner = a?.type === "video" ? "" : `<img class="media" src="${esc(a?.rel || "")}" alt="">`;
  const html = `<div class="sheet" id="${id}" style="left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px">${inner}</div>${a?.credit ? `<div class="credit" id="${id}-c" style="left:${box.x}px;top:${box.y + box.h + 12}px">${esc(a.credit)}</div>` : ""}`;
  const js = `tl.fromTo('#${id}${vid ? `,#${id}-vid` : ""}',{opacity:0,y:120,rotation:3},{opacity:1,y:0,rotation:-1,duration:0.45,ease:'power4.out'},${r3(b.start)});`;
  return { html, js, media: vid, boxes: [] };
};

// A launch spike against an ongoing line, offer against calendar: two ideas side by side,
// each with a small drawn glyph that behaves like the idea (a spike that falls away, a
// timeline that keeps ticking). Region: the top of the canvas above the speaker.
function glyph(kind, id) {
  if (kind === "spike") return `<svg class="cg" viewBox="0 0 300 120"><path id="${id}" d="M8 110 L90 110 L120 12 L150 110 L292 110" fill="none" stroke="${PALETTE.amber}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if (kind === "line") return `<svg class="cg" viewBox="0 0 300 120"><path id="${id}" d="M8 96 L292 96" fill="none" stroke="${PALETTE.gold}" stroke-width="9" stroke-linecap="round"/>${[0, 1, 2, 3, 4, 5].map((i) => `<circle cx="${20 + i * 52}" cy="96" r="12" fill="${PALETTE.gold}" class="${id}-tick"/>`).join("")}</svg>`;
  if (kind === "box") return `<svg class="cg" viewBox="0 0 300 120"><rect id="${id}" x="90" y="16" width="120" height="96" rx="10" fill="none" stroke="${PALETTE.amber}" stroke-width="9"/></svg>`;
  if (kind === "calendar") return `<svg class="cg" viewBox="0 0 300 120"><rect x="80" y="14" width="140" height="100" rx="10" fill="none" stroke="${PALETTE.gold}" stroke-width="9"/><path d="M80 44 L220 44" stroke="${PALETTE.gold}" stroke-width="9"/>${[0, 1, 2, 3].map((i) => `<rect x="${98 + i * 28}" y="62" width="16" height="16" rx="3" fill="${PALETTE.gold}" class="${id}-tick"/>`).join("")}<path id="${id}" d="M0 0" /></svg>`;
  return "";
}

C.Contrast = (b) => {
  const id = `ct${b.id}`;
  const { left, right, labelSize } = b.graphic.props;
  const col = (side, s) => `<div class="ct-col ct-${side}" id="${id}-${side}">${glyph(s.glyph, `${id}-${side}-g`)}<div class="ct-label"${labelSize ? ` style="font-size:${labelSize}px"` : ""}>${esc(s.label)}</div>${s.sub ? `<div class="ct-sub">${esc(s.sub)}</div>` : ""}</div>`;
  const ctTop = b.aroll === "split" ? centerIn(330) : TOP + 20;
  const html = `${scrim(b)}<div class="contrast" id="${id}" style="top:${ctTop}px">${col("l", left)}<div class="ct-vs" id="${id}-vs">VS</div>${col("r", right)}</div>`;
  const la = Math.max(b.start, left.at ?? b.start), ra = Math.max(b.start + 0.25, right.at ?? b.start + 0.6);
  const js = [
    `tl.fromTo('#${id}-l',{opacity:0,y:40},{opacity:1,y:0,duration:0.35,ease:'power3.out'},${r3(la)});`,
    `tl.fromTo('#${id}-l-g',{strokeDasharray:500,strokeDashoffset:500},{strokeDashoffset:0,duration:0.55,ease:'power2.out'},${r3(la + 0.1)});`,
    `tl.fromTo('#${id}-vs',{opacity:0,scale:0.4},{opacity:1,scale:1,duration:0.3,ease:'back.out(2.5)'},${r3((la + ra) / 2)});`,
    `tl.fromTo('#${id}-r',{opacity:0,y:40},{opacity:1,y:0,duration:0.35,ease:'power3.out'},${r3(ra)});`,
    `tl.fromTo('.${id}-r-g-tick',{scale:0,transformOrigin:'50% 50%'},{scale:1,duration:0.25,stagger:0.12,ease:'back.out(3)'},${r3(ra + 0.1)});`,
    right.emphasis ? `tl.to('#${id}-l',{opacity:0.45,duration:0.3},${r3(ra + 0.2)});` : "",
  ].join("\n");
  return { html, js, boxes: [{ what: "contrast", x: 90, y: ctTop, w: 900, h: 330 }] };
};

// A chain of steps that land on their spoken words; `broken` marks the step where the
// chain fails (the missed date) and everything after it fades like the member who left.
C.Flow = (b) => {
  const id = `fl${b.id}`;
  const { steps, broken, title, dense } = b.graphic.props;
  const rows = steps.map((s, i) => `${i ? `<div class="fl-arrow" id="${id}-a${i}">&#8595;</div>` : ""}<div class="fl-step ${i === broken ? "fl-broken" : ""}" id="${id}-s${i}">${esc(s.text)}</div>`).join("");
  const stepH = dense ? 72 : 84, arrowH = dense ? 38 : 56;
  const flTop = b.aroll === "split" ? centerIn(steps.length * stepH + (steps.length - 1) * arrowH + (title ? 50 : 0)) : TOP;
  const html = `${scrim(b)}<div class="flow ${dense ? "flow-dense" : ""}" id="${id}" style="top:${flTop}px">${title ? `<div class="fl-title">${esc(title)}</div>` : ""}${rows}</div>`;
  const js = steps.map((s, i) => {
    const at = Math.max(b.start + i * 0.05, s.at ?? b.start + i * 0.7);
    const a = i ? `tl.fromTo('#${id}-a${i}',{opacity:0},{opacity:1,duration:0.2},${r3(at - 0.05)});` : "";
    const brk = i === broken ? `\ntl.to('#${id}-s${i}',{keyframes:[{x:-10},{x:10},{x:-8},{x:8},{x:0}],duration:0.35},${r3(at + 0.3)});` : "";
    const after = broken !== undefined && i > broken ? `\ntl.to('#${id}-s${i}',{opacity:0.25,duration:0.8},${r3(at + 0.6)});` : "";
    return `${a}\ntl.fromTo('#${id}-s${i}',{opacity:0,x:-40},{opacity:1,x:0,duration:0.3,ease:'power3.out'},${r3(at)});${brk}${after}`;
  }).join("\n");
  return { html, js, boxes: [{ what: "flow", x: 110, y: flTop, w: 860, h: steps.length * stepH + (steps.length - 1) * arrowH }] };
};

// The two-scenario reveal: the shared terms first, then each version on the word that
// says it, then the difference. Every figure lands on its spoken word (the validator
// reads textAt), none before.
C.CompareReveal = (b) => {
  const id = `cr${b.id}`;
  const { header, rows, diff, footer, compact } = b.graphic.props;
  const crTop = compact ? centerIn(40 + rows.length * 166 + (footer ? 44 : 0)) : 360;
  const html = `${compact ? "" : `<div class="rays" id="${id}-rays"></div>`}<div class="compare ${compact ? "compare-compact" : ""}" id="${id}" style="top:${crTop}px">
  ${header ? `<div class="cr-head" id="${id}-h">${esc(header.text)}</div>` : ""}
  ${rows.map((r, i) => `<div class="cr-row ${i === rows.length - 1 ? "cr-win" : ""}" id="${id}-r${i}"><div class="cr-label">${esc(r.label)}</div><div class="cr-fig">${esc(r.figure)}</div></div>`).join("")}
  ${diff ? `<div class="cr-diff" id="${id}-d"><div class="cr-dfig">${esc(diff.figure)}</div><div class="cr-dlabel">${esc(diff.label)}</div></div>` : ""}
  ${footer ? `<div class="cr-foot" id="${id}-f">${esc(footer.text)}</div>` : ""}
</div>${diff ? `<div class="flash" id="${id}-flash"></div>` : ""}`;
  const js = [
    header ? `tl.fromTo('#${id}-h',{opacity:0,y:-30},{opacity:1,y:0,duration:0.35,ease:'power3.out'},${r3(Math.max(b.start, header.at ?? b.start))});` : "",
    ...rows.map((r, i) => `tl.fromTo('#${id}-r${i}',{opacity:0,scale:${i === rows.length - 1 ? 1.25 : 0.9}},{opacity:1,scale:1,duration:0.4,ease:'back.out(1.6)'},${r3(Math.max(b.start, r.at ?? b.start + i))});`),
    diff ? `tl.fromTo('#${id}-flash',{opacity:0.7},{opacity:0,duration:0.18},${r3(diff.at)});\ntl.fromTo('#${id}-d',{opacity:0,scale:1.4},{opacity:1,scale:1,duration:0.45,ease:'back.out(1.8)'},${r3(diff.at)});\ntl.to('#${id}-r0,#${id}-r1${header ? `,#${id}-h` : ""}',{opacity:0.35,duration:0.3},${r3(diff.at)});` : "",
    compact ? "" : `tl.fromTo('#${id}-rays',{rotation:0,opacity:0.5},{rotation:18,opacity:1,duration:${r3(Math.max(1, b.end - b.start))},ease:'none'},${r3(b.start)});`,
    footer ? `tl.fromTo('#${id}-f',{opacity:0},{opacity:1,duration:0.4},${r3(Math.max(b.start, footer.at ?? b.start))});` : "",
  ].join("\n");
  return { html, js, boxes: [{ what: "compare", x: 110, y: crTop, w: 860, h: compact ? 40 + rows.length * 166 + 44 : 1000 }] };
};

C.QualifierCard = (b) => {
  const id = `qc${b.id}`;
  const { text, sub } = b.graphic.props;
  const inner = `<div class="qc-text">${esc(text)}</div>${sub ? `<div class="qc-sub">${esc(sub)}</div>` : ""}`;
  const qcTop = b.aroll === "split" ? centerIn(330) : TOP + 20;
  const html = paperCard(id, inner, { h: 330, y: qcTop, rot: -1 });
  const js = `tl.fromTo('#${id}',{opacity:0,y:-60,rotation:-4},{opacity:1,y:0,rotation:-1,duration:0.45,ease:'back.out(1.4)'},${r3(b.start + 0.05)});`;
  return { html, js, boxes: [{ what: "qualifier", x: 110, y: qcTop, w: 860, h: 330 }] };
};

// A short on-screen headline (two or three lines), for a beat whose point is a phrase.
C.Headline = (b) => {
  const id = `hd${b.id}`;
  const { lines, at } = b.graphic.props;
  const plain = lines.map((l) => l.replace(/\*/g, ""));
  const band = b.aroll === "band";
  const room = b.aroll === "split" ? PANEL_BOTTOM - PANEL_TOP - 40 : band ? 250 : 360;
  const size = Math.max(52, Math.min(104, fitSize(plain.join("\n"), 900, { ratio: 0.66, max: 104, min: 52 }), Math.floor(room / (lines.length * 1.08))));
  const top = b.aroll === "split" ? centerIn(lines.length * size * 1.08) : TOP + 10;
  const html = `${scrim(b)}<div class="headline" id="${id}" style="left:90px;top:${top}px;width:900px;font-size:${size}px;white-space:nowrap">${lines.map((l, i) => `<div class="hl-line" id="${id}-l${i}">${esc(l).replace(/\*([^*]+)\*/g, '<span class="hl-em">$1</span>')}</div>`).join("")}</div>`;
  const js = lines.map((_, i) => `tl.fromTo('#${id}-l${i}',{opacity:0,y:40},{opacity:1,y:0,duration:0.32,ease:'power3.out'},${r3(Math.max(b.start, (at?.[i] ?? b.start + i * 0.35)))});`).join("\n");
  return { html, js, boxes: [{ what: "headline", x: 90, y: top, w: 900, h: lines.length * size * 1.08 }] };
};

export const COMPONENTS = C;

/** The world spec with each photo's `asset` id resolved to its staged file. */
export function worldSpecFor(spec, assetFiles) {
  const objects = (spec.objects || []).map((o) => {
    if (o.type !== "photo") return o;
    const f = assetFiles[o.asset];
    if (!f) throw new Error(`world photo ${o.id} uses asset "${o.asset}", which was not staged`);
    return { ...o, src: f.rel };
  });
  return { ...spec, objects };
}

/** The world is on screen during these beats (aroll "world", the frame it owns). */
export function worldWindows(beats) {
  const out = [];
  for (const b of beats) {
    if (b.aroll !== "world") continue;
    const last = out[out.length - 1];
    if (last && Math.abs(last[1] - b.start) < 1e-3) last[1] = b.end; else out.push([b.start, b.end]);
  }
  return out;
}

// ------------------------------------------------------------------ captions

export function captionMarkup(phrases, beats, rules) {
  const html = [], js = [];
  const off = beats.filter((b) => b.captions === "off");
  const modeAt = (t) => beats.find((b) => t >= b.start && t < b.end)?.aroll;
  const yFor = (mode) => (mode === "split" ? rules.captions.splitSeamY : mode === "band" && rules.landscape ? rules.landscape.bandCaptionY : rules.captions.y);
  let i = 0;
  for (const p of phrases) {
    const hidden = off.some((b) => p.start < b.end - 0.05 && p.end > b.start + 0.05);
    if (hidden) continue;
    const id = `cp${i++}`;
    const y = yFor(modeAt(p.start));
    html.push(`<div class="clip cap" id="${id}" data-start="${r3(p.start)}" data-duration="${r3(Math.max(0.1, p.end - p.start))}" style="top:${y}px"><div class="cap-in" id="${id}-in">${p.words.map((w, k) => `<span class="cw${w.emph ? " cw-e" : ""}" id="${id}-${k}">${esc(w.text)}</span>`).join(" ")}</div></div>`);
    js.push(`tl.fromTo('#${id}-in',{opacity:0,y:14},{opacity:1,y:0,duration:0.12,ease:'power2.out'},${r3(p.start)});`);
    // The caption travels WITH the picture when the treatment changes under it. Jumping to
    // the split seam at once put it across his face for the 0.38s the video was still
    // sliding (first real reel, 2026-09-24). A transform, not `top`: layout properties snap
    // to whole pixels and stutter under frame-by-frame capture.
    for (let k = 1; k < beats.length; k++) {
      const b = beats[k], pb = beats[k - 1];
      const y0 = yFor(pb.aroll), y1 = yFor(b.aroll);
      const sm = (pb.aroll === "split") !== (b.aroll === "split") || (pb.aroll === "band") !== (b.aroll === "band") ? 0.38 : 0;
      if (!sm || y0 === y1 || !(p.start < b.start + sm && p.end > b.start)) continue;
      js.push(`tl.fromTo('#${id}',{y:${y0 - y1}},{y:0,duration:${sm},ease:'power3.inOut',immediateRender:false},${r3(b.start)});`);
    }
    p.words.forEach((w, k) => js.push(`tl.set('#${id}-${k}',{color:'${PALETTE.gold}'},${r3(w.start)});tl.set('#${id}-${k}',{color:'${w.emph ? PALETTE.amber : PALETTE.white}'},${r3(Math.max(w.start + 0.05, w.end))});`));
  }
  return { html: html.join("\n"), js: js.join("\n"), count: i };
}

// ------------------------------------------------------------------ safe zone

export function safeZoneViolations(boxes, rules) {
  const z = rules.safeZone;
  const out = [];
  for (const b of boxes) {
    const bad = [];
    if (b.x < z.left - 1) bad.push(`left ${b.x} < ${z.left}`);
    if (b.x + b.w > z.right + 60) bad.push(`right ${Math.round(b.x + b.w)} > ${z.right + 60}`);
    if (b.y < z.top - 30) bad.push(`top ${b.y} < ${z.top}`);
    if (b.y + b.h > z.bottom) bad.push(`bottom ${Math.round(b.y + b.h)} > ${z.bottom}`);
    if (bad.length) out.push({ beat: b.beat, what: b.what, problems: bad });
  }
  return out;
}

// ------------------------------------------------------------------ document

export function buildComposition({ plan, phrases, rules, outWords, assetFiles, fontsRel = "assets/fonts", framing = null }) {
  const { width: W, height: H, fps } = rules.format;
  const ctx = { outWords, assetFiles, rules };
  const scenes = [], js = [], boxes = [], missing = [], media = [];
  for (const b of plan.beats) {
    if (!b.graphic) continue;
    const comp = C[b.graphic.component];
    if (!comp) { missing.push(`${b.id}:${b.graphic.component}`); continue; }
    const r = comp(b, ctx);
    const full = b.aroll === "hidden" && b.scene !== "endcard" ? `<div class="ground"></div>` : "";
    scenes.push(`<section class="clip scene" id="scene-${b.id}" data-start="${r3(b.start)}" data-duration="${r3(Math.max(0.05, b.end - b.start))}" data-label="${esc(`${b.id} ${b.scene}`)}">${full}${r.html}</section>`);
    js.push(r.js);
    if (r.media) media.push(r.media);
    for (const x of r.boxes) boxes.push({ ...x, beat: b.id });
  }
  const cap = captionMarkup(phrases, plan.beats, rules);
  const landscape = !!framing;
  // The 3D world (lib/world3d.js): one canvas and one tag overlay above the A-roll, owned
  // by the plan's world spec. Its photos resolve to staged asset files.
  const world = plan.world ? { ...worldSpecFor(plan.world, assetFiles), windows: plan.world.windows || worldWindows(plan.beats) } : null;
  const duration = plan.duration;
  const doc = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=${W},height=${H}">
<title>${esc(plan.title || "Fan Economy reel")}</title>
<script src="assets/gsap.min.js"></script>
<style>
@font-face{font-family:Inter;src:url('${fontsRel}/inter.woff2') format('woff2');font-weight:100 900}
@font-face{font-family:Marker;src:url('${fontsRel}/patrickhand.woff2') format('woff2')}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:${PALETTE.ink};font-family:Inter,sans-serif;color:#fff}
#root{position:absolute;inset:0;width:${W}px;height:${H}px;overflow:hidden;background:${PALETTE.ink}}
#bg{position:absolute;inset:-200px;background-image:radial-gradient(circle,rgba(212,175,55,.16) 2.2px,transparent 2.6px);background-size:46px 46px}
.ground{position:absolute;inset:0;background:${PALETTE.ink}}
.ground::after{content:'';position:absolute;inset:0;background-image:radial-gradient(circle,rgba(212,175,55,.14) 2.2px,transparent 2.6px);background-size:46px 46px}
#arollClip{position:absolute;inset:0;overflow:hidden}
${landscape ? `#arollWrap{position:absolute;left:0;top:0;width:1920px;height:1080px;transform-origin:0 0}
#arollWrap video{position:absolute!important;left:0!important;top:0!important;width:1920px!important;height:1080px!important;max-width:none!important;max-height:none!important;object-fit:fill!important;transform:none!important}` : `#arollWrap{position:absolute;inset:0;transform-origin:50% 34%}
#arollWrap video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}`}
.scene{position:absolute;inset:0;width:${W}px;height:${H}px;overflow:hidden;perspective:1600px}
.scrim-top{position:absolute;left:0;top:0;width:${W}px;height:900px;background:linear-gradient(rgba(13,13,13,.86),rgba(13,13,13,.55) 55%,rgba(13,13,13,0))}
.tag{position:absolute;font-weight:800;font-size:30px;letter-spacing:.32em;color:${PALETTE.gold}}
.headline{position:absolute;font-weight:900;line-height:1.02;letter-spacing:-.02em;color:#fff;text-shadow:0 4px 24px rgba(0,0,0,.5)}
.hl-line{transform-origin:0 50%}
.mask{position:absolute;display:flex;align-items:baseline;gap:22px;padding:14px 34px;border:4px solid ${PALETTE.gold};border-radius:999px;background:rgba(13,13,13,.82)}
.mask-q{font-weight:900;font-size:78px;color:${PALETTE.gold};letter-spacing:.08em}
.mask-unit{font-weight:800;font-size:44px;color:#fff;letter-spacing:.06em}
.mask-lg{flex-direction:column;align-items:flex-start;border-radius:28px;padding:18px 44px 24px}
.mask-lg .mask-q{font-size:104px}
.mask-label{font-weight:800;font-size:28px;letter-spacing:.3em;color:#fff;opacity:.8}
.chip{position:absolute;padding:10px 30px;border-radius:999px;font-weight:800;letter-spacing:.14em;background:rgba(13,13,13,.86);border:3px solid ${PALETTE.gold};color:#fff;white-space:nowrap}
.chip-quiet{border-color:${PALETTE.amber};color:${PALETTE.amber};font-size:30px}
.chip-gold{background:${PALETTE.gold};color:${PALETTE.ink};border-color:${PALETTE.gold}}
.nametag{position:absolute}
.nt-bar{width:140px;height:12px;background:${PALETTE.gold};transform-origin:0 50%;margin-bottom:14px}
.nt-name{font-weight:900;letter-spacing:-.01em;color:#fff;text-shadow:0 4px 30px rgba(0,0,0,.7)}
.paper{position:absolute;background:${PALETTE.paper};color:${PALETTE.ink};border-radius:10px;padding:46px 56px;box-shadow:0 30px 60px rgba(0,0,0,.55),0 6px 14px rgba(0,0,0,.4);display:flex;flex-direction:column;justify-content:center}
.fc-qual{font-family:Marker;font-size:58px;color:${PALETTE.burnt};line-height:1}
.fc-fig{font-weight:900;line-height:1;letter-spacing:-.03em}
.fc-line{height:12px;width:78%;background:${PALETTE.gold};transform-origin:0 50%;margin:14px 0 10px;border-radius:6px}
.fc-unit{font-family:Marker;font-size:62px;line-height:1.05}
.fc-tag{position:absolute;right:34px;top:30px;font-weight:800;font-size:26px;letter-spacing:.14em;color:#fff;background:${PALETTE.burnt};padding:8px 18px;border-radius:8px;transform:rotate(3deg)}
.calc{display:flex;flex-direction:column;gap:10px}
.calc-row{display:flex;align-items:baseline;gap:18px;flex-wrap:wrap}
.calc-q{font-family:Marker;font-size:44px;color:${PALETTE.burnt}}
.calc-fig{display:inline-block;font-weight:900;letter-spacing:-.03em;line-height:1.12}
.calc-last{color:${PALETTE.ink};background:linear-gradient(transparent 62%,${PALETTE.gold} 62%)}
.calc-unit{font-family:Marker;font-size:52px}
.calc-arrow{display:block;font-size:52px;color:${PALETTE.burnt};line-height:1.1;padding-left:10px;margin:6px 0}
.rays{position:absolute;left:-460px;top:-60px;width:2000px;height:2000px;background:repeating-conic-gradient(from 0deg at 50% 50%,rgba(212,175,55,.10) 0deg 6deg,transparent 6deg 18deg);border-radius:50%}
.reveal{position:absolute;left:0;width:${W}px;text-align:center}
.rv-qual{font-weight:800;font-size:46px;letter-spacing:.2em;color:#fff;margin-bottom:34px;padding:0 90px}
.rv-fig{font-weight:900;letter-spacing:-.04em;line-height:1;color:${PALETTE.gold}}
.rv-line{height:14px;width:640px;margin:22px auto 18px;background:#fff;transform-origin:50% 50%;border-radius:7px}
.rv-unit{font-weight:800;font-size:64px;letter-spacing:.06em;color:#fff;padding:0 90px}
.flash{position:absolute;inset:0;background:${PALETTE.gold};opacity:0}
.thesis{position:absolute;left:110px;width:860px}
.th-line{position:relative;font-weight:900;line-height:1.06;letter-spacing:-.02em;margin-bottom:34px}
.th-for{color:${PALETTE.ink};background:${PALETTE.gold};padding:0 12px;border-radius:8px}
.th-strike{position:absolute;left:-10px;right:-10px;top:52%;height:12px;background:${PALETTE.gold};transform-origin:0 50%;border-radius:6px}
.kin{position:absolute;left:110px;width:860px;text-align:center;font-weight:900;letter-spacing:-.02em;color:${PALETTE.gold};text-shadow:0 6px 36px rgba(0,0,0,.75);-webkit-text-stroke:3px ${PALETTE.ink};paint-order:stroke fill}
.kin-big{color:#fff}
.sheet{position:absolute;border-radius:12px;overflow:hidden;background:${PALETTE.paper};box-shadow:0 34px 70px rgba(0,0,0,.6),0 8px 16px rgba(0,0,0,.45)}
.sheet img,.sheet video{width:100%;height:100%;object-fit:cover}
.device{position:absolute;border-radius:38px;overflow:hidden;background:#000;box-shadow:0 40px 80px rgba(0,0,0,.65),0 0 0 3px rgba(212,175,55,.55)}
.float-media{position:absolute;object-fit:cover;box-shadow:0 0 0 3px rgba(212,175,55,.55)}
.caplist{position:absolute;display:flex;flex-direction:column;gap:16px}
.cap-item{font-weight:800;font-size:44px;line-height:1.1;color:#fff;padding-left:26px;border-left:8px solid ${PALETTE.gold}}
.tool{position:absolute;display:flex;flex-direction:column;gap:18px}
.tool-free{align-self:flex-start;font-weight:900;font-size:64px;letter-spacing:.08em;color:${PALETTE.ink};background:${PALETTE.gold};padding:6px 30px;border-radius:14px}
.tool-name{font-weight:900;line-height:1.05;color:#fff;text-shadow:0 4px 24px rgba(0,0,0,.7)}
.kw{position:absolute;left:0;width:${W}px;display:flex;flex-direction:column;align-items:center}
.kw-label{font-weight:800;font-size:46px;letter-spacing:.32em;color:#fff;margin-bottom:8px}
.kw-word{font-weight:900;letter-spacing:.02em;color:${PALETTE.ink};background:${PALETTE.gold};padding:4px 48px;border-radius:24px;line-height:1.1}
.kw-ring{position:absolute;left:50%;top:62%;width:760px;height:260px;margin-left:-380px;margin-top:-130px;border:5px solid ${PALETTE.gold};border-radius:40px}
.endcard{position:absolute;inset:0;background:${PALETTE.ink};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:48px}
.ec-paper{width:720px;height:960px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 40px 80px rgba(0,0,0,.6)}
.ec-paper img{width:100%;height:100%;object-fit:cover}
.ec-fallback{color:${PALETTE.ink};font-weight:900;font-size:200px;text-align:center;padding-top:220px;line-height:1.1}
.ec-kw{font-weight:900;font-size:56px;letter-spacing:.12em;color:${PALETTE.gold}}
.versus{position:absolute;left:90px;top:760px;width:900px;display:flex;align-items:center;justify-content:space-between}
.vs-side{width:370px;font-weight:900;line-height:1.02;text-align:center}
.vs-mid{font-weight:900;font-size:64px;color:${PALETTE.ink};background:${PALETTE.gold};border-radius:50%;width:130px;height:130px;display:flex;align-items:center;justify-content:center}
.credit{position:absolute;font-size:24px;color:rgba(255,255,255,.7);letter-spacing:.06em}
.contrast{position:absolute;left:90px;width:900px;display:flex;align-items:flex-start;justify-content:space-between}
.ct-col{width:390px;display:flex;flex-direction:column;align-items:center;text-align:center}
.cg{width:340px;height:130px;overflow:visible}
.ct-label{font-weight:900;font-size:78px;letter-spacing:-.01em;line-height:1;margin-top:18px}
.ct-l .ct-label{color:#fff}.ct-r .ct-label{color:${PALETTE.gold}}
.ct-sub{font-family:Marker;font-size:52px;line-height:1.05;margin-top:12px;color:#fff;text-wrap:balance}
.ct-vs{font-weight:900;font-size:36px;color:${PALETTE.ink};background:${PALETTE.gold};border-radius:50%;width:84px;height:84px;display:flex;align-items:center;justify-content:center;margin-top:80px}
.flow{position:absolute;left:110px;width:860px;display:flex;flex-direction:column;align-items:flex-start}
.fl-title{font-weight:800;font-size:30px;letter-spacing:.3em;color:${PALETTE.gold};margin-bottom:14px}
.fl-step{font-weight:900;font-size:58px;line-height:1.08;color:#fff;text-wrap:balance;padding:8px 26px;border-left:10px solid ${PALETTE.gold};background:rgba(13,13,13,.72)}
.fl-broken{color:${PALETTE.ink};background:${PALETTE.burnt};border-left-color:${PALETTE.burnt}}
.fl-arrow{font-size:44px;line-height:1;color:${PALETTE.amber};padding:6px 0 6px 30px}
.compare{position:absolute;left:110px;top:360px;width:860px;display:flex;flex-direction:column;gap:30px}
.cr-head{font-weight:800;font-size:44px;letter-spacing:.14em;color:#fff;text-align:center}
.cr-row{display:flex;align-items:baseline;justify-content:space-between;background:${PALETTE.paper};color:${PALETTE.ink};border-radius:12px;padding:26px 40px;box-shadow:0 26px 50px rgba(0,0,0,.5)}
.cr-label{font-family:Marker;font-size:64px;line-height:1}
.cr-fig{font-weight:900;font-size:120px;letter-spacing:-.03em;line-height:1}
.cr-win .cr-fig{color:${PALETTE.ink};background:linear-gradient(transparent 60%,${PALETTE.gold} 60%)}
.cr-diff{text-align:center;margin-top:16px}
.cr-dfig{font-weight:900;font-size:176px;letter-spacing:-.04em;line-height:1;color:${PALETTE.gold}}
.cr-dlabel{font-weight:800;font-size:54px;letter-spacing:.14em;color:#fff;margin-top:8px}
.qc-text{font-weight:900;font-size:76px;line-height:1.02;letter-spacing:-.01em}
.qc-sub{font-family:Marker;font-size:54px;line-height:1.05;margin-top:18px;color:${PALETTE.burnt}}
.hl-em{color:${PALETTE.gold}}
.flow-dense .fl-step{font-size:56px;padding:6px 24px}
.flow-dense .fl-arrow{font-size:32px;padding:2px 0 2px 28px}
.mask-inline{display:inline-block;padding:0 16px;border:4px solid ${PALETTE.gold};border-radius:999px;line-height:1.05;background:rgba(13,13,13,.8)}
.mask-inline .mask-q{font-size:inherit;letter-spacing:.06em}
.compare-compact{gap:18px}
.compare-compact .cr-head{font-size:40px}
.compare-compact .cr-row{padding:18px 34px}
.compare-compact .cr-label{font-size:60px}
.compare-compact .cr-fig{font-size:112px}
.cr-foot{font-weight:800;font-size:30px;letter-spacing:.16em;color:${PALETTE.amber};text-align:center;margin-top:4px}
.device-label{position:absolute;text-align:center;font-weight:800;font-size:26px;letter-spacing:.18em;color:rgba(255,255,255,.8)}
.cap{position:absolute;left:${rules.safeZone.left}px;width:${rules.safeZone.right - rules.safeZone.left}px;text-align:center;font-weight:850;font-size:${rules.captions.fontPx ?? 66}px;line-height:1.12;color:#fff;-webkit-text-stroke:${Math.round((rules.captions.fontPx ?? 66) / 7)}px ${PALETTE.ink};paint-order:stroke fill;text-shadow:0 6px 18px rgba(0,0,0,.55);transform:translateY(-50%)${rules.captions.upper ? ";text-transform:uppercase;letter-spacing:.01em" : ""}}
.cw-e{color:${PALETTE.amber}}
.float-media.ft{object-fit:cover;box-shadow:none}
.ft-vignette{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,rgba(0,0,0,0) 55%,rgba(0,0,0,.55) 100%)}
.ft-label{position:absolute;z-index:5;opacity:0;left:50%;transform:translateX(-50%);white-space:nowrap;font-weight:900;font-size:38px;letter-spacing:.03em;color:${PALETTE.ink};background:${PALETTE.gold};padding:10px 24px;border-radius:14px;box-shadow:0 10px 34px rgba(0,0,0,.5)}
#gl{position:absolute;left:0;top:0;width:${W}px;height:${H}px;visibility:hidden}
#wo{position:absolute;inset:0;pointer-events:none;visibility:hidden}
.wtag{position:absolute;left:0;top:0;white-space:nowrap;font-weight:900;letter-spacing:.03em;opacity:0}
.wtag-tag{font-size:36px;color:${PALETTE.ink};background:${PALETTE.gold};padding:9px 20px;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.45)}
.wtag-dark{font-size:34px;color:#fff;background:rgba(13,13,13,.78);border:3px solid ${PALETTE.gold};padding:8px 20px;border-radius:14px}
.wtag-big{font-size:104px;color:${PALETTE.gold};letter-spacing:-.01em;text-shadow:0 8px 34px rgba(0,0,0,.75)}
.wtag-name{font-size:132px;color:#fff;letter-spacing:.02em;text-shadow:0 10px 40px rgba(0,0,0,.8)}
.wtag-num{font-size:150px;color:#fff;letter-spacing:-.02em;text-shadow:0 10px 44px rgba(0,0,0,.85)}
.wtag-gold{font-size:150px;color:${PALETTE.gold};letter-spacing:-.02em;text-shadow:0 10px 44px rgba(0,0,0,.85)}
.wtag-dim{font-size:30px;color:#fff;opacity:.85;letter-spacing:.22em;font-weight:800}
.wtag-credit{font-size:20px;color:rgba(255,255,255,.62);font-weight:600;letter-spacing:.02em}
</style></head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${r3(duration)}" data-width="${W}" data-height="${H}" data-fps="${fps}">
<div id="bg"></div>
<div id="arollClip"><div id="arollWrap" data-layout-allow-overflow><video id="av" class="clip" data-start="0" data-duration="${r3(plan.arollDuration ?? duration)}" muted playsinline src="assets/aroll.mp4"${landscape ? ` style="width:1920px;height:1080px;object-fit:fill"` : ""}></video></div></div>
${world ? `<canvas id="gl" width="${W}" height="${H}" data-layout-allow-overflow></canvas>\n<div id="wo" data-layout-allow-overflow></div>` : ""}
${scenes.join("\n")}
${media.join("\n")}
<div id="captions">${cap.html}</div>
</div>
<script>
const tl = gsap.timeline({ paused: true });
tl.to('#bg',{x:92,y:-184,duration:${r3(duration)},ease:'none'},0);
${landscape ? landscapeTimeline(plan.beats, rules, framing) : arollTimeline(plan.beats, rules)}
${js.join("\n")}
${cap.js}
tl.set({}, {}, ${r3(duration)});
window.__timelines = window.__timelines || {};
window.__timelines.main = tl;
</script>
${world ? `<script type="module">
import { createWorld } from './assets/world3d.js';
const world = createWorld(document.getElementById('gl'), ${JSON.stringify(world)}, document.getElementById('wo'));
window.addEventListener('hf-seek', (e) => { e.detail.waitUntil(world.ready.then(() => world.render(e.detail.time))); });
world.ready.then(() => world.render(0));
</script>` : ""}
</body></html>
`;
  return { html: doc, boxes, missing, captions: cap.count };
}

/** Write a HyperFrames project directory. */
export function writeProject(dir, html, meta) {
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ id: meta.id, name: meta.name, createdAt: meta.createdAt }, null, 2));
  fs.writeFileSync(path.join(dir, "hyperframes.json"), JSON.stringify({ paths: { assets: "assets" }, media: { autoProxy: true } }, null, 2));
}
