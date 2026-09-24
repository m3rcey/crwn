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
    case "split": return { scale: 1.0, y: 470, clipTop: 880, opacity: 1 };
    case "pip": return { scale: 0.42, y: 560, clipTop: 0, opacity: 1 };
    case "hidden": return { scale: 1.0, y: 0, clipTop: 0, opacity: 0 };
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
      js.push(`tl.to('#arollClip',{clipPath:'inset(${s.clipTop}px 0px 0px 0px)',opacity:${s.opacity},duration:${smooth},ease:'power3.inOut'},${r3(b.start)});`);
      js.push(`tl.to('#arollWrap',{scale:${s.scale},y:${s.y},x:0,duration:${smooth},ease:'power3.inOut'},${r3(b.start)});`);
    } else {
      js.push(`tl.set('#arollClip',{clipPath:'inset(${s.clipTop}px 0px 0px 0px)',opacity:${s.opacity}},${r3(b.start)});`);
      js.push(`tl.set('#arollWrap',{scale:${s.scale},y:${s.y}${b.transition === "whip" ? "" : ",x:0"}},${r3(b.start)});`);
    }
    if (b.transition === "whip") js.push(`tl.fromTo('#arollWrap',{x:${b.aroll === "hidden" ? 0 : -140},filter:'blur(14px)'},{x:0,filter:'blur(0px)',duration:0.22,ease:'power3.out'},${r3(b.start)});`);
    // Sustain: a slow push so no A-roll beat is ever a dead frame.
    if (b.aroll !== "hidden" && d > 0.5) js.push(`tl.to('#arollWrap',{scale:${r3(s.scale * 1.025)},duration:${r3(Math.max(0.05, d - smooth - 1 / rules.format.fps))},ease:'none'},${r3(b.start + smooth)});`);
    prev = b;
  }
  return js.join("\n");
}

// ------------------------------------------------------------------ components

const TOP = 250; // first text line below the platform header
const C = {};

C.HookOpen = (b) => {
  const { headline, mask } = b.graphic.props;
  const text = headline.join(" ");
  const lines = headline.length > 1 ? headline : wrapLines(text, 18);
  const size = Math.min(92, fitSize(lines.join("\n"), 820, { ratio: 0.58, max: 92, min: 54 }));
  const id = `h${b.id}`;
  const html = `
<div class="scrim-top"></div>
<div class="tag" id="${id}-tag" style="left:72px;top:${TOP}px">FAN ECONOMY</div>
<div class="headline" id="${id}-hl" style="left:72px;top:${TOP + 70}px;width:868px;font-size:${size}px">${lines.map((l, i) => `<div class="hl-line" id="${id}-l${i}">${esc(l)}</div>`).join("")}</div>
<div class="mask" id="${id}-mask" style="left:72px;top:${TOP + 90 + lines.length * size * 1.05}px"><span class="mask-q">${esc(mask.text)}</span>${mask.unit ? `<span class="mask-unit">${esc(mask.unit)}</span>` : ""}</div>`;
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
  const boxes = [{ what: "headline", x: 72, y: TOP + 70, w: 868, h: lines.length * size * 1.05 }, { what: "mask", x: 72, y: TOP + 90 + lines.length * size * 1.05, w: 500, h: 120 }];
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
    `tl.fromTo('#${id}',{scale:1.45,opacity:0},{scale:1,opacity:1,duration:0.42,ease:'back.out(1.6)'},${r3(b.start)});`,
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
  const html = `<div class="thesis" id="${id}" style="top:${lines.length > 1 ? 440 : 700}px">${lines.map((l, i) => {
    const wrapped = wrapLines(l, 17);
    const size = fitSize(wrapped.join("\n"), 860, { max: 100, min: 60, ratio: 0.7 });
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
function floatingVideo(id, assetId, ctx, { start, dur, offset = 0, box, radius = 38 }) {
  const a = ctx.assetFiles[assetId];
  if (!a || a.type !== "video") return "";
  return `<video id="${id}" class="clip float-media" data-start="${r3(start)}" data-duration="${r3(dur)}" data-media-start="${r3(offset)}" muted playsinline src="${esc(a.rel)}" style="left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;border-radius:${radius}px"></video>`;
}

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
  const { footage, labels } = b.graphic.props;
  const split = b.aroll === "split";
  const card = split ? { x: 90, y: TOP - 20, w: 440, h: 590 } : { x: 190, y: 420, w: 700, h: 938 };
  const vid = footage ? floatingVideo(`${id}-vid`, footage, ctx, { start: b.start, dur: b.end - b.start, offset: ctx.assetFiles[footage]?.startAt ?? 2, box: card }) : "";
  const tgt = vid ? `#${id}-card,#${id}-vid` : `#${id}-card`;
  const listX = split ? 560 : 190, listY = split ? TOP + 60 : 1390;
  const html = `
<div class="chip chip-gold" id="${id}-chip" style="left:${split ? 560 : 190}px;top:${split ? TOP : 320}px;font-size:36px">LIVE ON CRWN</div>
<div class="device" id="${id}-card" style="left:${card.x}px;top:${card.y}px;width:${card.w}px;height:${card.h}px"></div>
<div class="caplist" id="${id}-list" style="left:${listX}px;top:${listY}px;width:${split ? 380 : 700}px">${labels.map((l, i) => `<div class="cap-item" id="${id}-i${i}">${esc(l)}</div>`).join("")}</div>`;
  const d = Math.max(0.5, b.end - b.start);
  const js = [
    `tl.fromTo('${tgt}',{opacity:0,y:160,rotationX:18,scale:0.9},{opacity:1,y:0,rotationX:0,scale:1,duration:0.55,ease:'power4.out'},${r3(b.start)});`,
    `tl.to('${tgt}',{y:-18,duration:${r3(Math.max(0.1, d - 0.55))},ease:'sine.inOut'},${r3(b.start + 0.55)});`,
    `tl.fromTo('#${id}-chip',{opacity:0,y:-20},{opacity:1,y:0,duration:0.3},${r3(b.start + 0.2)});`,
    ...labels.map((_, i) => `tl.fromTo('#${id}-i${i}',{opacity:0,x:40},{opacity:1,x:0,duration:0.3,ease:'power3.out'},${r3(b.start + 0.5 + i * Math.min(0.9, d / (labels.length + 1)))});`),
  ].join("\n");
  return { html, js, media: vid, boxes: [{ what: "labels", x: listX, y: listY, w: split ? 380 : 700, h: labels.length * 70 }, { what: "chip", x: split ? 560 : 190, y: split ? TOP : 320, w: 380, h: 64 }] };
};

C.ToolCard = (b, ctx) => {
  const id = `y${b.id}`;
  const { name, footage } = b.graphic.props;
  const title = String(name).toUpperCase();
  const size = fitSize(title, footage ? 420 : 820, { max: 64, min: 36, ratio: 0.62 });
  const cardBox = { x: 90, y: TOP - 20, w: 440, h: 590 };
  const vid = footage ? floatingVideo(`${id}-vid`, footage, ctx, { start: b.start, dur: b.end - b.start, offset: ctx.assetFiles[footage]?.startAt ?? 1, box: cardBox }) : "";
  const html = footage
    ? `<div class="device" id="${id}-card" style="left:90px;top:${TOP - 20}px;width:440px;height:590px"></div>
<div class="tool" id="${id}" style="left:560px;top:${TOP + 40}px;width:380px"><div class="tool-free">FREE</div><div class="tool-name" style="font-size:${size}px">${esc(title)}</div></div>`
    : `<div class="tool" id="${id}" style="left:110px;top:${TOP + 80}px;width:830px"><div class="tool-free">FREE</div><div class="tool-name" style="font-size:${size}px">${esc(title)}</div></div>`;
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
  const html = `<div class="scrim-top"></div><div class="kw" id="${id}" style="top:${TOP + 10}px"><div class="kw-label">COMMENT</div><div class="kw-word" style="font-size:${size}px">${esc(kw)}</div><div class="kw-ring" id="${id}-ring"></div></div>`;
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

export const COMPONENTS = C;

// ------------------------------------------------------------------ captions

export function captionMarkup(phrases, beats, rules) {
  const html = [], js = [];
  const off = beats.filter((b) => b.captions === "off");
  const splitAt = (t) => beats.find((b) => t >= b.start && t < b.end)?.aroll === "split";
  let i = 0;
  for (const p of phrases) {
    const hidden = off.some((b) => p.start < b.end - 0.05 && p.end > b.start + 0.05);
    if (hidden) continue;
    const id = `cp${i++}`;
    const y = splitAt(p.start) ? rules.captions.splitSeamY : rules.captions.y;
    html.push(`<div class="clip cap" id="${id}" data-start="${r3(p.start)}" data-duration="${r3(Math.max(0.1, p.end - p.start))}" style="top:${y}px">${p.words.map((w, k) => `<span class="cw${w.emph ? " cw-e" : ""}" id="${id}-${k}">${esc(w.text)}</span>`).join(" ")}</div>`);
    js.push(`tl.fromTo('#${id}',{opacity:0,y:14},{opacity:1,y:0,duration:0.12,ease:'power2.out'},${r3(p.start)});`);
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

export function buildComposition({ plan, phrases, rules, outWords, assetFiles, fontsRel = "assets/fonts" }) {
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
#arollWrap{position:absolute;inset:0;transform-origin:50% 34%}
#arollWrap video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.scene{position:absolute;inset:0;width:${W}px;height:${H}px;overflow:hidden;perspective:1600px}
.scrim-top{position:absolute;left:0;top:0;width:${W}px;height:900px;background:linear-gradient(rgba(13,13,13,.86),rgba(13,13,13,.55) 55%,rgba(13,13,13,0))}
.tag{position:absolute;font-weight:800;font-size:30px;letter-spacing:.32em;color:${PALETTE.gold}}
.headline{position:absolute;font-weight:900;line-height:1.02;letter-spacing:-.02em;color:#fff;text-shadow:0 4px 24px rgba(0,0,0,.5)}
.hl-line{transform-origin:0 50%}
.mask{position:absolute;display:flex;align-items:baseline;gap:22px;padding:14px 34px;border:4px solid ${PALETTE.gold};border-radius:999px;background:rgba(13,13,13,.82)}
.mask-q{font-weight:900;font-size:78px;color:${PALETTE.gold};letter-spacing:.08em}
.mask-unit{font-weight:800;font-size:44px;color:#fff;letter-spacing:.06em}
.mask-lg{flex-direction:column;align-items:flex-start;border-radius:28px;padding:18px 40px 22px}
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
.rv-qual{font-weight:800;font-size:54px;letter-spacing:.24em;color:#fff;margin-bottom:6px}
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
.cap-item{font-weight:800;font-size:40px;line-height:1.1;color:#fff;padding-left:28px;border-left:8px solid ${PALETTE.gold}}
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
.cap{position:absolute;left:${rules.safeZone.left}px;width:${rules.safeZone.right - rules.safeZone.left}px;text-align:center;font-weight:850;font-size:66px;line-height:1.12;color:#fff;-webkit-text-stroke:10px ${PALETTE.ink};paint-order:stroke fill;text-shadow:0 6px 18px rgba(0,0,0,.55);transform:translateY(-50%)}
.cw-e{color:${PALETTE.amber}}
</style></head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${r3(duration)}" data-width="${W}" data-height="${H}" data-fps="${fps}">
<div id="bg"></div>
<div id="arollClip"><div id="arollWrap" data-layout-allow-overflow><video id="av" class="clip" data-start="0" data-duration="${r3(plan.arollDuration ?? duration)}" muted playsinline src="assets/aroll.mp4"></video></div></div>
${scenes.join("\n")}
${media.join("\n")}
<div id="captions">${cap.html}</div>
</div>
<script>
const tl = gsap.timeline({ paused: true });
tl.to('#bg',{x:92,y:-184,duration:${r3(duration)},ease:'none'},0);
${arollTimeline(plan.beats, rules)}
${js.join("\n")}
${cap.js}
tl.set({}, {}, ${r3(duration)});
window.__timelines = window.__timelines || {};
window.__timelines.main = tl;
</script>
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
