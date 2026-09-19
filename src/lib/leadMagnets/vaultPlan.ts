// The Vault plan, derived from what the artist ENTERED and from nothing else.
//
// One pure module shared by the Vault Revenue Planner's result generator and by the Vault builder's
// prefill, so the result page and the builder can never describe two different Vaults. It exists
// because they did (2026-09-19 audit): the artist entered 12 unreleased songs, 30 voice memos and a
// monthly cadence, and the builder opened on demos, alternate versions, session photos and "every
// two weeks", all of them literals in the spec. That hardcoded cadence then rode auto-claim into
// the setup wizard and seeded a real Promise Calendar recurrence the artist never chose.
//
// Rules held here:
//  - Inventory the artist entered is FACT. A content type they did not enter never appears in a
//    drop, a schedule row or a prefilled list. It may only be offered as an unselected suggestion.
//  - The cadence the artist picked is the cadence. Nothing here substitutes another one.
//  - A drop is only listed if entered inventory can fill it. Five drops are promised only when five
//    can be formed; otherwise the heading states the real count.
//  - Under a slower-than-weekly cadence the in-between weeks are PROMOTION, labeled optional and
//    labeled as not a drop, so a monthly commitment never reads as four weekly obligations.
//
// Pure data + functions. No React, no I/O.

export type VaultCadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly';

export const VAULT_CADENCES: readonly VaultCadence[] = ['weekly', 'biweekly', 'monthly', 'quarterly'];

export interface VaultInventoryType {
  /** The calculator's input key. Frozen: stored answers are keyed to it. */
  key: string;
  /** Plural label, as the calculator asks it. */
  label: string;
  singular: string;
  plural: string;
}

/** Every content type the planner asks about, in the order it asks. */
export const VAULT_INVENTORY_TYPES: readonly VaultInventoryType[] = [
  { key: 'unreleasedSongs', label: 'Unreleased songs', singular: 'unreleased song', plural: 'unreleased songs' },
  { key: 'demos', label: 'Demos', singular: 'demo', plural: 'demos' },
  { key: 'voiceMemos', label: 'Voice memos', singular: 'voice memo', plural: 'voice memos' },
  { key: 'studioClips', label: 'Studio clips', singular: 'studio clip', plural: 'studio clips' },
  { key: 'btsVideos', label: 'Behind-the-scenes videos', singular: 'behind-the-scenes video', plural: 'behind-the-scenes videos' },
  { key: 'lyricSheets', label: 'Lyric sheets or notes', singular: 'lyric sheet or note', plural: 'lyric sheets or notes' },
  { key: 'altVersions', label: 'Alternate versions', singular: 'alternate version', plural: 'alternate versions' },
  { key: 'archivedPhotos', label: 'Archived photos', singular: 'archived photo', plural: 'archived photos' },
];

export interface VaultInventoryItem {
  key: string;
  label: string;
  count: number;
}

/** How many pieces one drop holds. The runway math and the drop list share this one number. */
export const VAULT_ITEMS_PER_DROP = 2;
export const VAULT_MAX_LISTED_DROPS = 5;

const toCount = (v: unknown): number => {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
};

export function normalizeVaultCadence(v: unknown): VaultCadence | null {
  return typeof v === 'string' && (VAULT_CADENCES as readonly string[]).includes(v) ? (v as VaultCadence) : null;
}

/** Only the types the artist entered a real count for, in the order they were asked. */
export function readVaultInventory(values: Record<string, unknown>): VaultInventoryItem[] {
  return VAULT_INVENTORY_TYPES.map((t) => ({ key: t.key, label: t.label, count: toCount(values[t.key]) })).filter(
    (i) => i.count > 0,
  );
}

/** Rebuild a trusted inventory from a stored payload: unknown keys and non-positive counts drop. */
export function parseVaultInventory(raw: unknown): VaultInventoryItem[] {
  if (!Array.isArray(raw)) return [];
  const byKey = new Map<string, number>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as { key?: unknown; count?: unknown };
    if (typeof e.key === 'string') byKey.set(e.key, toCount(e.count));
  }
  return VAULT_INVENTORY_TYPES.map((t) => ({ key: t.key, label: t.label, count: byKey.get(t.key) ?? 0 })).filter(
    (i) => i.count > 0,
  );
}

/** "12 unreleased songs": the artist's own inventory, as the lines the builder shows. */
export function vaultInventoryLines(inventory: VaultInventoryItem[]): string[] {
  return inventory.map((i) => {
    const t = VAULT_INVENTORY_TYPES.find((x) => x.key === i.key);
    return `${i.count.toLocaleString('en-US')} ${t ? (i.count === 1 ? t.singular : t.plural) : i.label.toLowerCase()}`;
  });
}

/**
 * Read an inventory back out of the builder's own "content you already have" lines. The draft is
 * then the single source for replanning, before AND after signup (the claimed builder is opened
 * with no calculator payload), and a type the artist ADDED there by hand counts, because adding it
 * is them selecting it. A line with no count, or naming nothing the planner knows, plans no drop.
 */
export function parseVaultInventoryLines(lines: unknown): VaultInventoryItem[] {
  if (!Array.isArray(lines)) return [];
  const counts = new Map<string, number>();
  for (const raw of lines) {
    const m = /^\s*([\d,]+)\s+(.+?)\s*$/.exec(String(raw ?? ''));
    if (!m) continue;
    const count = toCount(m[1].replace(/,/g, ''));
    const words = m[2].toLowerCase();
    const type = VAULT_INVENTORY_TYPES.find((t) => words === t.plural || words === t.singular);
    if (type && count > 0) counts.set(type.key, (counts.get(type.key) ?? 0) + count);
  }
  return VAULT_INVENTORY_TYPES.map((t) => ({ key: t.key, label: t.label, count: counts.get(t.key) ?? 0 })).filter(
    (i) => i.count > 0,
  );
}

/** Content types the artist did NOT enter. Offered as ideas only, never preselected. */
export function vaultSuggestedTypes(inventory: VaultInventoryItem[]): string[] {
  const have = new Set(inventory.map((i) => i.key));
  return VAULT_INVENTORY_TYPES.filter((t) => !have.has(t.key)).map((t) => t.plural);
}

/**
 * The first drops the entered inventory can actually fill, at most five.
 *
 * Each drop takes up to VAULT_ITEMS_PER_DROP pieces, preferring two DIFFERENT types so a drop is
 * not two of the same thing when the artist has variety, and always from the deepest remaining
 * pile so no type is exhausted early. Deterministic: ties resolve in the order the planner asks.
 * It stops when the inventory runs out, which is what makes the count honest.
 */
export function planVaultDrops(inventory: VaultInventoryItem[], max = VAULT_MAX_LISTED_DROPS): string[] {
  const remaining = inventory.filter((i) => i.count > 0).map((i) => ({ ...i }));
  const drops: string[] = [];
  while (drops.length < max && remaining.some((i) => i.count > 0)) {
    const picked = new Map<string, number>();
    for (let slot = 0; slot < VAULT_ITEMS_PER_DROP; slot++) {
      const open = remaining.filter((i) => i.count > 0);
      if (!open.length) break;
      const fresh = open.filter((i) => !picked.has(i.key));
      const pool = fresh.length ? fresh : open;
      const pick = pool.reduce((best, i) => (i.count > best.count ? i : best));
      pick.count -= 1;
      picked.set(pick.key, (picked.get(pick.key) ?? 0) + 1);
    }
    const parts = VAULT_INVENTORY_TYPES.filter((t) => picked.has(t.key)).map((t) => {
      const n = picked.get(t.key)!;
      return `${n} ${n === 1 ? t.singular : t.plural}`;
    });
    drops.push(parts.join(' and '));
  }
  return drops;
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five'];

/** The heading says five only when there are five. */
export function vaultDropsTitle(dropCount: number): string {
  if (dropCount >= VAULT_MAX_LISTED_DROPS) return 'First five drops';
  if (dropCount === 1) return 'Your first drop';
  return `Your first ${NUMBER_WORDS[dropCount] ?? dropCount} drops`;
}

export function vaultDropsPhrase(dropCount: number): string {
  if (dropCount >= VAULT_MAX_LISTED_DROPS) return 'your first five drops';
  if (dropCount === 1) return 'your first drop';
  return `your first ${NUMBER_WORDS[dropCount] ?? dropCount} drops`;
}

export function vaultDropsPerMonth(cadence: VaultCadence): number {
  return cadence === 'weekly' ? 4 : cadence === 'biweekly' ? 2 : cadence === 'monthly' ? 1 : 1 / 3;
}

const DROP_WEEKS: Record<VaultCadence, number[]> = {
  weekly: [1, 2, 3, 4],
  biweekly: [1, 3],
  monthly: [1],
  quarterly: [1],
};

const PROMO = 'Optional promotion, not a drop';

/**
 * The first 30 days at the artist's cadence. Drop rows carry only planned drops (so only entered
 * inventory); every other row is promotion and says so. A monthly Vault has ONE drop row.
 */
export function buildVaultSchedule(cadence: VaultCadence, drops: string[]): { when: string; what: string }[] {
  const rows: { when: string; what: string }[] = [];
  const dropWeeks = DROP_WEEKS[cadence];
  let next = 0;
  for (let week = 1; week <= 4; week++) {
    if (dropWeeks.includes(week)) {
      if (next >= drops.length) continue;
      const lead = next === 0 ? 'Launch: open the Vault with drop 1' : `Drop ${next + 1}`;
      rows.push({ when: `Week ${week}`, what: `${lead}: ${drops[next]}` });
      next += 1;
    } else if (cadence !== 'weekly' && next > 0 && week % 2 === 0) {
      const upcoming =
        cadence === 'biweekly'
          ? 'tease the next drop publicly'
          : cadence === 'monthly'
            ? week === 2
              ? 'share a public teaser of what members just got'
              : 'preview next month for members'
            : week === 2
              ? 'share a public teaser of what members just got'
              : 'remind fans the next drop lands next quarter';
      rows.push({ when: `Week ${week}`, what: `${PROMO}: ${upcoming}` });
    }
  }
  return rows;
}

/** The schedule as the one-line-per-row list the builder edits. */
export function vaultDropPlanLines(cadence: VaultCadence, drops: string[]): string[] {
  return buildVaultSchedule(cadence, drops).map((r) => `${r.when}: ${r.what}`);
}

/**
 * When the artist changes the cadence in the builder, the drop plan follows it, but ONLY if the
 * plan is still the one generated for the previous cadence. A plan the artist rewrote is theirs.
 */
export function replanOnCadenceChange(
  inventory: VaultInventoryItem[],
  previousCadence: unknown,
  nextCadence: unknown,
  currentPlan: string[],
): string[] | null {
  const next = normalizeVaultCadence(nextCadence);
  if (!next) return null;
  const drops = planVaultDrops(inventory);
  const prev = normalizeVaultCadence(previousCadence);
  const generatedBefore = prev ? vaultDropPlanLines(prev, drops) : [];
  const untouched =
    currentPlan.length === 0 ||
    (currentPlan.length === generatedBefore.length && currentPlan.every((line, i) => line === generatedBefore[i]));
  return untouched ? vaultDropPlanLines(next, drops) : null;
}
