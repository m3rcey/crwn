// Deterministic experiment assignment.
//
// Assignment is a PURE FUNCTION of a durable anonymous id + the experiment key + config version.
// Because it is reproducible, it needs no assignments table, it can never switch mid-journey (same
// inputs -> same variant forever), and it can be re-derived server-side to reject a spoofed variant.
// It uses NO Math.random and NO Date, so it is stable across renders, servers, and resumes.

/** FNV-1a 32-bit hash. Stable, fast, dependency-free. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/** A variant with a whole-number percentage allocation (0-100). Weights need not sum to 100; any
 *  remainder is an unassigned HOLDOUT (returns null), which is a valid control-style outcome. */
export interface AllocationEntry {
  variantKey: string;
  pct: number;
}

/**
 * Deterministically assign `aid` to a variant for an experiment. Returns the variant key, or null
 * for the holdout remainder. The bucket is stable in [0,10000); allocations are applied in the
 * given order, so the same (aid, experiment, version) always yields the same result.
 */
export function assignVariant(
  aid: string,
  experimentKey: string,
  configVersion: string,
  allocation: AllocationEntry[],
): string | null {
  if (!aid || !experimentKey || !allocation.length) return null;
  const bucket = hashString(`${aid}:${experimentKey}:${configVersion}`) % 10000;
  let cursor = 0;
  for (const a of allocation) {
    const width = Math.max(0, Math.min(100, a.pct)) * 100; // pct of 10000
    if (bucket < cursor + width) return a.variantKey;
    cursor += width;
  }
  return null; // holdout
}

/** Even split across the given variant keys (each floor(100/n), remainder is holdout). */
export function evenAllocation(variantKeys: string[]): AllocationEntry[] {
  if (!variantKeys.length) return [];
  const pct = Math.floor(100 / variantKeys.length);
  return variantKeys.map((variantKey) => ({ variantKey, pct }));
}
