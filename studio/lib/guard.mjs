// Every write Studio makes on the SSD goes through here (BUILD_PLAN rules 4 and 5).
// - The SSD must be a real mount RIGHT NOW (checked per write, not once at startup).
// - The only writable folder is Hip Hop Industry\Fan Economy (founder decision 2026-09-23);
//   Unmixed, Mixed and the root are read-only history.
// - Nothing is ever deleted: a replaced file moves into Fan Economy\_replaced\.
import fs from "node:fs";
import path from "node:path";
import { SSD_FOLDERS } from "./config.mjs";
import { isMount } from "./ssd.mjs";

export function fanDirFor(ssd) {
  return ssd.root ? path.join(ssd.root, SSD_FOLDERS.fanEconomy) : null;
}

// Returns null when `target` may be written, or the reason it may not.
export function refuseWrite(ssd, target) {
  if (!ssd.root) return `The SSD isn't available: ${ssd.error}`;
  if (!isMount(ssd.root)) return `${ssd.root} is not a mounted drive right now.`;
  const fanDir = fanDirFor(ssd);
  if (!fs.existsSync(fanDir)) return `The Fan Economy folder doesn't exist yet. Create it in Explorer: ${fanDir}`;
  const dir = path.dirname(path.resolve(target));
  if (dir !== fanDir && dir !== path.join(fanDir, "_replaced")) {
    return `Studio only writes inside ${SSD_FOLDERS.fanEconomy}. This file is in ${dir}, which is read-only history.`;
  }
  return null;
}

export function assertWritable(ssd, target) {
  const reason = refuseWrite(ssd, target);
  if (reason) throw new GuardError(reason);
}

export class GuardError extends Error {}

// Move a file into _replaced/ beside it. A name already taken there gets a timestamp.
export function moveToReplaced(ssd, file, now = new Date()) {
  assertWritable(ssd, file);
  const dir = path.join(path.dirname(file), "_replaced");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  const ext = path.extname(file);
  let dest = path.join(dir, path.basename(file));
  if (fs.existsSync(dest)) {
    const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
    dest = path.join(dir, `${path.basename(file, ext)}.${stamp}${ext}`);
  }
  assertWritable(ssd, dest);
  fs.renameSync(file, dest);
  return dest;
}
