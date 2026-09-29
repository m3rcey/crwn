// Prince Dre: the SECOND reference configuration, built from the founder-assisted launch
// blueprint (Prince_Dre_CRWN_Launch_Blueprint.pdf) and the founder's 2026-09-28 ladder:
// every rung gives progressively more of the exact thing his fans asked for, his unreleased
// music from three projects (The Return Of The Prince, Fresh Prince Of O'Block, Only The O
// In My Eyes). scripts/onboard-launch-partner.mjs writes all of it to production.
//
//   Vote (free, no account)  hear one song from each project, vote on which unlocks first
//   Bronze (free, on vote)   the sampler + a bonus unreleased song ("Hannn", from Blood Brothaz)
//   Silver $10               Blood Brothaz, complete (never on streaming)
//   Gold $25                 Shotta In Da Jungle, complete, + the WINNING project on DRE_FIRST_UNLOCK_DATE
//   Platinum $100            everything, the 3 vote projects as Dre adds them, first listen next
//
// The vote never closes: a closed ballot stops capturing fans, and the street-team run lasts
// weeks. "The most votes by DRE_FIRST_UNLOCK_DATE" decides the first unlock; Dre records the
// winner in his Song Lab manager (CRWN never picks) and `--unlock-winner` opens it to Gold.
//
// Deliberately NOT carried: merch (CRWN sells no physical goods), "limited" anything (the
// only real cap is the Founder Window), "priority" (nothing enforces it), any schedule.
//
// NO PLACEHOLDER AUDIO (founder, 2026-09-29): the stand-in beats were removed. What is on his
// page is real: the three vote songs, Blood Brothaz and Shotta In Da Jungle. The three vote
// projects' full songs arrive from his team (TODO); until then the copy says "as Dre adds them".

import type { TierOfferExperience } from '../types';
import type { LaunchPartnerConfig } from './launchPartner';

export const DRE_SLUG = 'princedre';
export const DRE_DISPLAY_NAME = 'Prince Dre';
/** The mixtape's release day: the vote count on this day decides the first Gold unlock. */
export const DRE_FIRST_UNLOCK_DATE = 'October 1';

const ROTP = 'The Return Of The Prince';
const FPOB = "Fresh Prince Of O'Block";
const OTOIME = 'Only The O In My Eyes';
// The covers as they are served from his page (public album-art objects), so the offer
// cards show the actual projects. Plain public https: the offer normalizer accepts these.
const ART_BASE = 'https://ecpqtuidtsncjfwtkvwc.supabase.co/storage/v1/object/public/album-art/afa05eb6-da91-438a-8e28-3952c1bded83/album-art/';
const ART = {
  [ROTP]: `${ART_BASE}1790642982534.jpg`,
  [FPOB]: `${ART_BASE}1790642985217.jpg`,
  [OTOIME]: `${ART_BASE}1790642989221.jpg`,
};
// Photos for the offer (scripts/generate-offer-photos.mjs, 2026-09-28): realistic studio photos of
// him generated from his current-look reference photos (founder direction: real-looking photos
// of the artist on his own page, not brand art), uploaded to his public album-art folder.
const OFFER_ART = 'https://ecpqtuidtsncjfwtkvwc.supabase.co/storage/v1/object/public/album-art/afa05eb6-da91-438a-8e28-3952c1bded83/offer/';
// Two complete projects that were never on streaming (founder, 2026-09-29), placed by the
// blueprint: BloodBrothaz is "Bronze + Silver archive" (paid archive, so Silver and up), and
// Shotta In Da Jungle, not named there, goes where the blueprint puts "the unreleased parallel
// discography": Gold. Real songs, so their previews are truth: 'real'.
const BB = 'Blood Brothaz';
const SJ = 'Shotta In Da Jungle';
const BB_DIR = 'videos/prince dre/Blood Brothaz';
const SJ_DIR = 'videos/prince dre/Shotta In Da Jungle';
const BB_SONGS = ['Rebirth (Intro)', 'Hannn', 'Brothers Pt 2', 'All I Know', 'Im A Ridah', 'Turn Up', 'People', 'In Dese Streets', 'Hide N Seek', 'Ready For War', 'Been On My Mind', 'Letter To LA - JMoney', 'Close Yo Mouth', 'I Swear', 'Lately'];
const SJ_SONGS = ['Intro Danger', 'Round Here', 'Block Head', 'Glizzied Up', 'With Me', 'Taking Chances', 'On Nat Block', 'From The O', 'Cuz', 'TurntUp4JMunna'];
/** The Bronze bonus song: a real unreleased song, the one every vote promises. */
const BONUS_SONG = 'Hannn';
const COVER = {
  [ROTP]: 'videos/output/Prince Dre - The Return Of The Prince.jpg',
  [FPOB]: 'videos/output/Prince Dre - Fresh Prince Of O Block.jpg',
  [OTOIME]: 'videos/output/prince dre - Only The O In My Eyes.jpg',
  [BB]: `${BB_DIR}/Blood Brothaz (Cover Art).jpg`,
  [SJ]: `${SJ_DIR}/Shotta In Da Jungle (Cover Art).jpg`,
};

export const DRE_TIER_PROMISES: Record<string, string> = {
  Bronze: 'Hear the unreleased sampler.',
  Silver: 'A whole project the public never got.',
  Gold: 'Get the full project the fans pick.',
  Platinum: 'Every unreleased project, first.',
};

export const DRE_TIER_PRICES_CENTS: Record<string, number> = {
  Bronze: 0,
  Silver: 1000,
  Gold: 2500,
  Platinum: 10000,
};

// Each card leads with what the fan gets THE MOMENT they join (founder, 2026-09-28); the
// "Everything in" line is last, because a stranger reads the top of a card, not the bottom.
export const DRE_APPROVED_BENEFITS: Record<string, string[]> = {
  Bronze: [
    'The unreleased sampler: one song from each of the 3 projects',
    'A bonus unreleased song, unlocked when you join',
    'A vote on which project Dre unlocks first',
    'First word on the mixtape and every drop',
  ],
  Silver: [
    'Blood Brothaz: the complete 15-song project, never on streaming',
    'Behind the scenes from every era',
    'Everything in Bronze',
  ],
  Gold: [
    'Shotta In Da Jungle: the complete 10-song project, never on streaming',
    'The Vault: cuts, alternate versions and unreleased videos as Dre adds them',
    `The complete winning project, unlocked ${DRE_FIRST_UNLOCK_DATE}`,
    'Everything in Silver',
  ],
  Platinum: [
    'All 3 vote projects, complete, the moment Dre adds each one',
    'Blood Brothaz and Shotta In Da Jungle, complete, today',
    'First listen to the project after the mixtape, before anyone else',
    'Group listening sessions when Dre opens one',
    'Platinum recognition',
    'Everything in Gold',
  ],
};

/** One registry key per DISTINCT capability, on the lowest rung that promises it. */
export const DRE_BENEFIT_IDENTITIES: Record<string, { key: string; line: string }[]> = {
  Bronze: [
    { key: 'welcome_unlock', line: 'A bonus unreleased song, unlocked when you join' },
    { key: 'creative_voting', line: 'A vote on which project Dre unlocks first' },
    { key: 'drop_alerts', line: 'First word on the mixtape and every drop' },
  ],
  Silver: [
    { key: 'exclusive_tracks', line: 'Blood Brothaz: the complete 15-song project, never on streaming' },
    { key: 'exclusive_posts', line: 'Behind the scenes from every era' },
  ],
  Gold: [
    { key: 'vault_collection', line: 'The Vault: cuts, alternate versions and unreleased videos as Dre adds them' },
  ],
  Platinum: [
    { key: 'early_access', line: 'First listen to the project after the mixtape, before anyone else' },
    { key: 'group_live_qa', line: 'Group listening sessions when Dre opens one' },
    { key: 'member_recognition', line: 'Platinum recognition' },
  ],
};

/** The funnel's standout item for the PRIMARY offer, shown only where a rung has no full
 *  offer experience. */
export const DRE_FUNNEL_PRIMARY_ITEM = {
  title: 'Every unreleased project, first',
  description:
    'Everyone else waits for the vote. Platinum gets all 3 projects as Dre adds each one, plus Blood Brothaz and Shotta In Da Jungle today.',
};

// Dre has not shot his video yet (founder, 2026-09-28): the slot shows the COVER of the video
// he is about to make, as a non-playable still with "coming soon". When he records it, set
// `url` to the hosted mp4 and the same slot becomes the player.
const STAND_IN_VSL = {
  url: null,
  posterUrl: 'https://ecpqtuidtsncjfwtkvwc.supabase.co/storage/v1/object/public/album-art/afa05eb6-da91-438a-8e28-3952c1bded83/offer/photo-vsl-thumb.webp',
};

export const DRE_PLATINUM_OFFER: TierOfferExperience = {
  promise: 'Every unreleased project, first.',
  description: `Everyone else waits to see which project wins the vote. Platinum gets ${ROTP}, ${FPOB} and ${OTOIME}, complete, the moment Dre adds each one, plus Blood Brothaz and Shotta In Da Jungle today.`,
  cta: 'Unlock All 3 Projects',
  secondaryCue: 'See what you get',
  heroImageUrl: `${OFFER_ART}photo-hero-platinum.webp`,
  vsl: STAND_IN_VSL,
  previews: [
    {
      kind: 'collection',
      truth: 'example',
      title: 'All 3 projects, complete',
      description: 'Not a sampler. Every song on every project, the moment Dre adds it.',
      items: [
        { title: ROTP, subtitle: 'Complete project', locked: true, artUrl: ART[ROTP] },
        { title: FPOB, subtitle: 'Complete project', locked: true, artUrl: ART[FPOB] },
        { title: OTOIME, subtitle: 'Complete project', locked: true, artUrl: ART[OTOIME] },
      ],
    },
    {
      kind: 'session',
      truth: 'example',
      title: 'Group listening sessions',
      description: 'When Dre opens a listening room for the next project, Platinum is in it. No fixed schedule is promised; when it happens, you are there.',
      posterUrl: `${OFFER_ART}photo-session-listening.webp`,
    },
    {
      // Fans do not know Dre has a community on CRWN, so this card introduces it AND shows
      // where they would sit in it. The pill is the real one: /api/recognition labels a
      // member's name with their rung on every post and comment on his page.
      kind: 'status',
      truth: 'example',
      title: "Dre's community on CRWN",
      description: 'Dre posts here for his fans, and fans talk under every post. Platinum shows beside your name every time you comment.',
      badge: 'PLATINUM',
      thread: [
        { name: 'Tay', badge: 'Gold', text: 'Return Of The Prince better win this vote.' },
        { name: 'You', badge: 'Platinum', text: 'Shotta In Da Jungle on repeat. Wishing Well is crazy.', you: true },
        { name: 'Mook', badge: 'Bronze', text: 'How do I hear the full projects?' },
      ],
    },
  ],
  inherited: {
    heading: 'Also included',
    items: [
      'Shotta In Da Jungle and Blood Brothaz, complete',
      'The complete winning project',
      'The Vault as Dre adds to it',
      'The sampler and the bonus song',
    ],
  },
  faqs: [
    {
      q: 'What if I only want the project that wins?',
      a: `The $25 a month level gets the one project that wins the vote, unlocked ${DRE_FIRST_UNLOCK_DATE}. This level gets all 3 projects complete as Dre adds each one, and hears the project after the mixtape first.`,
    },
    {
      q: 'Is the mixtape included?',
      a: 'The mixtape drops everywhere, free to stream. These are the projects the public never got.',
    },
    {
      q: 'Can I cancel?',
      a: 'Any time. Your access runs to the end of the billing period you already paid for.',
    },
  ],
};

export const DRE_GOLD_OFFER: TierOfferExperience = {
  promise: 'Get the full project the fans pick.',
  description: `Shotta In Da Jungle, all 10 songs, never on streaming, the moment you join. Then the project with the most votes by ${DRE_FIRST_UNLOCK_DATE} unlocks for you too, every song on it.`,
  cta: 'Unlock the Winning Project',
  secondaryCue: 'See what you get',
  heroImageUrl: `${OFFER_ART}photo-hero-gold.webp`,
  vsl: STAND_IN_VSL,
  previews: [
    {
      kind: 'audio',
      truth: 'real',
      title: `${SJ}, today`,
      description: 'The complete project, never on streaming. Yours the moment you join.',
      items: SJ_SONGS.slice(0, 5).map((t) => ({ title: t, subtitle: SJ, locked: true })),
      actionLabel: 'Unlock the music',
    },
    {
      kind: 'collection',
      truth: 'example',
      title: `One of these unlocks ${DRE_FIRST_UNLOCK_DATE}`,
      description: 'Whichever project the fans vote up unlocks for you, complete.',
      items: [
        { title: ROTP, subtitle: 'Complete project', locked: true, artUrl: ART[ROTP] },
        { title: FPOB, subtitle: 'Complete project', locked: true, artUrl: ART[FPOB] },
        { title: OTOIME, subtitle: 'Complete project', locked: true, artUrl: ART[OTOIME] },
      ],
    },
    {
      kind: 'video',
      truth: 'example',
      title: 'The Vault',
      description: 'Cuts, alternate versions and unreleased videos, posted for members as Dre adds them.',
      posterUrl: `${OFFER_ART}photo-video-vault.webp`,
    },
    {
      kind: 'status',
      truth: 'example',
      title: "Dre's community on CRWN",
      description: 'Dre posts here for his fans, and fans talk under every post. Gold shows beside your name every time you comment.',
      badge: 'GOLD',
      thread: [
        { name: 'You', badge: 'Gold', text: 'Fresh Prince Of O\'Block all day.', you: true },
        { name: 'Jaye', badge: 'Silver', text: 'Blood Brothaz alone was worth it.' },
        { name: 'Mook', badge: 'Bronze', text: 'How do I hear the full projects?' },
      ],
    },
  ],
  inherited: {
    heading: 'Also included',
    items: [
      'Blood Brothaz, the complete project',
      'Behind the scenes from every era',
      'The sampler and the bonus song',
    ],
  },
  faqs: [
    {
      q: 'What if the project I voted for does not win?',
      a: `The project with the most votes by ${DRE_FIRST_UNLOCK_DATE} is the one that unlocks here. If you want every project no matter what wins, the $100 a month level gets all 3 as Dre adds each one.`,
    },
    {
      q: 'Is the mixtape included?',
      a: 'The mixtape drops everywhere, free to stream. These are the projects the public never got.',
    },
    {
      q: 'Can I cancel?',
      a: 'Any time. Your access runs to the end of the billing period you already paid for.',
    },
  ],
};

export const DRE_SILVER_OFFER: TierOfferExperience = {
  promise: 'A whole project the public never got.',
  description: 'Blood Brothaz, all 15 songs, never on streaming. Yours the moment you join.',
  cta: 'Get Blood Brothaz',
  secondaryCue: 'See what you get',
  vsl: { url: null },
  previews: [
    {
      kind: 'audio',
      truth: 'real',
      title: `${BB}, today`,
      description: 'The complete project, never on streaming.',
      items: BB_SONGS.slice(0, 5).map((t) => ({ title: t, subtitle: BB, locked: true })),
      actionLabel: 'Unlock the music',
    },
  ],
  inherited: {
    heading: 'Also included',
    items: ['The sampler and the bonus song', 'First word on the mixtape and every drop'],
  },
};

/** The whole launch as data, written by scripts/onboard-launch-partner.mjs princedre. */
export const PRINCE_DRE: LaunchPartnerConfig = {
  key: 'princedre',
  email: 'princedremusicbusiness@gmail.com',
  userId: '7cece8ba-bd78-4cd6-9fa4-55849c2bf144',
  slug: DRE_SLUG,
  displayName: DRE_DISPLAY_NAME,
  // Founder-supplied for now (2026-09-28); Dre can replace it from his profile any time.
  photoFile: 'videos/output/Prince Dre - photo.jpg',
  promises: DRE_TIER_PROMISES as LaunchPartnerConfig['promises'],
  benefits: DRE_APPROVED_BENEFITS as LaunchPartnerConfig['benefits'],
  identities: DRE_BENEFIT_IDENTITIES as LaunchPartnerConfig['identities'],
  offers: { Silver: DRE_SILVER_OFFER, Gold: DRE_GOLD_OFFER, Platinum: DRE_PLATINUM_OFFER },
  funnelPrimary: 'Platinum',
  funnelDownsell: 'Gold',
  funnelPrimaryItem: DRE_FUNNEL_PRIMARY_ITEM,
  // The lead magnet: one song from each project, in the founder's order. The label is the
  // PROJECT (what the fan votes on); the song is how they hear it; the cover is the project's.
  vote: {
    offerSlug: 'vote',
    offerName: 'First unlock vote',
    headline: '3 UNRELEASED PROJECTS. YOU PICK ONE.',
    // Kept to three lines: the covers and the vote button must sit above a laptop's fold.
    description: `Vote for the one Dre unlocks first. Most votes by ${DRE_FIRST_UNLOCK_DATE} unlocks in full for his $25 members. Every vote gets a bonus unreleased song in the free account we email you.`,
    question: 'Which project should Dre unlock first?',
    projectTitle: 'Next project vote',
    stageLabel: 'Next project',
    winnerRung: 'Gold',
    options: [
      { label: ROTP, trackTitle: 'Wishing Well', file: 'videos/output/Prince Dre - Wishing Well.wav', artFile: COVER[ROTP] },
      { label: FPOB, trackTitle: 'Kill Or Be Killed', file: 'videos/output/Prince Dre - Kill Or Be Killed.wav', artFile: COVER[FPOB] },
      { label: OTOIME, trackTitle: 'In My Eyes', file: 'videos/output/Prince Dre - In My Eyes.wav', artFile: COVER[OTOIME] },
    ],
  },
  // What each rung holds. `rung` is the LOWEST rung that hears it; every rung above it is
  // listed on the track too (the gate is an exact match, there is no inheritance).
  content: {
    tracks: [
      // "Hannn" is the Bronze bonus song every vote promises (founder direction 2026-09-29 to drop
      // the placeholder beats; the promise is kept with a real song rather than withdrawn).
      ...BB_SONGS.map((t, i) => ({ title: t, rung: (t === BONUS_SONG ? 'Bronze' : 'Silver') as 'Bronze' | 'Silver', file: `${BB_DIR}/${i + 1} - ${t}.wav`, artFile: COVER[BB] })),
      ...SJ_SONGS.map((t, i) => ({ title: t, rung: 'Gold' as const, file: `${SJ_DIR}/${i + 1} - ${t}.wav`, artFile: COVER[SJ] })),
    ],
    // Each project is an album on his page: the vote song (free), the 2 archive songs
    // (Silver), then the rest (Platinum, and Gold for the winner once it is recorded).
    projects: [
      { title: ROTP, artFile: COVER[ROTP], voteLabel: ROTP, trackTitles: ['Wishing Well'] },
      { title: FPOB, artFile: COVER[FPOB], voteLabel: FPOB, trackTitles: ['Kill Or Be Killed'] },
      { title: OTOIME, artFile: COVER[OTOIME], voteLabel: OTOIME, trackTitles: ['In My Eyes'] },
      { title: BB, artFile: COVER[BB], trackTitles: BB_SONGS },
      { title: SJ, artFile: COVER[SJ], trackTitles: SJ_SONGS },
    ],
  },
};
