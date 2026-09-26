// Real-media depth: the 2.5D layer scene, the photo collage, the annotation primitives
// and the textured timeline (docs/REEL_MEDIA_ARCHITECTURE.md, prototype 2026-09-25).
//
// The premium references are real imagery with graphics ON it, not graphics instead of
// it. This module composites real photographs (a matted subject, a separate photographic
// background, prints) in CSS 3D inside HyperFrames:
//   - every layer sits at a depth (translateZ) under one perspective, and a camera
//     (#<id>-cam) moves through them, so parallax is real, not a scale-up
//   - layers are placed in SCREEN terms (sx, sy, sw, bottom) and the depth math sizes them,
//     so an author thinks about the frame, not about projection
//   - annotations are hand-drawn strokes (deterministic wobble, drawn on by dash offset),
//     labels, pins, counters and timeline markers: in screen space, or inside a layer so
//     they ride its parallax
// Pure functions: (beat, ctx) -> { html, js, boxes }. Nothing here reads the disk.

const INK = "#0D0D0D", GOLD = "#D4AF37", AMBER = "#E8A33D", BURNT = "#C2571A", PAPER = "#F4F1EA";
const W = 1080, H = 1920;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r3 = (n) => Math.round(n * 1000) / 1000;
const r1 = (n) => Math.round(n * 10) / 10;

// ------------------------------------------------------------------ hand-drawn strokes

/** Deterministic PRNG (mulberry32): the same stroke on every render. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A polyline as an SVG path, and its exact length (for the draw-on dash). */
export function polyPath(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return { d: `M${pts.map((p) => `${r1(p[0])} ${r1(p[1])}`).join(" L")}`, len: Math.ceil(len) };
}

/** A marker underline: a slightly wavering stroke that rises a hair and hooks at the end. */
export function underlinePts(x, y, w, seed = 1) {
  const R = rng(seed), n = 28, ph = R() * 6.28, amp = 2 + R() * 3;
  const pts = [];
  for (let i = 0; i <= n; i++) { const u = i / n; pts.push([x + u * w, y - u * (4 + R() * 2) + Math.sin(ph + u * 7) * amp]); }
  const [ex, ey] = pts[pts.length - 1];
  pts.push([ex - 14, ey + 7]);
  return pts;
}

/** A hand-drawn loop around a thing: an ellipse with a wobbling radius that overshoots
 * its start, the way a marker circle does. */
export function circlePts(cx, cy, rx, ry, seed = 1) {
  const R = rng(seed), n = 72, a0 = -2.2 + R() * 0.6, turn = Math.PI * 2 * (1.1 + R() * 0.06);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = a0 + u * turn, j = 1 + 0.035 * Math.sin(u * 9 + R()) + (u - 0.5) * 0.05;
    pts.push([cx + Math.cos(a) * rx * j, cy + Math.sin(a) * ry * j]);
  }
  return pts;
}

/** A curved arrow shaft (quadratic, bent sideways by `bend`) and its two head strokes. */
export function arrowPts(from, to, bend = 0.2, seed = 1) {
  const R = rng(seed);
  const [x0, y0] = from, [x1, y1] = to;
  const mx = (x0 + x1) / 2 - (y1 - y0) * bend, my = (y0 + y1) / 2 + (x1 - x0) * bend;
  const shaft = [];
  for (let i = 0; i <= 30; i++) { const u = i / 30, a = (1 - u) * (1 - u), b2 = 2 * (1 - u) * u, c = u * u; shaft.push([a * x0 + b2 * mx + c * x1 + (R() - 0.5) * 1.5, a * y0 + b2 * my + c * y1 + (R() - 0.5) * 1.5]); }
  const [px, py] = shaft[shaft.length - 4];
  const ang = Math.atan2(y1 - py, x1 - px), hl = 34;
  const head = [[x1 - Math.cos(ang - 0.5) * hl, y1 - Math.sin(ang - 0.5) * hl], [x1, y1], [x1 - Math.cos(ang + 0.5) * hl, y1 - Math.sin(ang + 0.5) * hl]];
  return { shaft, head };
}

/** A bracket under a span ("about a month"): down, across, down. */
export function bracketPts(x, y, w, h = 22, seed = 1) {
  const R = rng(seed), j = () => (R() - 0.5) * 2;
  return [[x, y], [x + j(), y + h], [x + w / 2, y + h + j()], [x + w + j(), y + h], [x + w, y]];
}

// ------------------------------------------------------------------ annotations

const ROUGH = (id) => `<filter id="${id}" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3.2"/></filter>`;

/**
 * Render annotation primitives into one SVG layer + HTML elements, in the coordinate box
 * given (the frame, or a layer's own box). Types: underline, circle, arrow, bracket,
 * highlight, label, pin, counter, marker. Each lands at `at` and leaves at `out` (optional).
 */
export function annotate(list = [], pre, box = { w: W, h: H }, t0 = 0) {
  const svg = [], html = [], js = [], boxes = [];
  // Hidden until its own moment, whatever frame a render worker starts on: a tween with
  // immediateRender:false does not apply its FROM state before it starts (the first
  // storyboard showed every promise marker before the line reached it).
  const hide = (sel, vars) => js.push(`tl.set('${sel}',${JSON.stringify(vars)},${r3(t0)});`);
  const draw = (pid, len, at, dur, ease = "power2.inOut") => js.push(`tl.fromTo('#${pid}',{strokeDashoffset:${len}},{strokeDashoffset:0,duration:${r3(dur)},ease:'${ease}',immediateRender:false},${r3(at)});`);
  const leave = (sel, a) => { if (a.out != null) js.push(`tl.to('${sel}',{opacity:0,duration:0.25,immediateRender:false},${r3(a.out)});`); };
  const stroke = (pid, p, a, color, width) => `<path id="${pid}" d="${p.d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${p.len}" stroke-dashoffset="${p.len}" filter="url(#${pre}-rough)"${a.opacity ? ` opacity="${a.opacity}"` : ""}/>`;
  list.forEach((a, i) => {
    const id = `${pre}-a${i}`, color = a.color || GOLD, width = a.width || 9, at = a.at ?? 0, dur = a.dur ?? 0.45;
    switch (a.type) {
      case "underline": case "circle": case "bracket": {
        const pts = a.type === "underline" ? underlinePts(a.x, a.y, a.w, a.seed ?? i + 1) : a.type === "circle" ? circlePts(a.x, a.y, a.rx, a.ry ?? a.rx, a.seed ?? i + 1) : bracketPts(a.x, a.y, a.w, a.h ?? 22, a.seed ?? i + 1);
        const p = polyPath(pts);
        svg.push(stroke(id, p, a, color, width));
        draw(id, p.len, at, dur);
        leave(`#${id}`, a);
        break;
      }
      case "arrow": {
        const { shaft, head } = arrowPts(a.from, a.to, a.bend ?? 0.18, a.seed ?? i + 1);
        const s = polyPath(shaft), h = polyPath(head);
        svg.push(`<g id="${id}">${stroke(`${id}-s`, s, a, color, width)}${stroke(`${id}-h`, h, a, color, width)}</g>`);
        draw(`${id}-s`, s.len, at, dur * 0.8);
        draw(`${id}-h`, h.len, at + dur * 0.75, 0.18, "power2.out");
        leave(`#${id}`, a);
        break;
      }
      case "highlight": {
        // A marker swipe BEHIND text: a translucent gold bar that wipes on left to right.
        svg.push(`<rect id="${id}" x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" rx="6" fill="${color}" opacity="${a.opacity ?? 0.42}" filter="url(#${pre}-rough)"/>`);
        hide(`#${id}`, { scaleX: 0, transformOrigin: "0% 50%" });
        js.push(`tl.fromTo('#${id}',{scaleX:0},{scaleX:1,transformOrigin:'0% 50%',duration:${r3(dur)},ease:'power2.out',immediateRender:false},${r3(at)});`);
        leave(`#${id}`, a);
        break;
      }
      case "label": {
        const style = a.style || "tag";
        html.push(`<div class="ann-label ann-${style}" id="${id}" style="left:${a.x}px;top:${a.y}px;${a.size ? `font-size:${a.size}px;` : ""}${a.align === "center" ? "transform:translateX(-50%);text-align:center;" : a.align === "right" ? "transform:translateX(-100%);text-align:right;" : ""}${a.rot ? `rotate:${a.rot}deg;` : ""}${a.color ? `color:${a.color};` : ""}">${esc(a.text).replace(/\n/g, "<br>")}</div>`);
        js.push(`tl.fromTo('#${id}',{opacity:0,y:${a.rise ?? 16},scale:${a.pop ? 0.7 : 0.96}},{opacity:1,y:0,scale:1,duration:${a.pop ? 0.34 : 0.3},ease:'${a.pop ? "back.out(2.2)" : "power3.out"}',immediateRender:false},${r3(at)});`);
        leave(`#${id}`, a);
        if (a.box !== false && box.w === W) boxes.push({ what: `label "${a.text}"`, x: a.align === "center" ? a.x - (a.w ?? 400) / 2 : a.align === "right" ? a.x - (a.w ?? 400) : a.x, y: a.y, w: a.w ?? 400, h: (a.size ?? 38) * 1.5 * String(a.text).split("\n").length });
        break;
      }
      case "pin": {
        // A dot on the thing, a leader line, a label: the reference style for naming a
        // detail in a photograph.
        const p = polyPath([[a.x, a.y], [a.lx, a.ly]]);
        svg.push(`<circle id="${id}-d" cx="${a.x}" cy="${a.y}" r="${a.r ?? 11}" fill="${color}"/>`);
        hide(`#${id}-d`, { scale: 0, transformOrigin: "50% 50%" });
        svg.push(`<path id="${id}-l" d="${p.d}" stroke="${color}" stroke-width="4" fill="none" stroke-dasharray="${p.len}" stroke-dashoffset="${p.len}"/>`);
        html.push(`<div class="ann-label ann-${a.style || "tag"}" id="${id}" style="left:${a.lx + (a.lx >= a.x ? 10 : -10)}px;top:${a.ly - 28}px;${a.lx < a.x ? "transform:translateX(-100%);" : ""}${a.size ? `font-size:${a.size}px;` : ""}">${esc(a.text).replace(/\n/g, "<br>")}</div>`);
        js.push(`tl.fromTo('#${id}-d',{scale:0},{scale:1,transformOrigin:'50% 50%',duration:0.25,ease:'back.out(3)',immediateRender:false},${r3(at)});`);
        draw(`${id}-l`, p.len, at + 0.1, 0.25, "power2.out");
        js.push(`tl.fromTo('#${id}',{opacity:0},{opacity:1,duration:0.25,immediateRender:false},${r3(at + 0.3)});`);
        leave(`#${id},#${id}-d,#${id}-l`, a);
        break;
      }
      case "counter": {
        // A number that counts on its spoken word. Seek-safe: the tween writes the text on
        // every render, forward or backward.
        const fmt = a.comma ? "toLocaleString('en-US')" : "toString()";
        html.push(`<div class="ann-counter ${a.cls || ""}" id="${id}" style="left:${a.x}px;top:${a.y}px;${a.size ? `font-size:${a.size}px;` : ""}${a.align === "center" ? "transform:translateX(-50%);" : ""}"><span id="${id}-n">${esc(`${a.prefix || ""}${a.from ?? 0}${a.suffix || ""}`)}</span>${a.unit ? `<div class="ann-unit">${esc(a.unit)}</div>` : ""}</div>`);
        js.push(`(()=>{const o={v:${a.from ?? 0}};const el=document.getElementById('${id}-n');tl.fromTo(o,{v:${a.from ?? 0}},{v:${a.to},duration:${r3(a.dur ?? 0.8)},ease:'power2.out',immediateRender:false,onUpdate:()=>{el.textContent=${JSON.stringify(a.prefix || "")}+Math.round(o.v).${fmt}+${JSON.stringify(a.suffix || "")};}},${r3(at)});})();`);
        js.push(`tl.fromTo('#${id}',{opacity:0,scale:0.85},{opacity:1,scale:1,duration:0.3,ease:'back.out(2)',immediateRender:false},${r3(at - 0.05)});`);
        leave(`#${id}`, a);
        if (box.w === W) boxes.push({ what: `counter ${a.to}`, x: a.x, y: a.y, w: a.w ?? 420, h: (a.size ?? 150) * 1.1 + (a.unit ? 60 : 0) });
        break;
      }
      case "marker": {
        // A timeline marker: a promise tile that pops in outlined, then fills gold.
        const s = a.size ?? 30;
        svg.push(`<rect id="${id}" x="${a.x - s / 2}" y="${a.y - s / 2}" width="${s}" height="${s}" rx="5" fill="${INK}" stroke="${color}" stroke-width="5"/>`);
        hide(`#${id}`, { scale: 0, transformOrigin: "50% 50%", attr: { fill: INK } });
        js.push(`tl.fromTo('#${id}',{scale:0},{scale:1,transformOrigin:'50% 50%',duration:0.22,ease:'back.out(3)',immediateRender:false},${r3(at)});`);
        if (a.fill !== false) js.push(`tl.to('#${id}',{attr:{fill:'${color}'},duration:0.12,immediateRender:false},${r3(at + (a.fillDelay ?? 0.25))});`);
        break;
      }
      default: throw new Error(`unknown annotation type "${a.type}"`);
    }
  });
  const svgDoc = svg.length ? `<svg class="ann-svg" viewBox="0 0 ${box.w} ${box.h}" width="${box.w}" height="${box.h}" data-layout-allow-overflow><defs>${ROUGH(`${pre}-rough`)}</defs>${svg.join("")}</svg>` : "";
  return { svg: svgDoc, html: html.join(""), js: js.join("\n"), boxes };
}

// ------------------------------------------------------------------ the depth scene

/** Apparent scale of a layer at depth z under perspective P (camera at rest). */
export const depthScale = (z, P) => P / (P - z);

/**
 * Where a layer goes, in its own plane, from screen terms: sx/sy = the screen point its
 * centre sits on at rest, sw/sh = its apparent size, bottom = the screen y its bottom
 * edge sits on, cover = fill the frame at that depth with a margin for the camera.
 */
export function placeLayer(L, P) {
  const k = depthScale(L.z || 0, P);
  let w = L.w, h = L.h;
  if (L.cover) {
    const m = L.cover === true ? 1.3 : L.cover;
    w = Math.ceil(((L.coverW ?? W) / k) * m);
    h = Math.ceil(((L.coverH ?? H) / k) * m);
  }
  if (L.sw) { const aspect = h && w ? h / w : L.aspect ?? 1; w = Math.ceil(L.sw / k); h = L.sh ? Math.ceil(L.sh / k) : Math.ceil(w * aspect); }
  if (!w || !h) throw new Error(`layer ${L.id}: give w/h, sw (+ aspect), or cover`);
  let cx = L.x ?? ((L.sx ?? W / 2) - W / 2) / k;
  let cy = L.y ?? ((L.sy ?? H / 2) - H / 2) / k;
  if (L.bottom != null) cy = (L.bottom - H / 2) / k - h / 2;
  return { w, h, left: r1(cx - w / 2), top: r1(cy - h / 2), k };
}

const NEUTRAL = { opacity: 1, scale: 1, x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, filter: "blur(0px)" };

/**
 * The 2.5D layer scene. props: { perspective, layers:[...], camera:[{t,x,y,z,rx,ry,rz,ease}],
 * annotations:[...], grain, vignette, grade }. A layer: { id, z, asset|text|fill|html,
 * placement (see placeLayer), fit, pos, filter, shadow, mask, rx, ry, rz, frame:"print",
 * cls, size, in:{at,from,dur,ease}, out:{at,to,dur}, tweens:[{at,to,dur,ease,from}], ann:[...] }
 */
export function layerScene(b, ctx) {
  const p = b.graphic.props;
  const id = `d${b.id}`;
  const P = p.perspective ?? 1400;
  const html = [], js = [], boxes = [];
  const seen = new Set();
  for (const L of p.layers || []) {
    if (!L.id || seen.has(L.id)) throw new Error(`beat ${b.id}: every layer needs a unique id (${L.id})`);
    seen.add(L.id);
    const lid = `${id}-${L.id}`;
    const pl = placeLayer(L, P);
    const tf = `translate3d(0px,0px,${L.z || 0}px)${L.rx ? ` rotateX(${L.rx}deg)` : ""}${L.ry ? ` rotateY(${L.ry}deg)` : ""}${L.rz ? ` rotateZ(${L.rz}deg)` : ""}`;
    let inner;
    if (L.asset) {
      const a = ctx.assetFiles[L.asset];
      if (!a) throw new Error(`beat ${b.id} layer ${L.id}: asset "${L.asset}" was not staged`);
      inner = `<img src="${esc(a.rel)}" alt="" decoding="sync" loading="eager" style="width:100%;height:100%;object-fit:${L.fit || "cover"};object-position:${L.pos || "50% 50%"}">`;
    } else if (L.text != null) inner = `<div class="d25-text ${L.cls || ""}" style="${L.size ? `font-size:${L.size}px;` : ""}${L.color ? `color:${L.color};` : ""}">${esc(L.text).replace(/\n/g, "<br>")}</div>`;
    else if (L.fill) inner = `<div style="width:100%;height:100%;background:${L.fill}"></div>`;
    else inner = L.html || "";
    // A soft cast shadow only: a tight 0 0 2px contact shadow drew a dark outline around the
    // whole matte at 100% (prototype review, 2026-09-25), the sticker edge that reads as pasted.
    const filt = [L.filter, L.shadow ? "drop-shadow(0 34px 44px rgba(0,0,0,.66))" : null].filter(Boolean).join(" ");
    const mask = L.mask ? `-webkit-mask-image:${L.mask};mask-image:${L.mask};` : "";
    const ann = L.ann?.length ? annotate(L.ann, lid, { w: pl.w, h: pl.h }, b.start) : null;
    if (ann) js.push(ann.js);
    html.push(`<div class="d25-l" id="${lid}" style="width:${pl.w}px;height:${pl.h}px;margin-left:${pl.left}px;margin-top:${pl.top}px;transform:${tf}${L.opacity != null ? `;opacity:${L.opacity}` : ""}${L.blend ? `;mix-blend-mode:${L.blend}` : ""}" data-layout-allow-overflow data-layout-allow-occlusion><div class="d25-in${L.frame === "print" ? " d25-print" : ""}" id="${lid}-in" style="${filt ? `filter:${filt};` : ""}${mask}">${inner}${ann ? ann.svg + ann.html : ""}</div></div>`);
    if (L.in) {
      const from = L.in.from || { opacity: 0 };
      const to = Object.fromEntries(Object.keys(from).map((k) => [k, NEUTRAL[k] ?? 0]));
      // Hidden until its entrance, whatever frame a render worker starts on. The hide is
      // added BEFORE the entrance: when both sit at the same instant (an entrance at the
      // scene start) and a seek jumps past them, GSAP renders them in insertion order, and
      // a hide added after the entrance left Smino invisible for the whole hook whenever
      // capture began mid-scene (prototype, 2026-09-25; sequential seeks masked it).
      if ("opacity" in from) js.push(`tl.set('#${lid}-in',{opacity:${from.opacity}},${r3(b.start)});`);
      js.push(`tl.fromTo('#${lid}-in',${JSON.stringify(from)},${JSON.stringify({ ...to, ...(L.in.to || {}), duration: L.in.dur ?? 0.5, ease: L.in.ease || "power3.out", immediateRender: false })},${r3(L.in.at ?? b.start)});`);
    }
    for (const tw of L.tweens || []) js.push(tw.from ? `tl.fromTo('#${lid}-in',${JSON.stringify(tw.from)},${JSON.stringify({ ...tw.to, duration: tw.dur ?? 0.5, ease: tw.ease || "power2.inOut", immediateRender: false })},${r3(tw.at)});` : `tl.to('#${lid}-in',${JSON.stringify({ ...tw.to, duration: tw.dur ?? 0.5, ease: tw.ease || "power2.inOut", immediateRender: false })},${r3(tw.at)});`);
    if (L.out) js.push(`tl.to('#${lid}-in',${JSON.stringify({ opacity: 0, ...(L.out.to || {}), duration: L.out.dur ?? 0.3, ease: L.out.ease || "power2.in", immediateRender: false })},${r3(L.out.at)});`);
  }
  // The camera: keyed moves through the layers. The first key is where it rests at the
  // beat start; each next key is a move from the previous one.
  const cam = [...(p.camera || [{ t: b.start }])].sort((a, c) => a.t - c.t);
  const cv = (k) => ({ x: k.x ?? 0, y: k.y ?? 0, z: k.z ?? 0, rotationX: k.rx ?? 0, rotationY: k.ry ?? 0, rotation: k.rz ?? 0 });
  js.push(`tl.set('#${id}-cam',${JSON.stringify(cv(cam[0]))},${r3(b.start)});`);
  for (let i = 1; i < cam.length; i++) {
    const a = cam[i - 1], c = cam[i];
    if (c.t <= a.t) throw new Error(`beat ${b.id}: camera keys must increase in time (${a.t} then ${c.t})`);
    js.push(`tl.fromTo('#${id}-cam',${JSON.stringify(cv(a))},${JSON.stringify({ ...cv(c), duration: r3(c.t - a.t), ease: c.ease || "power1.inOut", immediateRender: false })},${r3(a.t)});`);
  }
  const top = annotate(p.annotations || [], id, { w: W, h: H }, b.start);
  js.push(top.js);
  boxes.push(...top.boxes);
  const d = Math.max(0.1, b.end - b.start);
  if (p.grain !== false) js.push(`tl.fromTo('#${id}-gr',{x:0,y:0},{x:-37,y:23,duration:${r3(d)},ease:'steps(${Math.max(2, Math.round(d * 12))})',immediateRender:false},${r3(b.start)});`);
  const out = `<div class="d25" id="${id}" style="perspective:${P}px;perspective-origin:50% ${p.originY ?? 50}%" data-layout-allow-occlusion data-layout-allow-overflow>
<div class="d25-cam" id="${id}-cam">${html.join("\n")}</div>
${p.grade ? `<div class="d25-grade" style="background:${p.grade}"></div>` : ""}${p.vignette !== false ? `<div class="d25-vig"></div>` : ""}${p.grain !== false ? `<div class="d25-grain" id="${id}-gr"></div>` : ""}
${top.svg}${top.html}
</div>`;
  return { html: out, js: js.join("\n"), boxes };
}

/**
 * The editorial collage: real photo PRINTS over a photographic ground, ONE dominant item.
 * props: { bg:{asset,filter}, items:[{asset, sx, sy, sw, aspect, z, rot, at, dominant, fit, pos}],
 * camera, annotations, credit }. Sugar over layerScene, so it moves in depth the same way.
 */
export function collageScene(b, ctx) {
  const p = b.graphic.props;
  const dom = (p.items || []).filter((x) => x.dominant);
  if (dom.length !== 1) throw new Error(`beat ${b.id}: a collage needs exactly ONE dominant item (hierarchy), found ${dom.length}`);
  const layers = [];
  if (p.bg) layers.push({ id: "bg", asset: p.bg.asset, z: p.bg.z ?? -900, cover: p.bg.cover ?? 1.35, filter: p.bg.filter ?? "blur(8px) brightness(.4) saturate(1.1)" });
  if (p.glow !== false) layers.push({ id: "glow", z: -500, sw: 1500, sh: 1500, sy: p.glowY ?? 820, fill: `radial-gradient(circle,rgba(232,163,61,.30),rgba(0,0,0,0) 62%)` });
  (p.items || []).forEach((it, i) => {
    const z = it.z ?? (it.dominant ? 0 : -140 - i * 40);
    layers.push({
      id: it.id || `i${i}`, asset: it.asset, z, sx: it.sx, sy: it.sy, sw: it.sw, aspect: it.aspect ?? 1, fit: it.fit || "cover", pos: it.pos,
      frame: it.frame === false ? undefined : "print", rz: it.rot ?? 0, shadow: true,
      filter: it.dominant ? it.filter : it.filter ?? "brightness(.82) saturate(.9)",
      in: { at: it.at ?? b.start, from: it.from || { opacity: 0, y: 160, rotation: (it.rot ?? 0) > 0 ? 9 : -9, scale: 1.08 }, dur: it.dur ?? 0.55, ease: "power4.out" },
      tweens: it.tweens, ann: it.ann,
    });
  });
  const annotations = [...(p.annotations || [])];
  if (p.credit) annotations.push({ type: "label", style: "credit", x: 90, y: p.creditY ?? 1560, text: p.credit, at: b.start + 0.4, box: false });
  return layerScene({ ...b, graphic: { ...b.graphic, props: { ...p, layers: [...layers, ...(p.extraLayers || [])], annotations } } }, ctx);
}

/**
 * The textured timeline: a photographic ground (a real planner) in depth, one track
 * layer carrying a SHORT launch spike and a LONG delivery line with promise markers, and
 * a camera that travels along it. props: { bg:{asset,filter}, launch:{at, label, sub, subAt},
 * delivery:{at, label, restAt, rest}, startAt, markers, trackW, baseY, panFrom }.
 * Understandable muted: the shape says it (a spike that ends, a line that keeps going).
 */
export function timelineScene(b, ctx) {
  const p = b.graphic.props;
  const TW = p.trackW ?? 2600, TH = 900, BY = 640; // track size, baseline y in the track
  const SPK = 300, SPW = 190; // spike start x and width in the track
  const P = p.perspective ?? 1400;
  const d0 = p.delivery.at, dEnd = Math.max(d0 + 1.2, (p.delivery.drawEnd ?? b.end) - 0.1);
  const endX = TW - 140;
  const lineFrom = SPK + SPW;
  const markers = p.markers ?? 14;
  const mx = Array.from({ length: markers }, (_, i) => lineFrom + 110 + i * ((endX - 260 - lineFrom - 110) / Math.max(1, markers - 1)));
  // The delivery line draws at the camera's pace, so markers land as they come into view.
  const tAt = (x) => d0 + ((x - lineFrom) / (endX - lineFrom)) * (dEnd - d0);
  const ann = [
    { type: "underline", x: 60, y: BY, w: SPK - 60, at: p.startAt ?? b.start + 0.1, dur: 0.6, color: "rgba(255,255,255,.75)", width: 8, seed: 3 },
    { type: "bracket", x: SPK - 6, y: BY + 34, w: SPW + 12, h: 26, at: p.launch.subAt ?? p.launch.at + 0.6, dur: 0.35, color: AMBER, width: 6, seed: 5 },
    ...mx.map((x) => ({ type: "marker", x, y: BY, at: tAt(x), size: 40 })),
  ];
  const spike = polyPath([[SPK, BY], [SPK + SPW * 0.42, BY - 470], [SPK + SPW * 0.5, BY - 484], [SPK + SPW * 0.58, BY - 458], [SPK + SPW, BY]]);
  const line = polyPath(underlinePts(lineFrom, BY, endX - lineFrom, 9).slice(0, -1).map(([x, y]) => [x, BY + (y - BY) * 0.35]));
  const arrow = arrowPts([endX - 30, BY], [endX + 90, BY], 0, 2);
  const arrowHead = polyPath(arrow.head);
  const svg = `<svg class="ann-svg" viewBox="0 0 ${TW} ${TH}" width="${TW}" height="${TH}" data-layout-allow-overflow><defs>${ROUGH(`d${b.id}-tr-rough`)}<linearGradient id="d${b.id}-fade" x1="0" x2="1"><stop offset="0" stop-color="${GOLD}"/><stop offset="1" stop-color="${AMBER}"/></linearGradient></defs>
<path id="d${b.id}-spk" d="${spike.d}" fill="none" stroke="${AMBER}" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${spike.len}" stroke-dashoffset="${spike.len}" filter="url(#d${b.id}-tr-rough)"/>
<path id="d${b.id}-ln" d="${line.d}" fill="none" stroke="url(#d${b.id}-fade)" stroke-width="20" stroke-linecap="round" stroke-dasharray="${line.len}" stroke-dashoffset="${line.len}" filter="url(#d${b.id}-tr-rough)"/>
<path id="d${b.id}-ah" d="${arrowHead.d}" fill="none" stroke="${AMBER}" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${arrowHead.len}" stroke-dashoffset="${arrowHead.len}" filter="url(#d${b.id}-tr-rough)"/>
</svg>`;
  const labels = [
    { type: "label", style: "tag", x: SPK + SPW / 2, y: BY - 570, align: "center", text: p.launch.label, at: p.launch.at, pop: true, size: 46 },
    { type: "label", style: "marker", x: SPK + SPW / 2, y: BY + 78, align: "center", text: p.launch.sub, at: p.launch.subAt ?? p.launch.at + 0.6, color: AMBER, size: 62 },
    { type: "label", style: "big", x: lineFrom + 20, y: BY - 190, text: p.delivery.label, at: d0, pop: true, size: 96 },
    { type: "label", style: "big", x: endX - 20, y: BY - 300, align: "right", text: p.delivery.rest, at: p.delivery.restAt, size: 80, color: "#FFFFFF" },
  ];
  const trackAnn = [...ann, ...labels];
  // Camera: rest on the spike, then travel the line to its end at the pace it draws.
  const restX = SPK + SPW / 2;
  const pan = endX - 280 - restX;
  const camera = p.camera || [
    { t: b.start, x: 60, z: -60, ry: -2 },
    { t: p.launch.at + 0.35, x: 0, z: 40, ry: 0, ease: "power2.out" },
    // On "DELIVERY" the camera turns onto the line so the word lands whole in frame.
    { t: d0, x: -60, z: 25, ry: 0.5, ease: "power1.inOut" },
    { t: d0 + 0.45, x: -330, z: 40, ry: 1, ease: "power2.out" },
    { t: dEnd, x: -pan, z: 90, ry: 3, ease: "power1.inOut" },
    ...(b.end > dEnd + 0.05 ? [{ t: b.end, x: -pan - 30, z: 110, ry: 3, ease: "none" }] : []),
  ];
  const kBg = depthScale(p.bg?.z ?? -800, P);
  const layers = [
    { id: "bg", asset: p.bg.asset, z: p.bg.z ?? -800, cover: p.bg.cover ?? 1.25, pos: p.bg.pos, y: p.bg.y, coverW: W + pan * kBg + 260, x: (pan * 0.5), filter: p.bg.filter ?? "blur(2px) brightness(.5) sepia(.6) saturate(1.35) contrast(1.15)" },
    { id: "glow", z: -420, sw: 1700, sh: 1300, sy: 880, fill: "radial-gradient(ellipse,rgba(232,163,61,.26),rgba(0,0,0,0) 60%)" },
    { id: "track", z: 0, w: TW, h: TH, x: TW / 2 - restX, y: (p.baseY ?? 900) - H / 2 - (BY - TH / 2), html: svg, ann: trackAnn },
  ];
  const r = layerScene({ ...b, graphic: { ...b.graphic, props: { perspective: P, layers, camera, annotations: p.annotations || [] } } }, ctx);
  const js = [
    r.js,
    `tl.fromTo('#d${b.id}-spk',{strokeDashoffset:${spike.len}},{strokeDashoffset:0,duration:0.5,ease:'power3.out',immediateRender:false},${r3(p.launch.at)});`,
    `tl.fromTo('#d${b.id}-ln',{strokeDashoffset:${line.len}},{strokeDashoffset:0,duration:${r3(dEnd - d0)},ease:'none',immediateRender:false},${r3(d0)});`,
    `tl.fromTo('#d${b.id}-ah',{strokeDashoffset:${arrowHead.len}},{strokeDashoffset:0,duration:0.2,ease:'power2.out',immediateRender:false},${r3(dEnd)});`,
  ].join("\n");
  return { ...r, js };
}

/** The styles the depth scene, the annotations and the timeline need. */
export const DEPTH_CSS = `
.d25{position:absolute;inset:0;overflow:hidden;background:${INK}}
.d25-cam{position:absolute;inset:0;transform-style:preserve-3d;transform-origin:540px 960px}
.d25-l{position:absolute;left:50%;top:50%;transform-style:preserve-3d}
.d25-in{position:absolute;inset:0;transform-style:preserve-3d}
.d25-print{background:${PAPER};padding:16px;box-shadow:0 40px 70px rgba(0,0,0,.7),0 10px 18px rgba(0,0,0,.5)}
.d25-print img{display:block}
.d25-text{white-space:nowrap;font-weight:900;line-height:.9;letter-spacing:-.04em;color:${GOLD}}
.d25-name{font-size:330px;text-align:center;width:100%}
.d25-grade{position:absolute;inset:0;mix-blend-mode:soft-light;pointer-events:none}
.d25-vig{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 42%,rgba(0,0,0,0) 48%,rgba(0,0,0,.62) 100%),linear-gradient(rgba(0,0,0,.35),rgba(0,0,0,0) 18%,rgba(0,0,0,0) 72%,rgba(0,0,0,.55));pointer-events:none}
.d25-grain{position:absolute;inset:-60px;opacity:.13;mix-blend-mode:overlay;pointer-events:none;background:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")}
.ann-svg{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
.ann-label{position:absolute;white-space:nowrap;opacity:0}
.ann-tag{font-weight:900;font-size:38px;letter-spacing:.04em;color:${INK};background:${GOLD};padding:9px 22px;border-radius:14px;box-shadow:0 12px 34px rgba(0,0,0,.5)}
.ann-dark{font-weight:900;font-size:36px;letter-spacing:.03em;color:#fff;background:rgba(13,13,13,.8);border:3px solid ${GOLD};padding:8px 20px;border-radius:14px}
.ann-marker{font-family:Marker;font-size:56px;line-height:1.02;color:#fff;text-shadow:0 4px 22px rgba(0,0,0,.85)}
.ann-big{font-weight:900;font-size:120px;letter-spacing:-.02em;line-height:.95;color:${GOLD};text-shadow:0 10px 40px rgba(0,0,0,.7)}
.ann-credit{font-weight:600;font-size:20px;color:rgba(255,255,255,.62);letter-spacing:.02em}
.ann-counter{position:absolute;white-space:nowrap;font-weight:900;font-size:150px;line-height:.95;letter-spacing:-.03em;color:#fff;text-shadow:0 10px 44px rgba(0,0,0,.8);opacity:0}
.ann-unit{display:inline-block;font-size:42px;letter-spacing:.14em;font-weight:900;color:${GOLD};margin-top:8px;padding:4px 16px;border-radius:10px;background:rgba(13,13,13,.78);text-shadow:none}
.ann-value{color:${GOLD}}
`;
