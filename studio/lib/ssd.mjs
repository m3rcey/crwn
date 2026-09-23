// Find the SSD by its label, never by a remembered letter. /mnt/d is an empty directory that
// is NOT a mount, so reading it looks like "no files" and writing it silently lands inside the
// WSL disk. A path only counts as the SSD when `mountpoint -q` says it is a real mount.
import { execFileSync } from "node:child_process";
import { SSD_LABEL } from "./config.mjs";

export function isMount(dir) {
  try {
    execFileSync("mountpoint", ["-q", dir]);
    return true;
  } catch {
    return false;
  }
}

// Returns { root, letter, source } or { root: null, error }. Never falls back to a default letter.
export function locateSsd(override) {
  let letter = override || null;
  let source = override ? "config.json" : "label lookup";
  if (!letter) {
    try {
      const out = execFileSync(
        "powershell.exe",
        ["-NoProfile", "-Command", `(Get-Volume -FileSystemLabel '${SSD_LABEL}').DriveLetter`],
        { encoding: "utf-8", timeout: 20000 },
      );
      // PowerShell answers with CRLF; an unstripped letter builds the path "/mnt/e\r".
      letter = out.replace(/[\r\n\s]/g, "");
    } catch (e) {
      return { root: null, error: `Label lookup for "${SSD_LABEL}" failed: ${e.message.split("\n")[0]}` };
    }
  }
  if (!/^[A-Za-z]$/.test(letter || "")) {
    return { root: null, error: `No drive labelled "${SSD_LABEL}" is connected.` };
  }
  const root = `/mnt/${letter.toLowerCase()}`;
  if (!isMount(root)) {
    return { root: null, error: `${root} (${source}) is not a mounted drive.` };
  }
  return { root, letter: letter.toUpperCase(), source };
}
