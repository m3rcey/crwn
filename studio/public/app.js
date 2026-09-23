const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const LABEL = { done: "done", progress: "in progress", todo: "not started", failed: "failed", unknown: "can't tell" };
let selected = null;

async function api(url, opts) {
  const res = await fetch(url, opts);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body;
}

function renderEnv(o) {
  const parts = [];
  if (o.ssd.root && !o.ssdError) parts.push(`SSD ${o.ssd.letter}: at ${esc(o.ssd.root)} (${esc(o.ssd.source)})`);
  else parts.push(`<span class="bad">SSD: ${esc(o.ssdError || o.ssd.error)}</span> <button id="relocate">Look again</button>`);
  if (o.fanDir && !o.ssdError) {
    parts.push(o.fanDirExists ? "Fan Economy folder found" : `<span class="bad">Fan Economy folder not created yet</span>`);
  }
  $("#env").innerHTML = parts.join(" · ");
  $("#relocate")?.addEventListener("click", async () => renderList(await api("/api/ssd/relocate", { method: "POST" })));
}

function renderList(o) {
  renderEnv(o);
  $("#videos tbody").innerHTML = o.videos
    .map(
      (v) => `<tr data-num="${v.num}" class="${v.num === selected ? "selected" : ""}">
        <td>${v.num}</td><td title="${esc(v.slug)}">${esc(v.slug.replace(/^\d+-/, ""))}</td>
        ${v.steps
          .map((s) => `<td><span class="dot ${s.status}${s.step === v.current ? " current" : ""}" title="${s.step}. ${esc(s.name)}: ${esc(LABEL[s.status])}. ${esc(s.summary)}"></span></td>`)
          .join("")}
      </tr>`,
    )
    .join("");
  $("#gaps").innerHTML = o.gaps.length
    ? `<span class="muted">No script with number ${o.gaps.join(", ")}. The next new script is ${Math.max(...o.videos.map((v) => v.num)) + 1}.</span>`
    : "";
}

function renderStep(s, num) {
  const checks = s.checks.length
    ? `<ul class="checks">${s.checks.map((c) => `<li class="${c.ok ? "ok" : "bad"}">${esc(c.label)}</li>`).join("")}</ul>`
    : "";
  const manual = s.manual
    ? `<label class="mark"><input type="checkbox" data-step="${s.step}" ${s.status === "done" ? "checked" : ""}> Mark done</label>
       <p><b>Next:</b> ${esc(s.next)}</p><p><b>Lands:</b> ${esc(s.lands)}</p>`
    : "";
  const candidates = s.candidates?.length
    ? `<p class="muted">Possible recording (not linked; linking comes in Phase 2):</p>${s.candidates.map((c) => `<div class="path">${esc(c)}</div>`).join("")}`
    : "";
  return `<div class="step">
    <div class="step-head"><span class="chip ${s.status}">${esc(LABEL[s.status])}</span><b>${s.step}. ${esc(s.name)}</b></div>
    <div>${esc(s.summary)}</div>${checks}${manual}${candidates}
    ${s.note ? `<p class="muted">${esc(s.note)}</p>` : ""}
  </div>`;
}

function renderDetail(d) {
  const f = d.files;
  const paths = [
    ["Script", f.script],
    ["Sheets folder", f.sheetsDir],
    ["Recording", f.recording && `${f.recording.wav} (${f.recording.source})`],
    ["Transcript", f.recording?.json],
    ["JSX", f.recording?.jsx],
    ["Carousel", f.carousel && `videos/carousels/fan-economy/${f.carousel}`],
    ["caption.md", f.captionMd && `${f.captionMd} (${f.slides} of 5 slides)`],
  ].filter(([, v]) => v);
  $("#detail-pane").innerHTML = `
    <h2>${d.num}. ${esc(d.slug.replace(/^\d+-/, ""))}</h2>
    ${d.steps.map((s) => renderStep(s, d.num)).join("")}
    <h3>Files</h3>
    ${paths.map(([k, v]) => `<div><b>${k}:</b> <span class="path">${esc(v)}</span></div>`).join("")}
    <h3>Script</h3>
    <pre class="script">${esc(d.scriptSection ?? "(no **SCRIPT:** section)")}</pre>
    <details><summary>Whole script file</summary><pre class="script">${esc(d.scriptText)}</pre></details>`;
  $("#detail-pane").querySelectorAll("input[data-step]").forEach((box) =>
    box.addEventListener("change", async () => {
      box.disabled = true;
      try {
        renderDetail(
          await api(`/api/videos/${d.num}/manual`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ step: Number(box.dataset.step), done: box.checked }),
          }),
        );
        renderList(await api("/api/videos"));
      } catch (e) {
        alert(e.message);
        box.checked = !box.checked;
        box.disabled = false;
      }
    }),
  );
}

async function openVideo(num) {
  selected = num;
  document.querySelectorAll("#videos tbody tr").forEach((tr) => tr.classList.toggle("selected", Number(tr.dataset.num) === num));
  $("#detail-pane").innerHTML = `<p class="muted">Loading ${num}...</p>`;
  renderDetail(await api(`/api/videos/${num}`));
}

$("#videos tbody").addEventListener("click", (e) => {
  const tr = e.target.closest("tr[data-num]");
  if (tr) location.hash = tr.dataset.num;
});

// #60 in the address bar opens video 60, so a video can be bookmarked or linked.
window.addEventListener("hashchange", () => {
  const n = parseInt(location.hash.slice(1), 10);
  if (n) openVideo(n).catch((e) => ($("#detail-pane").innerHTML = `<p class="bad">${esc(e.message)}</p>`));
});

api("/api/videos")
  .then((o) => {
    renderList(o);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  })
  .catch((e) => ($("#env").innerHTML = `<span class="bad">${esc(e.message)}</span>`));
