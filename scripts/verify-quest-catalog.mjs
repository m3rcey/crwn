// Throwaway static integrity check for the quest catalog. Reads the source as text
// (no transpile) and asserts: unique keys, every prerequisite/generatesFanQuests
// reference resolves, and every domain `check` is both in the DomainCheck union and
// handled by a `case` in the evaluator. Run: node scripts/verify-quest-catalog.mjs
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const templates = readFileSync(root + 'src/lib/quests/templates.ts', 'utf8');
const types = readFileSync(root + 'src/lib/quests/types.ts', 'utf8');
const evaluator = readFileSync(root + 'src/lib/quests/evaluator.ts', 'utf8');

const all = (s, re) => [...s.matchAll(re)].map((m) => m[1]);
const problems = [];

// 1. Keys + duplicates
const keys = all(templates, /^\s*key:\s*'([^']+)'/gm);
const keySet = new Set();
const dups = new Set();
for (const k of keys) (keySet.has(k) ? dups.add(k) : keySet.add(k));
if (dups.size) problems.push(`Duplicate template keys: ${[...dups].join(', ')}`);

// 2. Prerequisites + generatesFanQuests resolve to real keys
const refBlocks = [
  ...all(templates, /prerequisites:\s*\[([^\]]*)\]/g),
  ...all(templates, /generatesFanQuests:\s*\[([^\]]*)\]/g),
];
const refs = new Set();
for (const b of refBlocks) for (const m of b.matchAll(/'([^']+)'/g)) refs.add(m[1]);
for (const r of refs) if (!keySet.has(r)) problems.push(`Unresolved prerequisite/fan-quest reference: ${r}`);

// 3. Every domain check used is declared in the union AND handled by a case
const usedChecks = new Set(all(templates, /check:\s*'([^']+)'/g));
const unionChecks = new Set(all(types, /\|\s*'(artist_[a-z_]+|fan_[a-z_]+)'/g));
const handledChecks = new Set(all(evaluator, /case\s*'([a-z_]+)':/g));
for (const c of usedChecks) {
  if (!unionChecks.has(c)) problems.push(`check '${c}' used in a template but NOT in the DomainCheck union`);
  if (!handledChecks.has(c)) problems.push(`check '${c}' used in a template but NOT handled by an evaluator case`);
}

// 4. Sanity: the journey landmarks exist
for (const need of ['artist_beat_rise_mode', 'artist_ten_supporters', 'artist_create_road_campaign', 'artist_growth_loop']) {
  if (!keySet.has(need)) problems.push(`Missing expected quest key: ${need}`);
}

console.log(`templates: ${keys.length} quests, ${keySet.size} unique keys`);
console.log(`refs checked: ${refs.size}, domain checks used: ${usedChecks.size}`);
if (problems.length) {
  console.error('\nFAILED:\n' + problems.map((p) => ' - ' + p).join('\n'));
  process.exit(1);
}
console.log('\nOK: quest catalog integrity verified.');
