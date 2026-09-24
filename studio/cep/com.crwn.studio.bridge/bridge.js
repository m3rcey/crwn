// Polls CRWN Studio for a placement, runs Studio's placement copy FROM DISK inside Premiere, and
// posts back how many clips landed plus what the copy reported.
/* global require, window */
var http = require("http");
var HOST = "127.0.0.1";
var PORT = 4717;
var POLL_MS = 2000;
// Bump with lib/bridge.mjs PANEL_VERSION whenever this file changes: Premiere keeps running
// the copy it loaded at startup, and Studio refuses to place through an out-of-date one.
var VERSION = "2";
var busy = false;

function $(id) { return document.getElementById(id); }
function show(text, cls) { $("state").textContent = text; $("state").className = cls || ""; }

function request(method, path, body, cb) {
  var data = body ? JSON.stringify(body) : null;
  var req = http.request(
    { host: HOST, port: PORT, method: method, path: path, headers: { "x-crwn-bridge": "1", "x-crwn-bridge-version": VERSION, "content-type": "application/json" } },
    function (res) {
      var chunks = "";
      res.setEncoding("utf8");
      res.on("data", function (c) { chunks += c; });
      res.on("end", function () { cb(null, res.statusCode, chunks); });
    }
  );
  req.on("error", function (e) { cb(e); });
  req.setTimeout(5000, function () { req.abort(); });
  if (data) req.write(data);
  req.end();
}

// ExtendScript source that runs one placement copy and returns "CLIPS:<n>\n<message>".
// n = clips on A3 + A4 after minus before: Premiere's own count of what landed. The message is
// whatever the copy passed to __crwnReport (Studio rewrites its alert() calls; swapping
// $.global.alert did NOT work in Premiere 24, the first live test came back empty).
function wrapper(jsxPath) {
  return [
    "(function(){",
    "function n(){var s=app.project&&app.project.activeSequence;if(!s||s.audioTracks.numTracks<4)return 0;",
    "return s.audioTracks[2].clips.numItems+s.audioTracks[3].clips.numItems;}",
    "$.global.__crwnLast='';var before=n();",
    "try{",
    "var f=new File(" + JSON.stringify(jsxPath) + ");f.encoding='UTF-8';",
    "if(!f.exists){$.global.__crwnLast='ERROR: JSX not found: '+f.fsName;}else{$.evalFile(f);}",
    "}catch(e){$.global.__crwnLast+='\\nERROR: '+e.toString()+(e.line?' (line '+e.line+')':'');}",
    "return 'CLIPS:'+(n()-before)+'\\n'+$.global.__crwnLast;",
    "})()"
  ].join("");
}

function run(job) {
  busy = true;
  show("Placing video... (large placements take a while)", "");
  $("last").textContent = job.jsx;
  window.__adobe_cep__.evalScript(wrapper(job.jsx), function (result) {
    var error = result === "EvalScript error." ? "EvalScript error (the JSX did not run)" : null;
    $("msg").textContent = result || "(the JSX reported nothing)";
    request("POST", "/api/bridge/result", { id: job.id, message: result, error: error }, function () {
      busy = false;
      show("Connected. Waiting for Studio.", "ok");
    });
  });
}

function poll() {
  if (busy) return;
  request("GET", "/api/bridge/next", null, function (err, code, body) {
    if (err) return show("Studio isn't running (node studio/server.mjs in WSL).", "bad");
    show("Connected. Waiting for Studio.", "ok");
    if (code === 200) run(JSON.parse(body));
  });
}

setInterval(poll, POLL_MS);
poll();
