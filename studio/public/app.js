const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const LABEL = { done: "done", progress: "in progress", todo: "not started", failed: "failed", unknown: "can't tell" };
let selected = null;

async function api(url, body) {
  const opts = body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  const res = await fetch(url, opts);
  const data = res.status === 204 ? {} : await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function refresh() {
  renderList(await api("/api/videos"));
  if (selected) renderDetail(await api(`/api/videos/${selected}`));
}

// Every button on the page goes through here: disable, act, re-render, surface a refusal.
async function act(button, fn) {
  button.disabled = true;
  try {
    await fn();
    await refresh();
    pollActivity();
  } catch (e) {
    alert(e.message);
    button.disabled = false;
  }
}

function renderEnv(o) {
  const parts = [];
  if (o.ssd.root && !o.ssdError) parts.push(`SSD ${o.ssd.letter}: at ${esc(o.ssd.root)} (${esc(o.ssd.source)})`);
  else parts.push(`<span class="bad">SSD: ${esc(o.ssdError || o.ssd.error)}</span> <button id="relocate">Look again</button>`);
  if (o.fanDir && !o.ssdError) {
    parts.push(o.fanDirExists ? "Fan Economy folder found" : `<span class="bad">Fan Economy folder not created yet: ${esc(o.fanDir)}</span>`);
  }
  $("#env").innerHTML = parts.join(" · ");
  $("#relocate")?.addEventListener("click", (e) => act(e.target, () => api("/api/ssd/relocate", {})));
  const ask = (u) =>
    u.candidates.length
      ? `${esc(u.name)} could be ${u.candidates.map((n) => `<a href="#${n}">${n}</a>`).join(" or ")}`
      : `${esc(u.name)} doesn't name a script`;
  $("#unassigned").innerHTML = o.unassigned.length
    ? `<b>Which script is this?</b> ${o.unassigned.map(ask).join("; ")}. Open its video and link it in step 6, or put the script number or more of the title in the file name.`
    : "";
  $("#unassigned").hidden = !o.unassigned.length;
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

// Step 6's controls. Only the one next action is offered; the server re-checks everything.
function chopControls(d, s) {
  const r = d.recording;
  const out = [];
  if (s.stage === "link") {
    const opt = (x) => `<option value="${esc(x.rel)}">${esc(x.name)}</option>`;
    const suggested = d.recordings.filter((x) => s.candidates?.includes(x.rel));
    const fan = d.recordings.filter((x) => x.fan);
    const history = d.recordings.filter((x) => !x.fan);
    out.push(`<div class="row"><select id="link-rel">
      ${suggested.length ? `<optgroup label="Suggested">${suggested.map(opt).join("")}</optgroup>` : ""}
      <optgroup label="Fan Economy folder">${fan.map(opt).join("") || "<option disabled>(empty)</option>"}</optgroup>
      <optgroup label="Older folders (read-only)">${history.map(opt).join("")}</optgroup>
    </select><button data-act="link">Link</button></div>`);
  }
  if (r) {
    out.push(`<div><b>Recording:</b> <span class="path">${esc(r.wav)}</span> <span class="muted">(${esc(r.source)})</span></div>`);
    if (!r.inFanDir) out.push(`<p class="muted">This wav is in a read-only history folder: Studio won't transcribe or split beside it.</p>`);
    const buttons = [];
    if (r.renameTo) buttons.push(`<button data-act="rename">Rename to "${esc(r.renameTo)}"</button>`);
    if (r.explicit) buttons.push(`<button data-act="unlink">Unlink</button>`);
    if (r.inFanDir && s.stage === "transcribe") buttons.push(`<button class="primary" data-act="transcribe">${s.status === "failed" ? "Transcribe again" : "Transcribe"}</button>`);
    if (r.inFanDir && s.stage === "split") buttons.push(`<button class="primary" data-act="split">${s.status === "failed" ? "Split again" : "Split"}</button>`);
    const canPlace = s.stage === "place" && !r.placeRefusal;
    if (canPlace) buttons.push(`<button class="primary" data-act="place">Place in Premiere</button>`);
    if (buttons.length) out.push(`<div class="row">${buttons.join("")}</div>`);
    if (canPlace) out.push(`<p class="muted">First select an empty sequence with 4 audio tracks in Premiere. The CRWN Studio Bridge panel runs the JSX from disk.</p>`);
    const p = r.preview;
    if (canPlace && p) {
      const fr = (n) => `${n > 0 ? "+" : ""}${n} frames`;
      const line = (l, what, gap) =>
        l ? `<li>${what} (phrase ${l.phrase}, "${esc(l.text)}"): ${gap}</li>` : `<li class="bad">${what}: not found, so that gap gets ${fr(p.spacing.gapFrames)}</li>`;
      out.push(`<div class="muted"><b>Placement plan</b> (${p.phrases} phrases, settings in studio/config.json):<ul class="plan">
        ${line(p.hook, "After the hook", `${p.spacing.hookSilenceSec}s of silence`)}
        ${line(p.cta, "Before the CTA", fr(p.spacing.ctaGapFrames))}
        ${line(p.last, "Before the last line", fr(p.spacing.lastLineGapFrames))}
        <li>Every other gap: ${fr(p.spacing.gapFrames)}</li></ul></div>`);
    }
    if (s.stage === "place" && r.placeRefusal) out.push(`<p class="bad">Can't place from Studio: ${esc(r.placeRefusal)}</p>`);
    if (s.stage === "place" || r.placedByHand) {
      out.push(`<label class="mark"><input type="checkbox" id="by-hand" ${r.placedByHand ? "checked" : ""}> I placed this JSX by hand</label>`);
    }
  }
  if (s.message) out.push(`<pre class="log">${esc(s.message)}</pre>`);
  return out.join("");
}

function renderStep(s, d) {
  const checks = s.checks.length
    ? `<ul class="checks">${s.checks.map((c) => `<li class="${c.ok ? "ok" : "bad"}">${esc(c.label)}</li>`).join("")}</ul>`
    : "";
  const manual = s.manual
    ? `<label class="mark"><input type="checkbox" data-step="${s.step}" ${s.status === "done" ? "checked" : ""}> Mark done</label>
       <p><b>Next:</b> ${esc(s.next)}</p>${s.lands ? `<p><b>Lands:</b> ${esc(s.lands)}</p>` : ""}`
    : "";
  return `<div class="step">
    <div class="step-head"><span class="chip ${s.status}">${esc(LABEL[s.status])}</span><b>${s.step}. ${esc(s.name)}</b></div>
    <div>${esc(s.summary)}</div>${checks}
    ${(s.warnings || []).map((w) => `<p class="warn">⚠ ${esc(w)}</p>`).join("")}
    ${manual}${s.step === 6 ? chopControls(d, s) : ""}
    ${s.captionOverride ? `<label class="mark"><input type="checkbox" data-step="9" ${s.overridden ? "checked" : ""}> Posted without a carousel file</label>` : ""}
    ${s.note ? `<p class="muted">${esc(s.note)}</p>` : ""}
  </div>`;
}

function renderDetail(d) {
  const f = d.files;
  const paths = [
    ["Script", f.script],
    ["Sheets folder", f.sheetsDir],
    ["Transcript", f.recording?.json],
    ["JSX", f.recording?.jsx],
    ["Carousel", f.carousel && `videos/carousels/fan-economy/${f.carousel}`],
    ["caption.md", f.captionMd && `${f.captionMd} (${f.slides} of 5 slides)`],
  ].filter(([, v]) => v);
  const pane = $("#detail-pane");
  pane.innerHTML = `
    <h2>${d.num}. ${esc(d.slug.replace(/^\d+-/, ""))}</h2>
    ${d.steps.map((s) => renderStep(s, d)).join("")}
    <h3>Files</h3>
    ${paths.map(([k, v]) => `<div><b>${k}:</b> <span class="path">${esc(v)}</span></div>`).join("")}
    <h3>Script</h3>
    <pre class="script">${esc(d.scriptSection ?? "(no **SCRIPT:** section)")}</pre>
    <details><summary>Whole script file</summary><pre class="script">${esc(d.scriptText)}</pre></details>`;

  const url = (a) => `/api/videos/${d.num}/${a}`;
  pane.querySelectorAll("input[data-step]").forEach((box) =>
    box.addEventListener("change", () => act(box, () => api(url("manual"), { step: Number(box.dataset.step), done: box.checked }))),
  );
  pane.querySelectorAll("button[data-act]").forEach((b) =>
    b.addEventListener("click", () => {
      const a = b.dataset.act;
      if (a === "rename" && !confirm(`Rename ${d.recording.wav.split("/").pop()} to "${d.recording.renameTo}"?`)) return;
      act(b, () => api(url(a), a === "link" ? { rel: $("#link-rel").value } : {}));
    }),
  );
  $("#by-hand")?.addEventListener("change", (e) => act(e.target, () => api(url("placed-by-hand"), { done: e.target.checked })));
}

// ---- Live activity: the running job and the Premiere panel ----
let lastActivity = "";
const clock = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

async function pollActivity() {
  let a;
  try {
    a = await api("/api/activity");
  } catch {
    return;
  }
  const j = a.job;
  const b = a.bridge;
  const parts = [];
  parts.push(
    `Premiere panel: ${
      !b.connected ? `<span class="bad">not connected</span>`
      : b.outdated ? `<span class="bad">old version: close and reopen it (Window > Extensions > CRWN Studio Bridge)</span>`
      : `<span class="okc">connected</span>`
    }`,
  );
  if (b.pending) {
    parts.push(`Placing video ${b.pending.num}: ${b.pending.picked ? "running in Premiere" : "waiting for the panel"} (${clock(b.pending.queuedSec)}) <button id="cancel-place">Cancel</button>`);
  }
  let body = "";
  if (j) {
    const state = j.status === "running" ? `running ${clock(j.elapsedSec)}` : `${j.status} after ${clock(j.elapsedSec)}`;
    parts.push(`<b>${esc(j.label)}</b>: <span class="${j.status === "failed" ? "bad" : j.status === "passed" ? "okc" : ""}">${state}</span>`);
    if (j.status === "running" && j.kind === "transcribe") parts.push(`<span class="muted">Transcription prints nothing until it finishes. Silence is normal.</span>`);
    const checks = j.result?.checks?.length
      ? `<ul class="checks">${j.result.checks.map((c) => `<li class="${c.ok ? "ok" : "bad"}">${esc(c.label)}</li>`).join("")}</ul>`
      : "";
    body = `${j.result ? `<div>${esc(j.result.summary)}${j.result.moved ? ` Moved the old file to ${esc(j.result.moved)}.` : ""}</div>${checks}` : ""}
      <details ${j.status === "running" ? "open" : ""}><summary>Output (log: ${esc(j.logPath)})</summary><pre class="log">${esc(j.lines.join("\n"))}</pre></details>`;
  }
  $("#activity").innerHTML = `<div>${parts.join(" · ")}</div>${body}`;
  $("#cancel-place")?.addEventListener("click", (e) => act(e.target, () => api("/api/bridge/cancel", {})));

  // When a job or a placement finishes, the statuses it changed are re-read from disk.
  const key = `${j?.id}:${j?.status}:${b.pending?.id}`;
  if (lastActivity && key !== lastActivity) refresh();
  lastActivity = key;
}
setInterval(pollActivity, 1500);

$("#videos tbody").addEventListener("click", (e) => {
  const tr = e.target.closest("tr[data-num]");
  if (tr) location.hash = tr.dataset.num;
});

async function openVideo(num) {
  selected = num;
  document.querySelectorAll("#videos tbody tr").forEach((tr) => tr.classList.toggle("selected", Number(tr.dataset.num) === num));
  $("#detail-pane").innerHTML = `<p class="muted">Loading ${num}...</p>`;
  renderDetail(await api(`/api/videos/${num}`));
}

// #60 in the address bar opens video 60, so a video can be bookmarked or linked.
window.addEventListener("hashchange", () => {
  const n = parseInt(location.hash.slice(1), 10);
  if (n) openVideo(n).catch((e) => ($("#detail-pane").innerHTML = `<p class="bad">${esc(e.message)}</p>`));
});

api("/api/videos")
  .then((o) => {
    renderList(o);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    pollActivity();
  })
  .catch((e) => ($("#env").innerHTML = `<span class="bad">${esc(e.message)}</span>`));
