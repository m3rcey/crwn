// The ONLY facts Studio stores are the ones disk cannot show (BUILD_PLAN rule 6): manual step
// check marks, recording links, split check results, placements, sheet approvals. Everything
// else is derived. Split and placement records carry the JSX mtime they belong to, so a
// rewritten JSX never inherits an old pass.
import fs from "node:fs";
import { PATHS } from "./config.mjs";

const EMPTY = { manual: {}, links: {}, splits: {}, placements: {} };

export function readState() {
  if (!fs.existsSync(PATHS.state)) return structuredClone(EMPTY);
  return { ...structuredClone(EMPTY), ...JSON.parse(fs.readFileSync(PATHS.state, "utf-8")) };
}

// Write to a temp file and rename, so a crash mid-write never leaves half a state file.
export function writeState(state) {
  const tmp = `${PATHS.state}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n");
  fs.renameSync(tmp, PATHS.state);
}

export function updateState(fn) {
  const state = readState();
  fn(state);
  writeState(state);
  return state;
}

export const MANUAL_STEPS = [4, 5, 7, 8];

export function setManual(num, step, done) {
  return updateState((state) => {
    const key = String(num);
    state.manual[key] ??= {};
    if (done) state.manual[key][step] = { done: true, at: new Date().toISOString() };
    else delete state.manual[key][step];
    if (!Object.keys(state.manual[key]).length) delete state.manual[key];
  });
}
