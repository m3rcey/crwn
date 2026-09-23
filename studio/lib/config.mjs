// Every path Studio reads, in one place. The SSD letter is NOT here: it is looked up by
// label at startup (lib/ssd.mjs), and config.json may override it if the lookup fails.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const STUDIO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPO = path.resolve(STUDIO_DIR, "..");

const DROPBOX = "/mnt/c/Users/Josh/Dropbox/nano banana output";

export const PATHS = {
  scripts: path.join(REPO, "videos/scripts/fan-economy"),
  ideas: path.join(REPO, "videos/ideas/fan-economy"),
  carousels: path.join(REPO, "videos/carousels/fan-economy"),
  // Same constants as generate-fan-economy-images.mjs / build-fan-economy-pdf.mjs and
  // generate-fan-economy-carousel.mjs. If those move, these move with them.
  sheets: path.join(DROPBOX, "Shortform Posts/Fan Economy"),
  carouselOut: path.join(DROPBOX, "Carousel Posts/Fan Economy"),
  state: path.join(STUDIO_DIR, "state.json"),
};

// Relative to the SSD root. `fanEconomy` is where processed wavs go from now on
// (founder decision 2026-09-23); the rest are read-only history.
export const SSD_LABEL = "Extreme SSD";
export const HHI = "Videos/2026/CRWN/Reels TikTok Shorts/Hip Hop Industry";
export const SSD_FOLDERS = {
  fanEconomy: `${HHI}/Fan Economy`,
  history: [HHI, `${HHI}/Unmixed`, `${HHI}/Mixed`],
};

export function loadConfig() {
  const file = path.join(STUDIO_DIR, "config.json");
  const defaults = { port: 4717, ssdLetter: null };
  if (!fs.existsSync(file)) return defaults;
  return { ...defaults, ...JSON.parse(fs.readFileSync(file, "utf-8")) };
}
