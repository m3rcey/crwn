// Onboard a founder-assisted (ICP) launch artist from ONE reviewed config file.
//
// Content lives in src/lib/offerExperience/reference/<artist>.ts and is registered in
// launchPartners.ts; this script only WRITES it. The workflow around it (probe, write the
// config, dry run, apply, verify, hand-offs) is the skill .claude/skills/onboard-icp-artist.
//
// What it builds, each step idempotent:
//   1. identity      artist_profiles row + public name, the same writes as the wizard's
//                    identity route (no emails sent; trg_promote_to_artist promotes the role)
//   2. ladder        Bronze/Silver/Gold/Platinum at the recommended prices, prose cards
//                    (card_lines prose_only), null Stripe ids until Connect enables charges
//   3. identities    tier_benefits rows, one supported key per approved capability, no cadence
//   4. offers        Tier Offer Experiences for the three paid rungs
//   5. funnel        a DRAFT link funnel (/drop/<token>): primary + downsell rungs
//   6. vote magnet   Song Lab project + open poll + public ballot at /<slug>/join/<offerSlug>,
//                    songs matched by title among the artist's FREE tracks. Skipped (not
//                    failed) while the songs are not uploaded yet.
//   7. content       each rung's tracks, gated from their lowest rung UP (the gate is an exact
//                    match), and the projects as albums. Access is only ever ADDED on a re-run,
//                    never removed, so a re-run can never lock out a paying member.
//   8. winner        --unlock-winner: once the artist records the vote's winner in their Song
//                    Lab manager (CRWN never picks), open that project's Platinum-only tracks
//                    to Gold. Additive, like the release waterfall.
//
// Refuses: a config that fails checkLaunchPartner, a tier whose price differs from the plan,
// any tier with an active subscription, a slug that is taken or reserved.
//
// Run:  npx tsx scripts/onboard-launch-partner.mjs <key>            (dry run)
//       npx tsx scripts/onboard-launch-partner.mjs <key> --apply    (writes)
//       add --refresh-art to re-upload covers, --unlock-winner to open the winner to Gold

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { normalizeOfferExperience } from '../src/lib/offerExperience/normalize.ts';
import { isReservedSlug } from '../src/lib/reservedSlugs.ts';
import { resolveFunnelOffers } from '../src/lib/fanAutomations/offerTiers.ts';
import { normalizeOptions, ballotOpenForFreeJoin } from '../src/lib/songLab/core.ts';
import { fieldsForClass } from '../src/lib/membershipStrategy.ts';
import { albumInsertPayload, albumTrackRows } from '../src/lib/projectUpload.ts';
import { LAUNCH_PARTNERS } from '../src/lib/offerExperience/reference/launchPartners.ts';
import { checkLaunchPartner, LADDER_RUNGS, LADDER_PRICES_CENTS } from '../src/lib/offerExperience/reference/launchPartner.ts';

const key = process.argv.slice(2).find((a) => !a.startsWith('--'));
const APPLY = process.argv.includes('--apply');
// Re-upload each vote song's cover from its artFile even when the track already exists (a
// cover was wrong, or the founder sent the project art later). New object, old one kept.
const REFRESH_ART = process.argv.includes('--refresh-art');
const UNLOCK_WINNER = process.argv.includes('--unlock-winner');
const C = LAUNCH_PARTNERS[key];
const die = (m) => { console.error('ABORT:', m); process.exit(1); };
if (!C) die(`unknown launch partner "${key}". Registered: ${Object.keys(LAUNCH_PARTNERS).join(', ')}`);
const problems = checkLaunchPartner(C);
if (problems.length) die(`config fails the launch checks:\n  - ${problems.join('\n  - ')}`);

const env = readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const db = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});
console.log(`${C.displayName} (${C.key}) | ${APPLY ? 'MODE: APPLY' : 'MODE: DRY RUN (pass --apply to write)'}`);

// ── 1. Identity ────────────────────────────────────────────────────────────────
const { data: { user } } = await db.auth.admin.getUserById(C.userId);
if (!user || user.email !== C.email) die(`auth user ${C.userId} is not ${C.email}`);

let { data: artist } = await db.from('artist_profiles').select('id, slug').eq('user_id', user.id).maybeSingle();
if (artist) {
  console.log(`artist row exists: ${artist.slug} (${artist.id})`);
} else {
  if (isReservedSlug(C.slug)) die(`slug ${C.slug} is reserved`);
  const { data: taken } = await db.from('artist_profiles').select('id').eq('slug', C.slug).maybeSingle();
  if (taken) die(`slug ${C.slug} is taken`);
  console.log(`will create artist row: slug=${C.slug}, display_name="${C.displayName}"`);
  if (APPLY) {
    const { data: row, error } = await db.from('artist_profiles')
      .insert({ user_id: user.id, slug: C.slug, acquisition_source: 'organic' }).select('id, slug').single();
    if (error) die(`artist insert: ${error.message}`);
    artist = row;
  }
}
if (APPLY) {
  const { error } = await db.from('profiles').update({ display_name: C.displayName, onboarding_completed: true }).eq('id', user.id);
  if (error) die(`profile update: ${error.message}`);
}

// ── 1b. Profile photo: the wizard's convention (avatars/<user>/avatar/<ts>.jpg), cropped to
// a centered square because every surface shows it in a circle. Never overwrites a photo the
// artist chose, unless --refresh-art.
if (C.photoFile) {
  if (!existsSync(C.photoFile)) die(`photo not found: ${C.photoFile}`);
  const { data: prof } = await db.from('profiles').select('avatar_url').eq('id', user.id).single();
  if (prof?.avatar_url && !process.argv.includes('--refresh-art')) {
    console.log('profile photo: already set, left alone');
  } else if (!APPLY) {
    console.log(`profile photo: will set from ${C.photoFile}`);
  } else {
    const square = execFileSync('ffmpeg', ['-v', 'error', '-i', C.photoFile, '-vf', "crop='min(iw,ih)':'min(iw,ih)',scale=720:720", '-q:v', '3', '-f', 'mjpeg', 'pipe:1'], { maxBuffer: 20 * 1024 * 1024 });
    const path = `${user.id}/avatar/${Date.now()}.jpg`;
    const { error: upErr } = await db.storage.from('avatars').upload(path, square, { contentType: 'image/jpeg', upsert: false });
    if (upErr) die(`photo upload: ${upErr.message}`);
    const url = db.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    const { error } = await db.from('profiles').update({ avatar_url: url }).eq('id', user.id);
    if (error) die(`photo save: ${error.message}`);
    console.log(`profile photo: set (${path})`);
  }
}
if (!artist) { console.log('\n(dry run stops here: everything else hangs off the artist row)'); process.exit(0); }

// ── 2. Ladder ──────────────────────────────────────────────────────────────────
const { data: existing } = await db.from('subscription_tiers')
  .select('id, name, price, access_config').eq('artist_id', artist.id).eq('is_active', true);
const tierIds = {};
for (const name of LADDER_RUNGS) {
  const price = LADDER_PRICES_CENTS[name];
  const access_config = { benefits: C.benefits[name], card_lines: 'prose_only' };
  const found = (existing || []).find((t) => t.name === name);
  if (found) {
    if (found.price !== price) die(`${name} exists at ${found.price}, plan says ${price}; refusing`);
    const { count } = await db.from('subscriptions').select('id', { count: 'exact', head: true }).eq('tier_id', found.id).eq('status', 'active');
    if (count) die(`${name} has ${count} active subscriptions; refusing to rewrite a sold tier`);
    console.log(`${name}: exists (${found.id}), will set promise + prose`);
    if (APPLY) {
      const { error } = await db.from('subscription_tiers')
        .update({ description: C.promises[name], access_config: { ...(found.access_config || {}), ...access_config } })
        .eq('id', found.id).eq('artist_id', artist.id);
      if (error) die(`${name} update: ${error.message}`);
    }
    tierIds[name] = found.id;
  } else {
    console.log(`${name}: will create at $${price / 100}/mo, "${C.promises[name]}"`);
    if (APPLY) {
      const { data: row, error } = await db.from('subscription_tiers').insert({
        artist_id: artist.id, name, price, description: C.promises[name], is_active: true,
        offers_annual: true, annual_discount_percent: 25, access_config,
        stripe_price_id: null, stripe_annual_price_id: null, stripe_product_id: null,
      }).select('id').single();
      if (error) die(`${name} insert: ${error.message}`);
      tierIds[name] = row.id;
    }
  }
}

// ── 6 (planned in dry run too). Vote magnet songs ───────────────────────────────
/** Seconds from the WAV header, walking RIFF chunks (same as upload-gb-tracks.mjs). */
function wavDuration(path) {
  const b = readFileSync(path);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a RIFF/WAVE file: ' + path);
  let off = 12; let byteRate = 0;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4); const size = b.readUInt32LE(off + 4);
    if (id === 'fmt ') byteRate = b.readUInt32LE(off + 16);
    if (id === 'data') return Math.round(size / byteRate);
    off += 8 + size + (size % 2);
  }
  throw new Error('no data chunk: ' + path);
}

/** A cover to `album-art/<artist>/album-art/<ts>.<ext>`, the Studio convention. */
async function uploadArt(o) {
  const artExt = o.artFile.split('.').pop().toLowerCase();
  const artPath = `${artist.id}/album-art/${Date.now()}.${artExt}`;
  const { error: artErr } = await db.storage.from('album-art').upload(artPath, readFileSync(o.artFile), { contentType: artExt === 'png' ? 'image/png' : 'image/jpeg', upsert: false });
  if (artErr) die(`${o.trackTitle} cover upload: ${artErr.message}`);
  return db.storage.from('album-art').getPublicUrl(artPath).data.publicUrl;
}

/** Seconds for any audio file: the WAV header when it is one, ffprobe otherwise. */
function audioDuration(path) {
  if (path.toLowerCase().endsWith('.wav')) return wavDuration(path);
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]).toString().trim();
  const secs = Math.round(Number(out));
  if (!Number.isFinite(secs) || secs <= 0) die(`could not read the duration of ${path}`);
  return secs;
}
const mmss = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
const AUDIO_TYPES = { wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4', flac: 'audio/flac', aiff: 'audio/aiff', aif: 'audio/aiff' };

/** Upload a track exactly as the Studio upload form does: the file to `audio`, the cover to
 *  `album-art`, access from fieldsForClass (the ONE owner of is_free / allowed_tier_ids /
 *  public_release_date), then a 128 kbps stream copy through the one transcode script for a
 *  lossless master (an mp3 already is a stream). Returns the new track id. */
async function uploadTrack(o, position, access) {
  const ext = o.file.split('.').pop().toLowerCase();
  if (!AUDIO_TYPES[ext]) die(`${o.file}: unsupported audio type .${ext}`);
  const bytes = readFileSync(o.file);
  const audioPath = `${artist.id}/${Date.now()}.${ext}`;
  const { error: upErr } = await db.storage.from('audio').upload(audioPath, bytes, { contentType: AUDIO_TYPES[ext], upsert: false });
  if (upErr) die(`${o.trackTitle} upload: ${upErr.message}`);
  const audioUrl = db.storage.from('audio').getPublicUrl(audioPath).data.publicUrl;
  const artUrl = o.artFile ? await uploadArt(o) : null;
  const { data: row, error } = await db.from('tracks').insert({
    artist_id: artist.id, title: o.trackTitle, audio_url_128: audioUrl, audio_url_320: audioUrl,
    album_art_url: artUrl, duration: audioDuration(o.file), position, ...access, is_active: true,
  }).select('id').single();
  if (error) die(`${o.trackTitle} track insert: ${error.message}`);
  if (['wav', 'flac', 'aiff', 'aif'].includes(ext)) {
    execFileSync('node', ['scripts/transcode-audio.mjs', '--apply', '--limit', '1', '--id', row.id], { stdio: 'inherit' });
  }
  return row.id;
}

let voteTracks = null;
if (C.vote && C.vote.options.length) {
  let { data: tracks } = await db.from('tracks').select('id, title, is_free, allowed_tier_ids, public_release_date').eq('artist_id', artist.id);
  voteTracks = [];
  const missing = [];
  for (const [i, o] of C.vote.options.entries()) {
    let t = (tracks || []).find((x) => x.title.trim().toLowerCase() === o.trackTitle.trim().toLowerCase());
    if (!t && o.file) {
      if (!existsSync(o.file)) { missing.push(`"${o.trackTitle}" file not found: ${o.file}`); continue; }
      if (o.artFile && !existsSync(o.artFile)) { missing.push(`"${o.trackTitle}" cover not found: ${o.artFile}`); continue; }
      if (!APPLY) { console.log(`will upload "${o.trackTitle}" (${mmss(audioDuration(o.file))}) as a free track, position ${i}`); voteTracks.push({ label: o.label, trackId: 'pending-upload' }); continue; }
      const id = await uploadTrack(o, i, fieldsForClass('free_forever'));
      t = { id, title: o.trackTitle, is_free: true, allowed_tier_ids: [], public_release_date: null };
      console.log(`uploaded "${o.trackTitle}" as a free track (${id})`);
    }
    if (!t) { missing.push(`"${o.trackTitle}" not uploaded`); continue; }
    if (REFRESH_ART && o.artFile && t.id !== 'pending-upload') {
      if (!existsSync(o.artFile)) { missing.push(`"${o.trackTitle}" cover not found: ${o.artFile}`); continue; }
      if (APPLY) {
        const url = await uploadArt(o);
        const { error } = await db.from('tracks').update({ album_art_url: url, updated_at: new Date().toISOString() }).eq('id', t.id).eq('artist_id', artist.id);
        if (error) die(`${o.trackTitle} cover update: ${error.message}`);
        console.log(`cover for "${o.trackTitle}" set from ${o.artFile}`);
      } else console.log(`will set the cover for "${o.trackTitle}" from ${o.artFile}`);
    }
    const windowOpen = t.public_release_date && new Date(t.public_release_date) > new Date() && (t.allowed_tier_ids || []).length;
    if (!t.is_free || windowOpen) { missing.push(`"${o.trackTitle}" is not free forever (fans could not hear it)`); continue; }
    voteTracks.push({ label: o.label, trackId: t.id });
  }
  if (missing.length) { console.log(`\nvote magnet WAITS: ${missing.join('; ')}`); voteTracks = null; }
  else console.log(`\nvote magnet: ${voteTracks.length} songs found, will open the poll at /${artist.slug}/join/${C.vote.offerSlug}`);
} else if (C.vote) {
  console.log('\nvote magnet WAITS: no songs listed in the config yet');
}
// ── 7 (planned in dry run too). Rung content ─────────────────────────────────────
/** Every rung from `rung` up, as tier ids: the gate matches exactly, with no inheritance. */
const tiersFrom = (rung) => LADDER_RUNGS.slice(LADDER_RUNGS.indexOf(rung)).map((r) => tierIds[r]).filter(Boolean);
const contentIds = {};
if (C.content) {
  const { data: have } = await db.from('tracks').select('id, title, is_free, allowed_tier_ids').eq('artist_id', artist.id);
  console.log('');
  for (const [i, t] of C.content.tracks.entries()) {
    if (!existsSync(t.file)) die(`${t.title}: file not found: ${t.file}`);
    if (t.artFile && !existsSync(t.artFile)) die(`${t.title}: cover not found: ${t.artFile}`);
    const want = tiersFrom(t.rung);
    const found = (have || []).find((x) => x.title.trim().toLowerCase() === t.title.trim().toLowerCase());
    const tag = t.placeholder ? ' [PLACEHOLDER]' : '';
    if (!found) {
      console.log(`${APPLY ? 'uploading' : 'will upload'} "${t.title}" (${mmss(audioDuration(t.file))}) for ${t.rung} and up${tag}`);
      if (APPLY) contentIds[t.title] = await uploadTrack({ ...t, trackTitle: t.title }, (C.vote?.options.length ?? 0) + i, fieldsForClass('member_only', { tierIds: want }));
      continue;
    }
    contentIds[t.title] = found.id;
    // ADD missing rungs only. A tier already on the track (a winner opened to Gold) stays.
    const current = Array.isArray(found.allowed_tier_ids) ? found.allowed_tier_ids : [];
    const merged = [...new Set([...current, ...want])];
    if (merged.length !== current.length || found.is_free) {
      console.log(`${APPLY ? 'opening' : 'will open'} "${found.title}" to ${t.rung} and up`);
      if (APPLY) {
        const { error } = await db.from('tracks').update({ ...fieldsForClass('member_only', { tierIds: merged }), updated_at: new Date().toISOString() }).eq('id', found.id).eq('artist_id', artist.id);
        if (error) die(`${found.title} access: ${error.message}`);
      }
    }
    if (REFRESH_ART && t.artFile && APPLY) {
      const url = await uploadArt({ ...t, trackTitle: t.title });
      const { error } = await db.from('tracks').update({ album_art_url: url }).eq('id', found.id).eq('artist_id', artist.id);
      if (error) die(`${found.title} cover: ${error.message}`);
    }
  }
  for (const p of C.content.projects) console.log(`project "${p.title}": ${p.trackTitles.length} tracks`);
}

if (!APPLY) { console.log('\n(dry run: benefits, offers, funnel, poll and projects are written on --apply)'); process.exit(0); }

// ── 3. Structured benefit identities (no frequency: nothing lands on the calendar) ──
for (const name of LADDER_RUNGS) {
  const rows = C.identities[name].map((it, i) => ({ tier_id: tierIds[name], benefit_type: it.key, config: {}, is_active: true, sort_order: i }));
  const { error: delErr } = await db.from('tier_benefits').delete().eq('tier_id', tierIds[name]);
  if (delErr) die(`${name} benefit delete: ${delErr.message}`);
  if (rows.length) {
    const { error } = await db.from('tier_benefits').insert(rows);
    if (error) die(`${name} benefit insert: ${error.message}`);
  }
}

// ── 4. Tier Offer Experiences ──────────────────────────────────────────────────
for (const [name, config] of Object.entries(C.offers)) {
  const { error } = await db.from('tier_offer_experiences').upsert(
    { artist_id: artist.id, tier_id: tierIds[name], config, is_active: true, updated_at: new Date().toISOString() },
    { onConflict: 'tier_id' },
  );
  if (error) die(`${name} offer write: ${error.message}`);
}

// ── 5. Draft drop-page funnel ──────────────────────────────────────────────────
let { data: funnel } = await db.from('fan_automations').select('id').eq('artist_id', artist.id).neq('status', 'archived').maybeSingle();
const pointers = {
  gold_tier_id: tierIds[C.funnelPrimary], silver_tier_id: tierIds[C.funnelDownsell],
  gold_item_title: C.funnelPrimaryItem.title, gold_item_description: C.funnelPrimaryItem.description,
  updated_at: new Date().toISOString(),
};
if (funnel) {
  const { error } = await db.from('fan_automations').update(pointers).eq('id', funnel.id);
  if (error) die(`funnel update: ${error.message}`);
} else {
  const { data: row, error } = await db.from('fan_automations').insert({
    artist_id: artist.id, provider: 'link', status: 'draft', public_token: randomBytes(9).toString('base64url'), ...pointers,
  }).select('id').single();
  if (error) die(`funnel insert: ${error.message}`);
  funnel = row;
}
// The drop funnel's lead magnet: a track of the artist's, matched by title. It keeps its rung
// gate; the claim route hands the claimer a signed link that expires (see its header).
if (C.drop) {
  const { data: magnet } = await db.from('tracks').select('id, title').eq('artist_id', artist.id)
    .ilike('title', C.drop.magnetTrackTitle).maybeSingle();
  if (!magnet) {
    console.log(`drop funnel WAITS: no track titled "${C.drop.magnetTrackTitle}"`);
  } else {
    const { data: cur } = await db.from('fan_automations').select('status, activated_at').eq('id', funnel.id).single();
    const live = C.drop.live
      ? { status: 'active', ...(cur?.activated_at ? {} : { activated_at: new Date().toISOString() }) }
      : {};
    const { error } = await db.from('fan_automations').update({
      magnet_kind: 'track', magnet_track_id: magnet.id, magnet_file_key: null, magnet_file_name: null,
      magnet_title: C.drop.magnetTitle, magnet_description: C.drop.magnetDescription, ...live,
    }).eq('id', funnel.id);
    if (error) die(`drop magnet: ${error.message}`);
  }
}

// ── 6. Vote magnet ─────────────────────────────────────────────────────────────
if (voteTracks) {
  const v = C.vote;
  const options = normalizeOptions(voteTracks);
  if (!options || options.some((o) => !o.trackId)) die('vote options lost their songs in normalization');
  const { error: flagErr } = await db.from('artist_profiles').update({ song_lab_enabled: true }).eq('id', artist.id);
  if (flagErr) die(`song_lab_enabled: ${flagErr.message}`);

  let { data: project } = await db.from('song_lab_projects').select('id').eq('artist_id', artist.id).eq('title', v.projectTitle).maybeSingle();
  if (!project) {
    const { data, error } = await db.from('song_lab_projects').insert({ artist_id: artist.id, title: v.projectTitle }).select('id').single();
    if (error) die(`project insert: ${error.message}`);
    project = data;
  }
  let { data: poll } = await db.from('song_lab_decisions').select('id, status').eq('project_id', project.id).eq('stage_label', v.stageLabel).maybeSingle();
  if (poll) {
    // Never rewrite the options of a poll that already has votes: ids by position keep a
    // cast vote on its choice, but a changed SONG under the same id would move it.
    const { count } = await db.from('song_lab_votes').select('id', { count: 'exact', head: true }).eq('decision_id', poll.id);
    const { count: pub } = await db.from('song_lab_public_votes').select('id', { count: 'exact', head: true }).eq('decision_id', poll.id);
    if ((count || 0) + (pub || 0) > 0) console.log(`poll has ${(count || 0) + (pub || 0)} votes: options left untouched`);
    else {
      const { error } = await db.from('song_lab_decisions').update({ question: v.question, options, status: 'open', is_free: true, allowed_tier_ids: [] }).eq('id', poll.id);
      if (error) die(`poll update: ${error.message}`);
    }
  } else {
    const { data, error } = await db.from('song_lab_decisions').insert({
      project_id: project.id, artist_id: artist.id, stage_label: v.stageLabel, question: v.question,
      options, status: 'open', is_free: true, allowed_tier_ids: [],
    }).select('id, status').single();
    if (error) die(`poll insert: ${error.message}`);
    poll = data;
  }
  const offerRow = {
    artist_id: artist.id, slug: v.offerSlug, name: v.offerName, headline: v.headline, description: v.description,
    benefit_kind: 'vote', project_id: project.id, decision_id: poll.id, tier_id: tierIds.Bronze, is_active: true,
    updated_at: new Date().toISOString(),
  };
  const { error: offerErr } = await db.from('song_lab_offers').upsert(offerRow, { onConflict: 'artist_id,slug' });
  if (offerErr) die(`ballot offer: ${offerErr.message}`);
}

// ── 7b. Projects as albums ─────────────────────────────────────────────────────
if (C.content) {
  const { data: all } = await db.from('tracks').select('id, title').eq('artist_id', artist.id);
  const idOf = (title) => (all || []).find((x) => x.title.trim().toLowerCase() === title.trim().toLowerCase())?.id;
  for (const p of C.content.projects) {
    let { data: album } = await db.from('albums').select('id, album_art_url').eq('artist_id', artist.id).eq('title', p.title).maybeSingle();
    if (!album) {
      const art = p.artFile ? await uploadArt({ trackTitle: p.title, artFile: p.artFile }) : null;
      // The album itself is open to browse; each TRACK carries its own gate, so the vote song
      // plays for anyone and the rest shows its lock.
      const { data, error } = await db.from('albums').insert(albumInsertPayload({ artistId: artist.id, title: p.title, albumArtUrl: art, access: { isFree: true, allowedTierIds: [] } })).select('id, album_art_url').single();
      if (error) die(`album ${p.title}: ${error.message}`);
      album = data;
    } else if (REFRESH_ART && p.artFile) {
      const art = await uploadArt({ trackTitle: p.title, artFile: p.artFile });
      await db.from('albums').update({ album_art_url: art }).eq('id', album.id);
    }
    const ids = p.trackTitles.map(idOf);
    if (ids.some((x) => !x)) die(`album ${p.title}: a listed track is not uploaded`);
    const { error } = await db.from('album_tracks').upsert(albumTrackRows(album.id, ids, 1), { onConflict: 'album_id,track_id' });
    if (error) die(`album ${p.title} tracks: ${error.message}`);
  }
}

// ── 8. Open the recorded winner to Gold (only with --unlock-winner) ───────────
if (UNLOCK_WINNER) {
  if (!C.vote || !C.content) die('--unlock-winner needs a vote and content');
  const { data: offerRow } = await db.from('song_lab_offers').select('decision_id').eq('artist_id', artist.id).eq('slug', C.vote.offerSlug).single();
  const { data: poll } = await db.from('song_lab_decisions').select('options, winning_option_id').eq('id', offerRow.decision_id).single();
  if (!poll.winning_option_id) die('no winner is recorded yet. The artist records it in their Song Lab manager; CRWN never picks one.');
  const label = poll.options.find((o) => o.id === poll.winning_option_id)?.label;
  const project = C.content.projects.find((p) => p.voteLabel === label);
  if (!project) die(`the winner "${label}" has no project in the config`);
  const platinumOnly = C.content.tracks.filter((t) => t.rung === 'Platinum' && project.trackTitles.includes(t.title));
  const { data: rows } = await db.from('tracks').select('id, title, allowed_tier_ids').eq('artist_id', artist.id).in('title', platinumOnly.map((t) => t.title));
  for (const r of rows || []) {
    const merged = [...new Set([...(r.allowed_tier_ids || []), tierIds.Gold])];
    const { error } = await db.from('tracks').update({ ...fieldsForClass('member_only', { tierIds: merged }), updated_at: new Date().toISOString() }).eq('id', r.id).eq('artist_id', artist.id);
    if (error) die(`${r.title}: ${error.message}`);
    console.log(`opened "${r.title}" to Gold (winner: ${label})`);
  }
}

// ── Read-back through the same paths the pages use ────────────────────────────
console.log('\n================ READ-BACK ================');
const { data: prof } = await db.from('profiles').select('display_name, role').eq('id', user.id).single();
console.log('profile:', JSON.stringify(prof));
if (prof.role !== 'artist') die('role was not promoted to artist');
const { data: tiers } = await db.from('subscription_tiers')
  .select('id, name, price, description, is_active, access_config, stripe_price_id').eq('artist_id', artist.id).eq('is_active', true).order('price');
for (const t of tiers) {
  const { data: b } = await db.from('tier_benefits').select('benefit_type, config').eq('tier_id', t.id).order('sort_order');
  if ((b || []).some((r) => r.config?.frequency)) die(`${t.name}: a frequency was written`);
  console.log(`${t.name.padEnd(9)} $${String(t.price / 100).padEnd(4)} "${t.description}" | ${t.access_config?.benefits?.length} lines | keys: ${(b || []).map((r) => r.benefit_type).join(', ')} | stripe: ${t.stripe_price_id ? 'yes' : 'pending connect'}`);
}
for (const name of Object.keys(C.offers)) {
  const { data: row } = await db.from('tier_offer_experiences').select('config, is_active').eq('tier_id', tierIds[name]).single();
  const back = normalizeOfferExperience(row.config, name);
  if (!back) die(`${name} stored offer fails the read contract`);
  console.log(`${name} offer: active=${row.is_active} cta="${back.cta}" previews=${back.previews.length}`);
}
const { data: f } = await db.from('fan_automations').select('status, public_token, gold_tier_id, silver_tier_id, magnet_title, magnet_kind').eq('id', funnel.id).single();
const { primary, downsell } = resolveFunnelOffers(tiers, f);
console.log(`funnel: ${f.status} /drop/${f.public_token} | primary=${primary?.name} downsell=${downsell?.name}`);
if (primary?.name !== C.funnelPrimary || downsell?.name !== C.funnelDownsell) die('funnel does not resolve to the configured rungs');
if (voteTracks) {
  const { data: offer } = await db.from('song_lab_offers').select('slug, is_active, decision_id, tier_id').eq('artist_id', artist.id).eq('slug', C.vote.offerSlug).single();
  const { data: poll } = await db.from('song_lab_decisions').select('id, status, options, is_free, allowed_tier_ids, opens_at, closes_at, winning_option_id').eq('id', offer.decision_id).single();
  const open = ballotOpenForFreeJoin(poll, offer.tier_id, new Date());
  console.log(`vote ballot: ${open ? 'OPEN to anyone' : 'NOT OPEN'} | ${poll.options.length} songs | joins Bronze=${offer.tier_id === tierIds.Bronze}`);
  if (!open) die('the ballot would not render for a new fan');
  console.log(`ballot link: https://thecrwn.app/${artist.slug}/join/${C.vote.offerSlug}`);
}
console.log(`\npublic page: https://thecrwn.app/${artist.slug}`);
console.log(f.status === 'active'
  ? `drop funnel LIVE: https://thecrwn.app/drop/${f.public_token} (magnet: ${f.magnet_title || 'none'})`
  : `drop page (owner-only preview while draft): https://thecrwn.app/drop/${f.public_token}`);
