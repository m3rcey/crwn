// Polls CRWN Studio for a placement, runs that JSX FROM DISK inside Premiere, and posts back
// what the JSX reported. The JSX is never edited: its closing alert() is captured by swapping
// the global alert for the duration of the run, so the result comes back as text instead of a
// dialog. If the swap ever fails, the dialog still appears and Studio says to read it.
/* global require, window */
var http = require("http");
var HOST = "127.0.0.1";
var PORT = 4717;
var POLL_MS = 2000;
var busy = false;

function $(id) { return document.getElementById(id); }
function show(text, cls) { $("state").textContent = text; $("state").className = cls || ""; }

function request(method, path, body, cb) {
  var data = body ? JSON.stringify(body) : null;
  var req = http.request(
    { host: HOST, port: PORT, method: method, path: path, headers: { "x-crwn-bridge": "1", "content-type": "application/json" } },
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

// ExtendScript source that runs one JSX file and returns everything it alerted.
function wrapper(jsxPath) {
  return [
    "(function(){",
    "var __m=[];var __a=$.global.alert;",
    "$.global.alert=function(x){__m.push(String(x));};",
    "try{",
    "var f=new File(" + JSON.stringify(jsxPath) + ");f.encoding='UTF-8';",
    "if(!f.exists){__m.push('ERROR: JSX not found: '+f.fsName);}else{$.evalFile(f);}",
    "}catch(e){__m.push('ERROR: '+e.toString()+(e.line?' (line '+e.line+')':''));}",
    "finally{$.global.alert=__a;}",
    "return __m.join('\\n---\\n');",
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
