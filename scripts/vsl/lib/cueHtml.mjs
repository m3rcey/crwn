// Renders the cue sheet as a standalone page, from the same data the markdown is built from.
// The markdown is for the repo; this is what actually sits open beside Premiere, so it carries a
// filter (112 rows is too many to eyeball) and click-to-copy filenames.
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderHtml(report, totals) {
  const nav = report
    .map((d) => `<a class="jump" href="#${d.id}">${esc(shortName(d.title))}</a>`)
    .join("");

  const decks = report.map((deck) => {
    const rows = deck.rows
      .map((r) => {
        const missing = !r.spoken;
        const said = missing
          ? `<span class="gap">Never recorded.</span> <span class="beat">The sheet asks for: ${esc(r.sheet)}</span>`
          : esc(r.spoken);
        return `<li class="row${missing ? " row-gap" : ""}" data-find="${esc((r.spoken || r.sheet) + " " + r.file)}">
  <div class="id">
    <span class="num">${r.n}</span>
    <button class="file" type="button" data-copy="${esc(r.file)}" title="Copy filename">${esc(r.file)}</button>
  </div>
  <p class="said">${said}</p>
</li>`;
      })
      .join("\n");

    const warn = deck.outOfOrder.length
      ? `<p class="warn"><strong>Slide ${deck.outOfOrder.join(" and ")} play out of deck order.</strong>
The recording says these words earlier than the slide number suggests. Place them by the words, not
by the number: dropping them in numeric order runs them against narration about something else.</p>`
      : "";

    return `<section class="deck" id="${deck.id}">
  <header class="deck-head">
    <h2>${esc(deck.title)}</h2>
    <p class="meta"><span>${deck.rows.length} slides</span><span class="sep"></span><span class="mono">${esc(deck.audio)}</span><span class="sep"></span><span class="mono">videos/vsl/${esc(deck.id)}/</span></p>
  </header>
  ${warn}
  <ol class="rows">
${rows}
  </ol>
</section>`;
  });

  return `<title>CRWN VSL Cue Sheet</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Newsreader:opsz,wght@6..72,400;6..72,500&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
:root{
  --ground:#FBF8F4; --raised:#F3EEE6; --ink:#141414; --muted:#6C675E; --faint:#9C968B;
  --rule:#E2DACD; --accent:#B8761A; --flag:#A8531A; --flag-bg:#F6E9DA; --focus:#B8761A;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --ground:#131316; --raised:#1B1B1F; --ink:#EDEAE4; --muted:#918D84; --faint:#6E6A62;
    --rule:#2A2A30; --accent:#D4AF37; --flag:#E8A33D; --flag-bg:#241D12; --focus:#D4AF37;
  }
}
:root[data-theme="dark"]{
  --ground:#131316; --raised:#1B1B1F; --ink:#EDEAE4; --muted:#918D84; --faint:#6E6A62;
  --rule:#2A2A30; --accent:#D4AF37; --flag:#E8A33D; --flag-bg:#241D12; --focus:#D4AF37;
}
*{box-sizing:border-box}
body{
  margin:0; background:var(--ground); color:var(--ink);
  font-family:Archivo,"Helvetica Neue",Arial,sans-serif;
  font-size:16px; line-height:1.5; -webkit-font-smoothing:antialiased;
}
.wrap{max-width:60rem; margin:0 auto; padding:3.5rem 1.5rem 6rem}

/* ---- masthead ---- */
.mast{display:flex; flex-direction:column; gap:1rem; padding-bottom:2rem; border-bottom:1px solid var(--rule)}
h1{margin:0; font-size:clamp(1.9rem,4.5vw,2.7rem); font-weight:700; letter-spacing:-.03em; text-wrap:balance}
.lede{margin:0; max-width:44ch; color:var(--muted); font-size:1.05rem}
.stats{display:flex; flex-wrap:wrap; gap:.5rem 2rem; margin:.25rem 0 0; padding:0; list-style:none}
.stats div{display:flex; flex-direction:column; gap:.15rem}
.stats b{font-family:"JetBrains Mono",ui-monospace,monospace; font-size:1.35rem; font-weight:600;
  font-variant-numeric:tabular-nums; color:var(--accent); line-height:1}
.stats span{font-size:.72rem; text-transform:uppercase; letter-spacing:.1em; color:var(--faint)}
.note{margin:0; padding:.85rem 1rem; background:var(--raised); border-left:2px solid var(--accent);
  color:var(--muted); font-size:.92rem; max-width:58ch}
.note strong{color:var(--ink); font-weight:600}

/* ---- sticky controls ---- */
.bar{position:sticky; top:0; z-index:5; display:flex; flex-wrap:wrap; gap:.5rem; align-items:center;
  margin:0 -1.5rem; padding:.75rem 1.5rem; background:var(--ground); border-bottom:1px solid var(--rule)}
.find{flex:1 1 14rem; min-width:0; padding:.5rem .75rem; background:var(--raised); color:var(--ink);
  border:1px solid var(--rule); border-radius:2px; font:inherit; font-size:.92rem}
.find::placeholder{color:var(--faint)}
.jump{padding:.4rem .6rem; color:var(--muted); font-size:.82rem; font-weight:600; text-decoration:none;
  border:1px solid transparent; border-radius:2px; white-space:nowrap}
.jump:hover{color:var(--ink); border-color:var(--rule)}
:focus-visible{outline:2px solid var(--focus); outline-offset:2px}

/* ---- decks ---- */
.deck{margin-top:3.25rem; scroll-margin-top:4.5rem}
.deck-head h2{margin:0 0 .3rem; font-size:1.3rem; font-weight:700; letter-spacing:-.02em; text-wrap:balance}
.meta{display:flex; flex-wrap:wrap; align-items:center; gap:.6rem; margin:0 0 1rem;
  font-size:.8rem; color:var(--faint)}
.meta .sep{width:3px; height:3px; border-radius:50%; background:currentColor; opacity:.6}
.mono{font-family:"JetBrains Mono",ui-monospace,monospace}
.warn{margin:0 0 1.25rem; padding:.9rem 1.1rem; background:var(--flag-bg); border-left:2px solid var(--flag);
  color:var(--muted); font-size:.92rem; max-width:62ch}
.warn strong{display:block; color:var(--flag); font-weight:600}

.rows{margin:0; padding:0; list-style:none; border-top:1px solid var(--rule)}
.row{display:grid; grid-template-columns:13rem 1fr; gap:1.25rem; align-items:baseline;
  padding:.85rem .5rem; border-bottom:1px solid var(--rule)}
.row:hover{background:var(--raised)}
.id{display:flex; align-items:baseline; gap:.65rem; min-width:0}
.num{flex:none; width:1.9rem; font-family:"JetBrains Mono",ui-monospace,monospace; font-size:.95rem;
  font-weight:600; font-variant-numeric:tabular-nums; color:var(--accent)}
.file{min-width:0; padding:0; background:none; border:0; color:var(--faint); cursor:pointer;
  font-family:"JetBrains Mono",ui-monospace,monospace; font-size:.74rem; text-align:left;
  overflow-wrap:anywhere}
.file:hover{color:var(--ink)}
.file.copied{color:var(--accent)}
.said{margin:0; font-family:Newsreader,Georgia,serif; font-size:1.12rem; line-height:1.45; text-wrap:pretty}
.row-gap .said{font-family:Archivo,sans-serif; font-size:.95rem}
.gap{color:var(--flag); font-weight:600}
.beat{color:var(--faint)}
.empty{display:none; padding:2rem .5rem; color:var(--muted)}
body.filtering .deck:not(.has-hit){display:none}
body.filtering .row:not(.hit){display:none}
body.filtering .warn{display:none}
body.filtering .empty.on{display:block}

@media (max-width:34rem){
  .row{grid-template-columns:1fr; gap:.35rem}
  .said{font-size:1.05rem}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>

<div class="wrap">
<header class="mast">
  <h1>Which words each slide sits under</h1>
  <p class="lede">Every rendered VSL slide, matched to the first words actually spoken beneath it, so each PNG lands on the right frame.</p>
  <div class="stats">
    <div><b>${totals.decks}</b><span>Decks</span></div>
    <div><b>${totals.slides}</b><span>Slides</span></div>
    <div><b>${totals.matched}</b><span>Located in the audio</span></div>
    <div><b>${totals.unmatched}</b><span>Never recorded</span></div>
  </div>
  <p class="note"><strong>There are no per-slide timecodes and there never were.</strong> The transcripts
  are a single 00:00:00 block, so the cue is the words. Every line quoted here is real recorded
  narration: a slide whose cue was never said says so rather than showing invented words.</p>
</header>

<div class="bar">
  <input class="find" id="find" type="search" placeholder="Filter by words or filename" aria-label="Filter slides">
  ${nav}
</div>

${decks.join("\n")}
<p class="empty" id="empty">Nothing matches that.</p>
</div>

<script>
(function () {
  var find = document.getElementById("find");
  var empty = document.getElementById("empty");
  var rows = Array.prototype.slice.call(document.querySelectorAll(".row"));
  var decks = Array.prototype.slice.call(document.querySelectorAll(".deck"));

  find.addEventListener("input", function () {
    var q = find.value.trim().toLowerCase();
    document.body.classList.toggle("filtering", q.length > 0);
    if (!q) { empty.classList.remove("on"); return; }
    var any = false;
    rows.forEach(function (row) {
      var hit = row.getAttribute("data-find").toLowerCase().indexOf(q) !== -1;
      row.classList.toggle("hit", hit);
      if (hit) any = true;
    });
    decks.forEach(function (deck) {
      deck.classList.toggle("has-hit", !!deck.querySelector(".row.hit"));
    });
    empty.classList.toggle("on", !any);
  });

  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".file");
    if (!btn) return;
    var name = btn.getAttribute("data-copy");
    var done = function () {
      var was = btn.textContent;
      btn.textContent = "copied";
      btn.classList.add("copied");
      setTimeout(function () { btn.textContent = was; btn.classList.remove("copied"); }, 900);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(name).then(done, function () {});
    }
  });
})();
</script>
`;
}

function shortName(title) {
  const m = title.match(/VSL #(\d)/);
  return m ? "VSL " + m[1] : title.replace(/ VSL$/, "");
}
