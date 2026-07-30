// patreonImport.ts — the Patreon on-ramp, option (b) (Launch Wizard Stage 7,
// docs/ARTIST_LAUNCH_WIZARD.md; spec Phase 7; TODO's chosen wedge).
//
// Pure helpers over an already-parsed CSV (headers + string rows): detect a
// Patreon Relationship Manager export, read each member's status / pledge /
// tier, and suggest which CRWN tier each Patreon tier maps to. No I/O and no
// consent logic here: the import still flows through FanImportModal's
// attestation and /api/fan-contacts/import, and invites still flow through the
// campaign path that refuses non-attested contacts. Importing a file never
// creates consent; a Patreon patron DID opt in to the artist, which is exactly
// what the attestation asserts.

export interface PatreonMember {
  email: string;
  name: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  /** Raw "Patron Status" cell, e.g. "Active patron", "Former patron". */
  status: string;
  active: boolean;
  /** Monthly pledge in integer cents (0 when blank / free member). */
  pledgeCents: number;
  /** Patreon tier title, null for free members / blank cells. */
  tierName: string | null;
}

const norm = (h: string) => h.trim().toLowerCase();

/**
 * A Patreon Relationship Manager export always carries "Patron Status"; older
 * variants at minimum carry both amount columns. Case-insensitive on purpose.
 */
export function detectPatreonCsv(headers: string[]): boolean {
  const set = new Set(headers.map(norm));
  if (set.has('patron status')) return true;
  return set.has('pledge amount') && set.has('lifetime amount');
}

/** "$5.00", "5", "5,00" (rare EU exports) → integer cents; junk → 0. */
export function parsePledgeCents(raw: string | undefined | null): number {
  if (!raw) return 0;
  const cleaned = String(raw).replace(/[^0-9.,-]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

function indexOfHeader(headers: string[], name: string): number {
  return headers.findIndex((h) => norm(h) === name);
}

/**
 * Shape raw CSV rows into members. Rows without a plausible email are dropped
 * (email is the fan_contacts dedup key, same rule as the generic import).
 */
export function parsePatreonRows(headers: string[], rows: string[][]): PatreonMember[] {
  const col = {
    email: indexOfHeader(headers, 'email'),
    name: indexOfHeader(headers, 'name'),
    phone: indexOfHeader(headers, 'phone'),
    city: indexOfHeader(headers, 'city'),
    state: indexOfHeader(headers, 'state'),
    country: indexOfHeader(headers, 'country'),
    status: indexOfHeader(headers, 'patron status'),
    pledge: indexOfHeader(headers, 'pledge amount'),
    tier: indexOfHeader(headers, 'tier'),
  };
  const cell = (row: string[], i: number): string => (i >= 0 ? (row[i] ?? '').trim() : '');

  const out: PatreonMember[] = [];
  for (const row of rows) {
    const email = cell(row, col.email).toLowerCase();
    if (!email.includes('@')) continue;
    const status = cell(row, col.status);
    const tierName = cell(row, col.tier);
    out.push({
      email,
      name: cell(row, col.name) || null,
      phone: cell(row, col.phone) || null,
      city: cell(row, col.city) || null,
      state: cell(row, col.state) || null,
      country: cell(row, col.country) || null,
      status,
      active: /active/i.test(status),
      pledgeCents: parsePledgeCents(cell(row, col.pledge)),
      tierName: tierName || null,
    });
  }
  return out;
}

export interface PatreonTierGroup {
  /** Patreon tier title ("Free member" bucket when none). */
  tierName: string;
  pledgeCents: number;
  count: number;
}

/** Distinct Patreon tiers among the members, biggest group first. */
export function patreonTierBreakdown(members: PatreonMember[]): PatreonTierGroup[] {
  const byKey = new Map<string, PatreonTierGroup>();
  for (const m of members) {
    const tierName = m.tierName ?? (m.pledgeCents > 0 ? `$${(m.pledgeCents / 100).toFixed(0)} pledge` : 'Free member');
    const key = `${tierName}:${m.pledgeCents}`;
    const g = byKey.get(key);
    if (g) {
      g.count += 1;
    } else {
      byKey.set(key, { tierName, pledgeCents: m.pledgeCents, count: 1 });
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count);
}

export interface CrwnTierOption {
  name: string;
  /** Monthly price in integer cents. */
  price: number;
}

/**
 * The CRWN tier a Patreon pledge maps to: free pledges go to the free front
 * door; paid pledges go to the CLOSEST paid tier by price (ties break to the
 * cheaper rung, the safer suggestion for a fan re-committing on a new
 * platform). Null when the artist has no matching kind of tier yet.
 */
export function suggestCrwnTier(pledgeCents: number, tiers: CrwnTierOption[]): CrwnTierOption | null {
  if (pledgeCents <= 0) {
    return tiers.find((t) => t.price === 0) ?? null;
  }
  const paid = tiers.filter((t) => t.price > 0);
  if (!paid.length) return null;
  return paid.reduce((best, t) => {
    const d = Math.abs(t.price - pledgeCents);
    const bestD = Math.abs(best.price - pledgeCents);
    if (d < bestD) return t;
    if (d === bestD && t.price < best.price) return t;
    return best;
  });
}

/**
 * Segmentation tags stored on the imported contact: always 'patreon', plus the
 * member's Patreon tier, so the artist can target "my old $25 Vault patrons"
 * in campaigns without CRWN inventing a schema change.
 */
export function patreonTags(member: PatreonMember): string[] {
  const tags = ['patreon'];
  if (member.tierName) tags.push(`patreon-tier:${member.tierName}`);
  if (!member.active && member.status) tags.push('patreon-inactive');
  return tags;
}
