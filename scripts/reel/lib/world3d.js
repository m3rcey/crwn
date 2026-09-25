// A deterministic 3D world for Fan Economy reels (browser module, loaded by the
// composition). Everything on screen is a PURE FUNCTION OF TIME: HyperFrames dispatches
// `hf-seek` with the composition time for every captured frame, and render(t) rebuilds the
// whole scene state from the spec. Nothing is simulated, nothing accumulates, so any frame
// can be rendered in any order by any worker.
//
// The engine knows primitives; a reel's authored plan supplies the spec (plan.world):
//   camera  keyframes {t, pos, look, fov, ease, cut}
//   windows [[a, b], ...] when the world owns the frame
//   objects {id, type, ..., keys: {prop: [{t, v, ease}]}}
//     fans   a formation of fan figures (arrive / leave / dim / lift)
//     rail   a timeline into depth with month ticks (length in months, animatable)
//     spike  a launch pillar (h 0..1)
//     tiles  a promise tile per month on a rail (shown / checked / missed)
//     stacks a coin stack per month on a rail ($ per stack, count animatable)
//     card   a drawn card (tier / note / app / sleeve / ticket / tee / play / calendar / label)
//     photo  a real photograph (a cut-out or a plate) standing in the world, never distorted
//     bracket a gold bracket between two points (grow 0..1)
//     figure a stylised 3D character built from reference photos (never the photos): hair,
//            headband, outfit, chain, mic; posed by keys (mic, point, nod, bob, turn)
//     stage  a platform, a lettered backdrop screen and sweeping light beams
//   tags    HTML labels pinned to 3D points or objects, crisp at any camera distance
import * as THREE from "./three.module.min.js";

const GOLD = 0xd4af37, AMBER = 0xe8a33d, ORANGE = 0xc2571a, INK = 0x0d0d0d, CHAR = 0x1a1a1a;

// ------------------------------------------------------------------ keyframes

const EASE = {
  linear: (x) => x,
  in: (x) => x * x * x,
  out: (x) => 1 - Math.pow(1 - x, 3),
  inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  soft: (x) => 0.5 - 0.5 * Math.cos(Math.PI * x),
  back: (x) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); },
  hold: () => 0,
};
const lerp = (a, b, k) => (Array.isArray(a) ? a.map((v, i) => v + (b[i] - v) * k) : a + (b - a) * k);

/** Value of a keyframed property at time t (holds before the first and after the last key). */
export function keyAt(keys, t, dflt) {
  if (!keys || !keys.length) return dflt;
  if (t <= keys[0].t) return keys[0].v;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t < b.t) {
      if (b.cut) return a.v;
      const k = (EASE[b.ease || "inOut"] || EASE.inOut)((t - a.t) / Math.max(1e-6, b.t - a.t));
      return lerp(a.v, b.v, k);
    }
  }
  return keys[keys.length - 1].v;
}
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const K = (o, prop, t, d) => keyAt(o.keys?.[prop], t, o[prop] ?? d);

// ------------------------------------------------------------------ drawn textures

function canvasTex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
const FONT = (wt, px) => `${wt} ${px}px Inter, sans-serif`;

// Card faces. Words on a card are declared in the beat's text (the UNSPOKEN check).
const FACES = {
  tier(g, w, h, d) {
    const grd = g.createLinearGradient(0, 0, w, h); grd.addColorStop(0, "#2a2410"); grd.addColorStop(1, "#141414");
    rr(g, 4, 4, w - 8, h - 8, 48); g.fillStyle = grd; g.fill(); g.lineWidth = 8; g.strokeStyle = "#D4AF37"; g.stroke();
    g.fillStyle = "#D4AF37"; g.font = FONT(900, 64); g.fillText(d.title || "", 70, 140);
    g.fillStyle = "#fff"; g.font = FONT(900, 120); g.fillText(d.price || "", 70, 290);
    g.font = FONT(700, 42); g.fillStyle = "rgba(255,255,255,.75)";
    (d.lines || []).forEach((l, i) => { g.fillStyle = "#D4AF37"; g.beginPath(); g.arc(88, 392 + i * 78, 12, 0, 7); g.fill(); g.fillStyle = "rgba(255,255,255,.85)"; g.fillText(l, 120, 406 + i * 78); });
  },
  note(g, w, h, d) {
    g.fillStyle = d.bg || "#F2EBD9"; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(0,0,0,.08)"; g.fillRect(0, 0, w, 26);
    g.fillStyle = "#1A1A1A"; g.font = FONT(800, d.size || 54); wrap(g, d.text || "", 40, 120, w - 80, (d.size || 54) * 1.15);
  },
  app(g, w, h, d) {
    rr(g, 4, 4, w - 8, h - 8, 40); g.fillStyle = "#16181c"; g.fill(); g.lineWidth = 6; g.strokeStyle = "rgba(255,255,255,.25)"; g.stroke();
    g.fillStyle = "rgba(255,255,255,.12)"; rr(g, 30, 30, w - 60, 70, 18); g.fill();
    g.fillStyle = "#fff"; g.font = FONT(800, 44); g.fillText(d.title || "", 60, 80);
    if (d.rows) for (let i = 0; i < d.rows; i++) { g.fillStyle = "rgba(255,255,255,.1)"; rr(g, 30, 140 + i * 110, w - 60, 86, 18); g.fill(); g.fillStyle = d.dot || "#D4AF37"; g.beginPath(); g.arc(80, 183 + i * 110, 24, 0, 7); g.fill(); g.fillStyle = "rgba(255,255,255,.35)"; rr(g, 130, 170 + i * 110, (w - 260) * (0.5 + 0.4 * ((i * 37) % 10) / 10), 24, 12); g.fill(); }
    if (d.icon) icon(g, d.icon, w / 2, h * 0.55, Math.min(w, h) * 0.32);
  },
  sleeve(g, w, h, d) {
    const grd = g.createRadialGradient(w * 0.5, h * 0.42, 40, w * 0.5, h * 0.5, w * 0.75); grd.addColorStop(0, "#3a2a10"); grd.addColorStop(1, "#0d0d0d");
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(212,175,55,.5)"; g.lineWidth = 3; for (let r = 60; r < w; r += 34) { g.beginPath(); g.arc(w / 2, h / 2, r, 0, 7); g.stroke(); }
    g.fillStyle = "#fff"; g.font = FONT(900, 74); g.textAlign = "center"; (d.title || "").split("\n").forEach((l, i) => g.fillText(l, w / 2, h - 190 + i * 84));
    g.fillStyle = "#D4AF37"; g.font = FONT(800, 44); g.fillText(d.sub || "", w / 2, h - 50); g.textAlign = "left";
  },
  ticket(g, w, h) {
    rr(g, 4, 4, w - 8, h - 8, 26); g.fillStyle = "#D4AF37"; g.fill();
    g.fillStyle = "#0d0d0d"; g.beginPath(); g.arc(w * 0.7, 0, 34, 0, 7); g.arc(w * 0.7, h, 34, 0, 7); g.fill();
    g.setLineDash([14, 12]); g.lineWidth = 5; g.strokeStyle = "#0d0d0d"; g.beginPath(); g.moveTo(w * 0.7, 40); g.lineTo(w * 0.7, h - 40); g.stroke(); g.setLineDash([]);
    g.fillStyle = "#0d0d0d"; g.font = FONT(900, 72); g.fillText("TICKET", 60, h / 2 + 26);
  },
  tee(g, w, h) {
    g.fillStyle = "#1f1f1f"; g.beginPath(); g.moveTo(w * .3, h * .08); g.lineTo(w * .7, h * .08); g.lineTo(w * .98, h * .3); g.lineTo(w * .84, h * .44); g.lineTo(w * .76, h * .38); g.lineTo(w * .76, h * .95); g.lineTo(w * .24, h * .95); g.lineTo(w * .24, h * .38); g.lineTo(w * .16, h * .44); g.lineTo(w * .02, h * .3); g.closePath(); g.fill();
    g.lineWidth = 6; g.strokeStyle = "#D4AF37"; g.stroke();
    g.fillStyle = "#D4AF37"; g.font = FONT(900, 70); g.textAlign = "center"; g.fillText("MERCH", w / 2, h * 0.62); g.textAlign = "left";
  },
  play(g, w, h) {
    rr(g, 4, 4, w - 8, h - 8, 60); g.fillStyle = "#222"; g.fill(); g.lineWidth = 6; g.strokeStyle = "rgba(255,255,255,.3)"; g.stroke();
    g.fillStyle = "rgba(255,255,255,.8)"; g.beginPath(); g.moveTo(w * .4, h * .3); g.lineTo(w * .7, h * .5); g.lineTo(w * .4, h * .7); g.closePath(); g.fill();
    g.fillStyle = "rgba(255,255,255,.6)"; g.font = FONT(800, 52); g.textAlign = "center"; g.fillText("STREAM", w / 2, h * 0.9); g.textAlign = "left";
  },
  calendar(g, w, h, d) {
    rr(g, 4, 4, w - 8, h - 8, 36); g.fillStyle = "#151515"; g.fill(); g.lineWidth = 6; g.strokeStyle = "#D4AF37"; g.stroke();
    g.fillStyle = "#D4AF37"; rr(g, 4, 4, w - 8, 130, 36); g.fill(); g.fillRect(4, 80, w - 8, 54);
    g.fillStyle = "#0d0d0d"; g.font = FONT(900, 60); g.fillText(d.title || "", 50, 94);
    const cols = 7, rows = 5, cw = (w - 80) / cols, ch = (h - 200) / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { g.strokeStyle = "rgba(255,255,255,.12)"; g.lineWidth = 3; g.strokeRect(40 + c * cw, 170 + r * ch, cw, ch); }
  },
  label(g, w, h, d) {
    g.fillStyle = "rgba(0,0,0,0)"; g.fillRect(0, 0, w, h);
    g.fillStyle = d.color || "#fff"; g.font = FONT(900, d.size || 120); g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(d.text || "", w / 2, h / 2); g.textAlign = "left"; g.textBaseline = "alphabetic";
  },
};
function wrap(g, text, x, y, maxW, lh) {
  let line = "", yy = y;
  for (const word of text.split(" ")) { const t = line ? line + " " + word : word; if (g.measureText(t).width > maxW && line) { g.fillText(line, x, yy); line = word; yy += lh; } else line = t; }
  if (line) g.fillText(line, x, yy);
}
function icon(g, kind, cx, cy, s) {
  g.save(); g.translate(cx, cy); g.strokeStyle = "#D4AF37"; g.fillStyle = "#D4AF37"; g.lineWidth = s * 0.08; g.lineCap = "round";
  if (kind === "headphones") { g.beginPath(); g.arc(0, 0, s * .45, Math.PI, 0); g.stroke(); rr(g, -s * .55, -s * .02, s * .22, s * .38, s * .06); g.fill(); rr(g, s * .33, -s * .02, s * .22, s * .38, s * .06); g.fill(); }
  else if (kind === "camera") { rr(g, -s * .5, -s * .3, s * .72, s * .6, s * .08); g.fill(); g.beginPath(); g.moveTo(s * .22, -s * .1); g.lineTo(s * .5, -s * .28); g.lineTo(s * .5, s * .28); g.lineTo(s * .22, s * .1); g.fill(); }
  else if (kind === "check") { g.beginPath(); g.moveTo(-s * .4, 0); g.lineTo(-s * .1, s * .3); g.lineTo(s * .45, -s * .35); g.stroke(); }
  else if (kind === "people") { for (const x of [-s * .3, 0, s * .3]) { g.beginPath(); g.arc(x, -s * .12, s * .12, 0, 7); g.fill(); rr(g, x - s * .13, s * .04, s * .26, s * .3, s * .1); g.fill(); } }
  else if (kind === "gift") { g.fillRect(-s * .4, -s * .1, s * .8, s * .5); g.fillRect(-s * .45, -s * .25, s * .9, s * .16); g.clearRect(-s * .04, -s * .25, s * .08, s * .65); }
  else if (kind === "question") { g.font = FONT(900, s); g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("?", 0, 0); }
  g.restore();
}

// ------------------------------------------------------------------ the world

export function createWorld(canvas, spec, overlay) {
  const W = canvas.width, H = canvas.height;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
  renderer.setSize(W, H, false);
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const env = spec.env || {};
  scene.background = new THREE.Color(env.bg || INK);
  scene.fog = new THREE.Fog(env.bg || INK, (env.fog || [22, 70])[0], (env.fog || [22, 70])[1]);
  const cam = new THREE.PerspectiveCamera(38, W / H, 0.05, 400);
  scene.add(new THREE.HemisphereLight(0xfff4dd, 0x151515, 0.55));
  const key = new THREE.DirectionalLight(0xffe7b0, 2.4);
  key.position.set(8, 16, 10); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xe8a33d, 1.1); rim.position.set(-10, 6, -14); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xfff1dc, env.fill ?? 0.7); scene.add(fill, fill.target);

  // Floor: near-black with the CRWN gold dot grid, receiving shadows.
  const dots = canvasTex(256, 256, (g, w, h) => { g.fillStyle = "#111"; g.fillRect(0, 0, w, h); g.fillStyle = "rgba(212,175,55,.35)"; g.beginPath(); g.arc(w / 2, h / 2, 5, 0, 7); g.fill(); });
  dots.wrapS = dots.wrapT = THREE.RepeatWrapping; dots.repeat.set(160, 160);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: dots, roughness: 0.85, metalness: 0.1 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  const loader = new THREE.TextureLoader();
  const built = [];
  for (const o of spec.objects || []) built.push(build(o));

  function build(o) {
    const root = new THREE.Group(); root.name = o.id; scene.add(root);
    const it = { o, root, update: () => {} };
    if (o.type === "fans" || o.type === "spike") root.position.fromArray(o.pos || [0, 0, 0]);
    if (o.type === "fans") {
      const n = o.count || 100, cols = o.cols || 10, sp = o.spacing || 0.8;
      const body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.2, 0.46, 4, 12), new THREE.MeshStandardMaterial({ color: o.color || 0x2c2c2c, roughness: 0.55 }), n);
      const headMat = new THREE.MeshStandardMaterial({ color: o.head || GOLD, roughness: 0.3, metalness: 0.55, emissive: 0x000000 });
      const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 18, 14), headMat, n);
      body.castShadow = head.castShadow = true;
      root.add(body, head);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      const rows = Math.ceil(n / cols);
      // A deterministic scatter so the crowd reads as people, not a grid.
      const jit = (i, k) => (Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;
      it.update = (t) => {
        const arrive = clamp01(K(o, "arrive", t, 1)), leave = clamp01(K(o, "leave", t, 0)), dim = clamp01(K(o, "dim", t, 0));
        headMat.color.setHex(o.head || GOLD).lerp(new THREE.Color(0x3a3a3a), dim);
        for (let i = 0; i < n; i++) {
          const r = Math.floor(i / cols), c = i % cols;
          const x = (c - (cols - 1) / 2) * sp + jit(i, 1) * sp * 0.35, z = -(r - (rows - 1) / 2) * sp + jit(i, 2) * sp * 0.35;
          const order = (Math.abs(jit(i, 3)) * 0.999);
          const a = clamp01((arrive - order * 0.6) / 0.4);
          const gone = clamp01((leave - order * 0.7) / 0.3);
          const sc = EASE.out(a) * (1 - EASE.inOut(gone));
          const y = (1 - EASE.out(a)) * 4 + EASE.inOut(gone) * -0.2;
          const back = EASE.inOut(gone) * 2.5;
          s.setScalar(Math.max(1e-4, sc));
          p.set(x, 0.45 + y, z - back); m.compose(p, q, s); body.setMatrixAt(i, m);
          p.set(x, 1.02 + y, z - back); m.compose(p, q, s); head.setMatrixAt(i, m);
        }
        body.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = true;
      };
    } else if (o.type === "rail") {
      const len = (o.months || 36) * (o.step || 1.6) + 4;
      const mat = new THREE.MeshStandardMaterial({ color: GOLD, emissive: 0x6b5410, emissiveIntensity: 0.9, roughness: 0.35, metalness: 0.6 });
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 1), mat); bar.castShadow = true;
      root.add(bar);
      const ticks = [];
      for (let i = 0; i <= (o.months || 36); i++) {
        const big = i % 12 === 0;
        const tk = new THREE.Mesh(new THREE.BoxGeometry(big ? 1.6 : 0.9, 0.05, 0.08), new THREE.MeshStandardMaterial({ color: big ? AMBER : 0x4a4a4a, roughness: 0.6 }));
        tk.position.set(0, 0.03, -i * (o.step || 1.6)); root.add(tk); ticks.push(tk);
      }
      it.pointAt = (month) => { const v = new THREE.Vector3(0, 0.1, -month * (o.step || 1.6)); root.localToWorld(v); return v; };
      it.update = (t) => {
        const L = Math.max(0.001, K(o, "length", t, o.months || 36));
        const zl = L * (o.step || 1.6);
        bar.scale.z = zl; bar.position.set(0, 0.03, -zl / 2);
        ticks.forEach((tk, i) => { tk.visible = i <= L + 1e-3; });
        mat.emissiveIntensity = 0.6 + 0.8 * K(o, "glow", t, 0.4);
      };
      root.position.fromArray(o.pos || [0, 0, 0]);
      if (o.rotY) root.rotation.y = o.rotY;
    } else if (o.type === "spike") {
      const mat = new THREE.MeshStandardMaterial({ color: AMBER, emissive: ORANGE, emissiveIntensity: 1.2, roughness: 0.3 });
      const wd = o.width || 0.9;
      const m = new THREE.Mesh(new THREE.BoxGeometry(wd, 1, wd), mat); m.castShadow = true; root.add(m);
      it.update = (t) => { const h = Math.max(0.001, K(o, "h", t, 0)) * (o.height || 7); m.scale.y = h; m.position.y = h / 2; mat.emissiveIntensity = 0.4 + 1.2 * K(o, "h", t, 0); };
    } else if (o.type === "tiles" || o.type === "stacks") {
      it.lazy = true;
    } else if (o.type === "card" || o.type === "photo") {
      const [w, h] = o.size || [3, 4];
      let mat;
      if (o.type === "card") {
        const px = o.px || 640;
        const tex = canvasTex(px, Math.round(px * h / w), (g, cw, ch) => (FACES[o.face] || FACES.label)(g, cw, ch, o.data || {}));
        mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.05, transparent: true, side: THREE.DoubleSide });
      } else {
        const tex = loader.load(o.src);
        tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
        // A photograph is never relit: MeshBasic keeps the real pixels exactly.
        mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: o.cutout ? 0.02 : 0, depthWrite: !!o.cutout, fog: false, side: THREE.DoubleSide });
      }
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      mesh.castShadow = o.type === "card" || !!o.cutout;
      mesh.position.y = h / 2;
      root.add(mesh);
      it.mat = mat;
      it.update = (t) => {
        root.position.fromArray(K(o, "pos", t, [0, 0, 0]));
        const r = K(o, "rot", t, [0, 0, 0]); root.rotation.set(r[0], r[1], r[2]);
        const sc = K(o, "scale", t, 1); root.scale.setScalar(Math.max(1e-4, sc));
        mat.opacity = clamp01(K(o, "opacity", t, 1));
        root.visible = mat.opacity > 0.002;
      };
    } else if (o.type === "figure") {
      Object.assign(it, buildFigure(o, root));
    } else if (o.type === "stage") {
      Object.assign(it, buildStage(o, root));
    } else if (o.type === "bracket") {
      const mat = new THREE.MeshStandardMaterial({ color: GOLD, emissive: 0x8a6a10, emissiveIntensity: 1.2 });
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 0.12), mat), a = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), mat), b = a.clone();
      root.add(bar, a, b);
      it.update = (t) => {
        const g = clamp01(K(o, "grow", t, 0));
        const p0 = new THREE.Vector3().fromArray(o.from), p1 = new THREE.Vector3().fromArray(o.to);
        const mid = p0.clone().lerp(p1, 0.5), d = p1.clone().sub(p0);
        root.position.copy(mid); root.rotation.y = Math.atan2(-d.z, d.x);
        const L = d.length() * g;
        bar.scale.x = Math.max(1e-3, L); bar.position.set(0, 0.8, 0);
        a.position.set(-L / 2, 0.4, 0); b.position.set(L / 2, 0.4, 0);
        root.visible = g > 0.001;
      };
    }
    return it;
  }

  // ---------------------------------------------------------------- the artist figure
  // Built from reference photographs as a stylised figure in the fans' design language
  // (faceless, a character, not a likeness): the photos decide the hair, the headband,
  // the outfit and the props, never pixels on screen (founder, 2026-09-25).
  function buildFigure(o, root) {
    const st = o.style || {};
    const H = o.height || 1;
    const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...extra });
    const skin = M(st.skin ?? 0x6b4128, { roughness: 0.6 });
    const shirtTex = st.shirtPattern === "pinstripe" ? canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = st.shirtCss || "#EFE6D2"; g.fillRect(0, 0, w, h);
      g.fillStyle = st.trimCss || "#B3261E"; for (let x = 8; x < w; x += 22) g.fillRect(x, 0, 3, h);
    }) : null;
    const shirt = M(shirtTex ? 0xffffff : st.shirt ?? 0xefe6d2, shirtTex ? { map: shirtTex } : {});
    const trim = M(st.trim ?? 0xb3261e);
    const pants = M(st.pants ?? 0x23293a, { roughness: 0.8 });
    const shoe = M(st.shoes ?? 0xf2f2f2, { roughness: 0.4 });
    const hair = M(st.hair ?? 0x17110e, { roughness: 0.7 });
    const gold = M(0xd4af37, { metalness: 0.85, roughness: 0.25 });
    const band = M(st.headband ?? 0xc62828, { roughness: 0.5 });
    const dark = M(0x151515, { metalness: 0.5, roughness: 0.35 });
    const cap = (r, l, mat) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 6, 16), mat); m.castShadow = true; return m; };
    const body = new THREE.Group(); root.add(body); body.scale.setScalar(H);
    // legs and shoes
    for (const sx of [-1, 1]) {
      const leg = cap(0.095, 0.72, pants); leg.position.set(sx * 0.11, 0.5, 0); body.add(leg);
      const sh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.27), shoe); sh.position.set(sx * 0.11, 0.05, 0.04); sh.castShadow = true; body.add(sh);
    }
    // torso: a loose jersey with piping down the front
    const torso = cap(0.22, 0.3, shirt); torso.position.set(0, 1.22, 0); torso.scale.set(1.14, 1, 0.8); body.add(torso);
    const placket = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.02), trim); placket.position.set(0, 1.2, 0.175); body.add(placket);
    // neck, chain, head
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.064, 0.1, 16), skin); neck.position.set(0, 1.56, 0); body.add(neck);
    if (st.chain !== false) { const ch = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.011, 8, 40), gold); ch.rotation.x = Math.PI / 2 - 0.35; ch.position.set(0, 1.52, 0.03); body.add(ch); }
    const headG = new THREE.Group(); headG.position.set(0, 1.62, 0); body.add(headG);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 32, 24), skin); head.scale.set(0.95, 1.13, 1.0); head.position.y = 0.17; head.castShadow = true; headG.add(head);
    for (const sx of [-1, 1]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), skin); ear.position.set(sx * 0.142, 0.17, 0); ear.scale.set(0.6, 1, 0.9); headG.add(ear); }
    // hair: a braided cap and braids hanging to the shoulders, beads at the tips
    const hcap = new THREE.Mesh(new THREE.SphereGeometry(0.157, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.4), hair); hcap.scale.set(0.97, 1.13, 1.02); hcap.position.y = 0.175; hcap.rotation.x = -0.3; // stops above the brow (negative x-rotation lifts the front rim) headG.add(hcap);
    const nBraids = st.braids ?? 24;
    for (let i = 0; i < nBraids; i++) {
      const a = Math.PI * 0.18 + (i / (nBraids - 1)) * Math.PI * 1.64; // around the back and sides
      const len = 0.26 + 0.08 * Math.abs(Math.sin(i * 2.3));
      const br = cap(0.016, len, hair);
      // a runs around the BACK of the head (z < 0 at the middle), ending at the temples.
      const x = Math.cos(a + Math.PI / 2) * 0.135, z = Math.sin(a + Math.PI / 2) * 0.13;
      br.position.set(x * 1.05, 0.19 - len / 2, z * 1.05 - 0.01);
      br.rotation.set(z * 0.9, 0, x * 0.9);
      headG.add(br);
      if (st.beads !== false) { const bd = new THREE.Mesh(new THREE.SphereGeometry(0.021, 10, 8), gold); bd.position.set(x * 1.05 + x * 0.25 * len, 0.19 - len - 0.01, z * 1.05 - z * 0.2 * len); headG.add(bd); }
    }
    // A moustache and a chin beard (the 2024 reference): the face reads as a face and the
    // head reads as front-facing, with no attempt at a likeness.
    // Two glossy eyes and a chin beard: a character's face, not a likeness.
    for (const sx of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.017, 12, 10), M(0x0a0a0a, { roughness: 0.15, metalness: 0.3 })); eye.scale.set(0.8, 1.2, 0.5); eye.position.set(sx * 0.052, 0.19, 0.138); headG.add(eye); }
    if (st.beard !== false) { const chin = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 10), hair); chin.scale.set(1.1, 0.75, 0.6); chin.position.set(0, 0.035, 0.118); headG.add(chin); }
    // The headband hugs the head (the head sphere is scaled, so the band is too).
    const hb = new THREE.Mesh(new THREE.TorusGeometry(0.146, 0.017, 10, 48), band); hb.rotation.x = Math.PI / 2 + 0.14; hb.position.set(0, 0.255, 0.004); hb.scale.set(0.955, 1.0, 1.0); headG.add(hb);
    // arms: shoulder and elbow pivots
    const arm = (sx) => {
      const sh = new THREE.Group(); sh.position.set(sx * 0.27, 1.43, 0); body.add(sh);
      const sleeve = cap(0.085, 0.1, shirt); sleeve.position.y = -0.06; sh.add(sleeve);
      const up = cap(0.06, 0.24, skin); up.position.y = -0.17; sh.add(up);
      const el = new THREE.Group(); el.position.y = -0.33; sh.add(el);
      const fo = cap(0.054, 0.22, skin); fo.position.y = -0.14; el.add(fo);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.052, 16, 12), skin); hand.position.y = -0.3; hand.castShadow = true; el.add(hand);
      return { sh, el, hand };
    };
    const R = arm(-1), Lf = arm(1);
    if (st.mic !== false) {
      const mic = new THREE.Group(); R.hand.add(mic); mic.position.set(0.0, 0.03, 0.05); mic.rotation.x = -0.5;
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.2, 12), dark); handle.position.y = 0.08; handle.castShadow = true; mic.add(handle);
      const grille = new THREE.Mesh(new THREE.SphereGeometry(0.042, 16, 12), M(0x9a9a9a, { metalness: 0.9, roughness: 0.28 })); grille.position.y = 0.2; mic.add(grille);
    }
    const update = (t) => {
      root.position.fromArray(K(o, "pos", t, [0, 0, 0]));
      const r = K(o, "rot", t, [0, 0, 0]); root.rotation.set(r[0], r[1], r[2]);
      root.scale.setScalar(Math.max(1e-4, K(o, "scale", t, 1)));
      root.visible = K(o, "scale", t, 1) > 0.001;
      const mic = clamp01(K(o, "mic", t, 0)), point = clamp01(K(o, "point", t, 0));
      const bob = K(o, "bob", t, 1), nod = K(o, "nod", t, 0.6), turn = K(o, "turn", t, 0);
      // The mic comes up to the mouth; a performer's bounce and nod keep him alive.
      R.sh.rotation.set(-1.15 * mic, 0.38 * mic, -0.12 * (1 - mic));
      R.el.rotation.set(-1.95 * mic, 0, 0);
      Lf.sh.rotation.set(-1.25 * point, 0, 0.12 + 0.45 * point);
      Lf.el.rotation.set(-0.25 * point, 0, 0);
      const ph = 2 * Math.PI * 1.05 * t;
      body.position.y = Math.abs(Math.sin(ph)) * 0.022 * bob;
      body.rotation.z = Math.sin(ph / 2) * 0.025 * bob;
      headG.rotation.set(Math.sin(ph) * 0.06 * nod, turn, 0);
    };
    return { update, pointAt: () => { const v = new THREE.Vector3(0, 1.9 * H, 0); root.localToWorld(v); return v; } };
  }

  // ---------------------------------------------------------------- a stage
  function buildStage(o, root) {
    root.position.fromArray(o.pos || [0, 0, 0]);
    const w = o.width || 6, d = o.depth || 3, h = o.height || 0.6;
    const plat = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6 }));
    plat.position.y = h / 2; plat.receiveShadow = plat.castShadow = true; root.add(plat);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, 0.04), new THREE.MeshStandardMaterial({ color: GOLD, emissive: 0x8a6a10, emissiveIntensity: 1.2 }));
    lip.position.set(0, h, d / 2); root.add(lip);
    const bd = o.backdrop || {};
    const bw = bd.w || w, bh = bd.h || bw * 0.5;
    const drawScreen = (g, cw, ch) => {
      g.fillStyle = "#0b0b0b"; g.fillRect(0, 0, cw, ch);
      const grd = g.createRadialGradient(cw / 2, ch / 2, 20, cw / 2, ch / 2, cw * 0.6); grd.addColorStop(0, "rgba(212,175,55,.18)"); grd.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = grd; g.fillRect(0, 0, cw, ch);
      g.fillStyle = bd.color || "#F3EFE6"; g.font = `${bd.weight || 400} ${Math.round(ch * (bd.size || 0.62))}px ${bd.font || "Marker"}, sans-serif`;
      g.textAlign = "center"; g.textBaseline = "middle"; g.shadowColor = "rgba(255,240,210,.55)"; g.shadowBlur = 40; g.fillText(bd.text || "", cw / 2, ch * 0.54);
      g.shadowBlur = 0;
    };
    const tex = canvasTex(1600, Math.round(1600 * bh / bw), drawScreen);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshBasicMaterial({ map: tex, fog: false }));
    screen.position.set(0, h + bh / 2 + (bd.lift || 0.2), -d / 2 + 0.02); root.add(screen);
    const beams = [];
    const bm = new THREE.MeshBasicMaterial({ color: o.beamColor ?? 0xe8a33d, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const n = o.beams ?? 4;
    for (let i = 0; i < n; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 8, 24, 1, true), bm);
      const g = new THREE.Group(); g.position.set((i - (n - 1) / 2) * (w / Math.max(1, n - 1)) * 0.9, h + bh + 3.2, d * 0.2);
      cone.position.y = -4; g.add(cone); root.add(g); beams.push(g);
    }
    const update = (t) => {
      const k = clamp01(K(o, "beams", t, 1));
      bm.opacity = 0.11 * k;
      beams.forEach((g, i) => { g.rotation.z = Math.sin(t * 0.9 + i * 1.7) * 0.32; g.rotation.x = 0.25 + Math.cos(t * 0.7 + i) * 0.12; });
    };
    const redraw = () => { const c = tex.image, g = c.getContext("2d"); g.clearRect(0, 0, c.width, c.height); drawScreen(g, c.width, c.height); tex.needsUpdate = true; };
    return { update, redraw };
  }

  // Tiles and stacks hang off a rail, so they are built after every rail exists.
  const byId = (id) => built.find((x) => x.o.id === id);
  for (const it of built.filter((x) => x.lazy)) {
    const o = it.o, rail = byId(o.rail), months = o.months || [];
    if (o.type === "tiles") {
      const tex = { plain: iconTex(null), check: iconTex("check"), miss: iconTex("miss") };
      const faces = months.map((mo) => {
        const mat = new THREE.MeshStandardMaterial({ map: tex.plain, roughness: 0.5, emissive: 0x000000 });
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.08), mat); m.castShadow = true;
        it.root.add(m); return { mo, m, mat };
      });
      it.update = (t) => {
        const shown = K(o, "shown", t, months.length), checked = K(o, "checked", t, 0);
        // A missed month can be made good later (until): the promise delivered after all.
        const live = (o.missed || []).filter((x) => t >= x.t && (x.until == null || t < x.until));
        const missed = new Set(live.map((x) => x.month));
        faces.forEach(({ mo, m, mat }, i) => {
          const a = clamp01(shown - i);
          const p = rail.pointAt(mo);
          m.position.set(p.x + (o.side ?? 1.3), 0.55 + (1 - EASE.back(a)) * -0.6, p.z);
          m.scale.setScalar(Math.max(1e-4, EASE.out(a)));
          m.rotation.y = -0.35;
          m.visible = a > 0;
          const isMiss = missed.has(mo), isCheck = i < checked && !isMiss;
          mat.map = isMiss ? tex.miss : isCheck ? tex.check : tex.plain;
          mat.emissive.setHex(isCheck ? 0x3a2c05 : isMiss ? 0x2a0a02 : 0x000000);
          if (isMiss) m.position.y -= clamp01((t - live.find((x) => x.month === mo).t) / 0.6) * 0.35;
        });
      };
    } else {
      const per = o.coins || 10;
      const total = months.length * per;
      const coin = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.32, 0.32, 0.075, 28), new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.85, roughness: 0.28, emissive: 0x2a1f02 }), total);
      coin.castShadow = true; it.root.add(coin);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      it.update = (t) => {
        const filled = K(o, "filled", t, 0); // months filled (float)
        const fade = clamp01(K(o, "fade", t, 0));
        months.forEach((mo, i) => {
          const base = rail.pointAt(mo);
          for (let k = 0; k < per; k++) {
            const a = clamp01((filled - i) * per - k);
            const y = 0.06 + k * 0.08 + (1 - EASE.out(a)) * 1.2;
            s.setScalar(Math.max(1e-4, EASE.out(a) * (1 - fade)));
            p.set(base.x - (o.side ?? 1.3), y, base.z);
            m.compose(p, q, s); coin.setMatrixAt(i * per + k, m);
          }
        });
        coin.instanceMatrix.needsUpdate = true;
      };
    }
  }
  function iconTex(kind) {
    return canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = kind === "check" ? "#D4AF37" : kind === "miss" ? "#3a1a10" : "#3a3a3a"; rr(g, 2, 2, w - 4, h - 4, 18); g.fill();
      if (!kind) { g.lineWidth = 6; g.strokeStyle = "rgba(212,175,55,.75)"; rr(g, 5, 5, w - 10, h - 10, 16); g.stroke(); }
      g.strokeStyle = kind === "check" ? "#0d0d0d" : "#C2571A"; g.lineWidth = 14; g.lineCap = "round";
      if (kind === "check") { g.beginPath(); g.moveTo(34, 66); g.lineTo(56, 88); g.lineTo(96, 42); g.stroke(); }
      if (kind === "miss") { g.beginPath(); g.moveTo(40, 40); g.lineTo(88, 88); g.moveTo(88, 40); g.lineTo(40, 88); g.stroke(); }
      if (!kind) { g.fillStyle = "rgba(212,175,55,.5)"; g.fillRect(24, 22, 80, 14); }
    });
  }

  // Pinned HTML tags: crisp text at a projected 3D point (or an object's origin).
  const tagEls = (spec.tags || []).map((tg, i) => {
    const el = document.createElement("div");
    el.className = `wtag wtag-${tg.style || "tag"}`; el.id = `wt${i}`;
    el.textContent = tg.text || "";
    overlay.appendChild(el);
    return { tg, el };
  });
  const v = new THREE.Vector3();
  function placeTags(t, visible) {
    for (const { tg, el } of tagEls) {
      const on = visible && t >= tg.start && t < tg.end;
      if (!on) { el.style.opacity = "0"; continue; }
      if (tg.counter) {
        const c = tg.counter, k = EASE[c.ease || "out"](clamp01((t - c.t0) / Math.max(1e-3, c.t1 - c.t0)));
        el.textContent = `${c.prefix || ""}${Math.round(c.from + (c.to - c.from) * k).toLocaleString("en-US")}${c.suffix || ""}`;
      }
      let px, py;
      if (tg.screen) { [px, py] = tg.screen; }
      else {
        if (tg.obj) { const it = byId(tg.obj); it.root.updateMatrixWorld(); v.setFromMatrixPosition(it.root.matrixWorld); if (tg.month != null && it.pointAt) v.copy(it.pointAt(tg.month)); }
        else v.fromArray(tg.at);
        if (tg.offset) v.add(new THREE.Vector3().fromArray(tg.offset));
        v.project(cam);
        px = (v.x * 0.5 + 0.5) * W; py = (-v.y * 0.5 + 0.5) * H;
      }
      const fadeIn = clamp01((t - tg.start) / 0.2), fadeOut = clamp01((tg.end - t) / 0.2);
      el.style.opacity = String(Math.min(fadeIn, fadeOut));
      el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -50%) scale(${(0.85 + 0.15 * EASE.back(fadeIn)).toFixed(3)})`;
    }
  }

  const windows = spec.windows || [];
  const look = new THREE.Vector3();
  function render(t) {
    const visible = windows.some(([a, b]) => t >= a - 1e-6 && t < b);
    canvas.style.visibility = visible ? "visible" : "hidden";
    overlay.style.visibility = visible ? "visible" : "hidden";
    if (!visible) { placeTags(t, false); return; }
    for (const it of built) it.update(t);
    const c = spec.camera || [];
    cam.position.fromArray(keyAt(c.map((k) => ({ ...k, v: k.pos })), t, [0, 6, 14]));
    look.fromArray(keyAt(c.map((k) => ({ ...k, v: k.look })), t, [0, 0, 0]));
    cam.fov = keyAt(c.map((k) => ({ ...k, v: k.fov ?? 38 })), t, 38);
    cam.updateProjectionMatrix();
    cam.lookAt(look);
    key.target.position.copy(look);
    key.position.set(look.x + 8, 16, look.z + 10);
    fill.position.copy(cam.position).add(new THREE.Vector3(0.5, 1.2, 0)); fill.target.position.copy(look);
    renderer.render(scene, cam);
    placeTags(t, true);
  }
  // Fonts must be ready before a card face is drawn: redraw every card once they are.
  const ready = (document.fonts?.ready || Promise.resolve()).then(() => {
    for (const it of built) if (it.redraw) it.redraw();
    for (const it of built) if (it.o.type === "card" && it.mat?.map) {
      const o = it.o, g = it.mat.map.image.getContext("2d");
      g.clearRect(0, 0, it.mat.map.image.width, it.mat.map.image.height);
      (FACES[o.face] || FACES.label)(g, it.mat.map.image.width, it.mat.map.image.height, o.data || {});
      it.mat.map.needsUpdate = true;
    }
  });
  return { render, ready, renderer };
}
