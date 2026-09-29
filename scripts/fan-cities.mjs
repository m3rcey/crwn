// Where an artist's fans are, city by city: the list to plan venue outreach from.
//
// Read-only. Two sources, counted per fan and never double-counted:
//   * fan_contacts.city: the city a fan confirmed on a vote (or an imported contact's city)
//   * earnings.fan_city: the billing city of a fan who PAID (Stripe checkout)
// A fan present in both counts once, under their contact city (the one they told us).
// Paying fans are shown in their own column, because a city with paying fans is a stronger
// venue pitch than a city with only free ones.
//
// Run:  node scripts/fan-cities.mjs <artistSlug>            (table)
//       node scripts/fan-cities.mjs <artistSlug> --csv      (paste into a sheet)

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const slug = process.argv.slice(2).find((a) => !a.startsWith('--'));
const CSV = process.argv.includes('--csv');
if (!slug) { console.error('usage: node scripts/fan-cities.mjs <artistSlug> [--csv]'); process.exit(1); }

const env = readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const db = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

const { data: artist } = await db.from('artist_profiles').select('id').eq('slug', slug).single();
if (!artist) { console.error(`no artist ${slug}`); process.exit(1); }

// "chicago, il" and "Chicago, IL" are one city.
const key = (c) => c.trim().replace(/\s+/g, ' ').toLowerCase();
const label = new Map();
const fans = new Map(); // city key -> Set of fan identities
const paying = new Map();
const add = (map, city, who) => {
  const k = key(city);
  if (!label.has(k)) label.set(k, city.trim());
  if (!map.has(k)) map.set(k, new Set());
  map.get(k).add(who);
};

const { data: contacts } = await db.from('fan_contacts').select('email, city').eq('artist_id', artist.id).not('city', 'is', null);
const contactEmails = new Set();
for (const c of contacts || []) { add(fans, c.city, `e:${c.email}`); contactEmails.add(c.email); }

const { data: earnings } = await db.from('earnings').select('fan_id, fan_city, fan_state').eq('artist_id', artist.id).not('fan_city', 'is', null);
for (const e of earnings || []) {
  const city = e.fan_state ? `${e.fan_city}, ${e.fan_state}` : e.fan_city;
  add(paying, city, `f:${e.fan_id}`);
  add(fans, city, `f:${e.fan_id}`);
}

const rows = [...fans.entries()]
  .map(([k, set]) => ({ city: label.get(k), fans: set.size, paying: paying.get(k)?.size ?? 0 }))
  .sort((a, b) => b.fans - a.fans || b.paying - a.paying);

if (!rows.length) { console.log(`${slug}: no fan cities yet. They arrive with each vote.`); process.exit(0); }
if (CSV) {
  console.log('city,fans,paying');
  for (const r of rows) console.log(`"${r.city.replace(/"/g, '""')}",${r.fans},${r.paying}`);
} else {
  console.log(`${slug}: ${rows.reduce((n, r) => n + r.fans, 0)} located fans in ${rows.length} cities\n`);
  console.log('fans  paying  city');
  for (const r of rows) console.log(`${String(r.fans).padStart(4)}  ${String(r.paying).padStart(6)}  ${r.city}`);
}
