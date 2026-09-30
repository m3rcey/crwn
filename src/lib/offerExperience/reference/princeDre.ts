// Prince Dre: the SECOND reference configuration, built from the founder-assisted launch
// blueprint (Prince_Dre_CRWN_Launch_Blueprint.pdf) and the founder's 2026-09-28 ladder:
// every rung gives progressively more of the exact thing his fans asked for, his unreleased
// music from three projects (The Return Of The Prince, Fresh Prince Of O'Block, Only The O
// In My Eyes). scripts/onboard-launch-partner.mjs writes all of it to production.
//
//   Vote (free, no account)  hear one song from each project, vote on which unlocks first
//   Bronze (free, on vote)   the 2 most-watched songs from every project + a bonus song ("Hannn")
//   Silver $10               Blood Brothaz + Life I Live, complete
//   Gold $25                 Shotta In Da Jungle + Im Reloaded, complete, + the WINNING vote project
//   Platinum $100            everything: O Block Ass Nigga + all 3 vote projects, complete, today
//
// The vote never closes: a closed ballot stops capturing fans, and the street-team run lasts
// weeks. "The most votes by DRE_FIRST_UNLOCK_DATE" decides the first unlock; Dre records the
// winner in his Song Lab manager (CRWN never picks) and `--unlock-winner` opens it to Gold.
//
// Deliberately NOT carried: merch (CRWN sells no physical goods), "limited" anything (the
// only real cap is the Founder Window), "priority" (nothing enforces it), any schedule.
//
// NO PLACEHOLDER AUDIO (founder, 2026-09-29). Since 2026-09-30 his whole catalog is on the page:
// eight projects, every song real.

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
const ART: Record<string, string> = {
  [ROTP]: `${ART_BASE}1790642982534.jpg`,
  [FPOB]: `${ART_BASE}1790642985217.jpg`,
  [OTOIME]: `${ART_BASE}1790642989221.jpg`,
  // Uploaded with the album on 2026-09-30 (key is the project title; OBAN is declared below).
  'O Block Ass Nigga': `${ART_BASE}1790800739483.jpg`,
};
// Photos for the offer (scripts/generate-offer-photos.mjs, 2026-09-28): realistic studio photos of
// him generated from his current-look reference photos (founder direction: real-looking photos
// of the artist on his own page, not brand art), uploaded to his public album-art folder.
const OFFER_ART = 'https://ecpqtuidtsncjfwtkvwc.supabase.co/storage/v1/object/public/album-art/afa05eb6-da91-438a-8e28-3952c1bded83/offer/';
// The whole catalog (founder, 2026-09-30): eight projects from `videos/prince dre/<project>/
// <n> - <song>.wav`, each placed by how hard it is to find and hear today. Where each one lives,
// per the founder (2026-09-30), which outranks the web research the same day:
//   Silver    Life I Live (Apple Music, per research; the easiest) + Blood Brothaz (Audiomack)
//   Gold      Shotta In Da Jungle (Audiomack) + Im Reloaded (Certified Mixtapes)
//   Platinum  O Block Ass Nigga (the hardest: only single tracks on YouTube, uploaded by someone
//             else and never under the project's title) + the 3 vote projects: Return Of The
//             Prince (Certified Mixtapes), Fresh Prince Of O'Block (DaMixHub), Only The O In My
//             Eyes (LiveMixtapes). The vote mechanic keeps them here: Platinum has all three,
//             Gold gets the winner on DRE_FIRST_UNLOCK_DATE.
// Shotta is as easy to find as Blood Brothaz but stays in Gold: Gold and the Round Here drop
// already sell it. NONE of them is "never on streaming" or "unreleased": each can be found
// somewhere, so the copy sells the COMPLETE project in one place, never scarcity it does not have.
const BB = 'Blood Brothaz';
const SJ = 'Shotta In Da Jungle';
const LIL = 'Life I Live';
const IR = 'Im Reloaded';
const OBAN = 'O Block Ass Nigga';
const DIR = 'videos/prince dre';
/** Each project's songs as the files name them, in track order (`<n> - <song>.wav`). */
const SONGS: Record<string, string[]> = {
  [ROTP]: ['Wishing Well (Letter To V Roy)', 'I Am What I Am Freestyle', 'Vette Freestyle', 'Send It Up', 'Beatbox Freestyle', 'Stupid Azz', 'Real As It Gets Freestyle', 'Murda Talk', 'Bite Down Freestyle'],
  [FPOB]: ['J Money Skit', 'Intro', 'MunnaGang', 'Youngest In Charge', 'Ball 1 Day', 'Get That Bag', 'FMDCB', 'LA Capone Skit', 'My Lil Niggas', '16Barz', 'OnAGuyz', 'Kill Or Be Killed', 'Hommie', 'Travel Every State', 'Outro'],
  [OTOIME]: ['Only The O', 'My Savages', 'Yeah Yeah', 'They Dont Want It', 'Throw It Up', 'Streets Dont Love You', 'In My Eyes', 'Turn Up On Em'],
  [BB]: ['Rebirth (Intro)', 'Hannn', 'Brothers Pt 2', 'All I Know', 'Im A Ridah', 'Turn Up', 'People', 'In Dese Streets', 'Hide N Seek', 'Ready For War', 'Been On My Mind', 'Letter To LA - JMoney', 'Close Yo Mouth', 'I Swear', 'Lately'],
  [SJ]: ['Intro Danger', 'Round Here', 'Block Head', 'Glizzied Up', 'With Me', 'Taking Chances', 'On Nat Block', 'From The O', 'Cuz', 'TurntUp4JMunna'],
  [LIL]: ['Life I Live', 'No Choice', 'Ready For War', 'Wonder Why', 'Dogs Cry', 'Who I Am', 'They Be Like', 'Oh Gawd', 'Slums', 'Kid In The Ghetto', 'Come From', 'Not A Worry'],
  [IR]: ['Toxic (Intro)', 'Bout That', 'Be Stupid (Interlude)', 'Murda', 'No Worries', 'Chasin Dough', 'Numbers Dont Lie', 'Profit', 'Dope Man', 'No Basic', 'Members', 'Reloaded'],
  [OBAN]: ['Mighty O Block', 'Always Made It', 'Came For You', 'Keep Goin', 'When It Rains It Pours', 'I Get High', 'Feel It In The Air', 'Dear Mama', 'One Wish', 'Povertys Paradise', 'Save Me', 'Underrated', 'In The O We Trust'],
};
/** The folder each project lives in, where it differs from its display title. */
const FOLDER: Record<string, string> = { [ROTP]: 'Return Of The Prince', [FPOB]: 'Fresh Prince Of O Block' };
/** A song already on his page under a shorter title (the vote song). */
const ON_PAGE_AS: Record<string, string> = { 'Wishing Well (Letter To V Roy)': 'Wishing Well' };
/** The three vote songs: already uploaded as free tracks by the vote, never re-uploaded. */
const VOTE_SONGS = new Set(['Wishing Well', 'Kill Or Be Killed', 'In My Eyes']);
/** Two different recordings share a title across projects; the page has to tell them apart. */
const RETITLE: Record<string, Record<string, string>> = { [LIL]: { 'Ready For War': 'Ready For War (Life I Live)' } };
const PROJECT_RUNG: Record<string, 'Silver' | 'Gold' | 'Platinum'> = {
  [BB]: 'Silver', [LIL]: 'Silver', [SJ]: 'Gold', [IR]: 'Gold', [OBAN]: 'Platinum', [ROTP]: 'Platinum', [FPOB]: 'Platinum', [OTOIME]: 'Platinum',
};
/**
 * FREE in Bronze (founder, 2026-09-30): the two most-watched YouTube videos from every project,
 * view counts as displayed 2026-09-30. Only a video that verifiably IS the project's song
 * counts; a likely remix or an unconfirmed match was passed over for the next one down.
 *   ROTP   Wishing Well 1.94M (a free vote song already), Send It Up 580K
 *   FPOB   Hommie 1.62M ("Hommie Remix" ft. Edai; the tape's Hommie also has Edai), MunnaGang 866K
 *   OTOIME In My Eyes 653K (a free vote song already), My Savages 221K
 *   BB     Hide N Seek 605K, Im A Ridah 467K ("Brothers Remix" 1.68M not confirmed as Brothers Pt 2)
 *   SJ     From The O 717K, TurntUp4JMunna 140K
 *   LIL    Life I Live 522K, Come From 284K (both possibly the earlier single versions)
 *   IR     Chasin Dough 45K, Reloaded 13K ("Murda" 271K not confirmed as the tape's recording)
 *   OBAN   I Get High 46K, Always Made It 11K
 */
export const DRE_BRONZE_SINGLES = [
  'Send It Up', 'Hommie', 'MunnaGang', 'My Savages', 'Hide N Seek', 'Im A Ridah', 'From The O', 'TurntUp4JMunna',
  'Life I Live', 'Come From', 'Chasin Dough', 'Reloaded', 'I Get High', 'Always Made It',
];
/** The Bronze bonus song every vote promises. */
const BONUS_SONG = 'Hannn';
const COVER: Record<string, string> = {
  [ROTP]: 'videos/output/Prince Dre - The Return Of The Prince.jpg',
  [FPOB]: 'videos/output/Prince Dre - Fresh Prince Of O Block.jpg',
  [OTOIME]: 'videos/output/prince dre - Only The O In My Eyes.jpg',
  [BB]: `${DIR}/${BB}/${BB} (Cover Art).jpg`,
  [SJ]: `${DIR}/${SJ}/${SJ} (Cover Art).jpg`,
  [LIL]: `${DIR}/${LIL}/${LIL} (Cover Art).jpg`,
  [IR]: `${DIR}/${IR}/${IR} (Cover Art).png`,
  [OBAN]: `${DIR}/${OBAN}/${OBAN} (Cover Art).jpg`,
};
const titleOf = (project: string, song: string) => ON_PAGE_AS[song] ?? RETITLE[project]?.[song] ?? song;
/** A project's songs as they are titled on his page, in track order. */
const pageTitles = (project: string) => SONGS[project].map((song) => titleOf(project, song));
const BB_SONGS = pageTitles(BB);
const SJ_SONGS = pageTitles(SJ);
const LIL_SONGS = pageTitles(LIL);
const IR_SONGS = pageTitles(IR);
/** Song counts come from the lists, so no copy line can drift from what is uploaded. */
const N = Object.fromEntries(Object.entries(SONGS).map(([k, v]) => [k, v.length])) as Record<string, number>;
const SILVER_SONGS = N[BB] + N[LIL];
const GOLD_SONGS = N[SJ] + N[IR];
const ALL_SONGS = Object.values(N).reduce((a, b) => a + b, 0);
/** The two most-watched from every project: the Bronze singles plus the two vote songs among them. */
const FREE_SONGS = DRE_BRONZE_SINGLES.length + 2;
const PROJECTS = Object.keys(SONGS).length;
const rungOf = (title: string, project: string) =>
  title === BONUS_SONG || DRE_BRONZE_SINGLES.includes(title) ? ('Bronze' as const) : PROJECT_RUNG[project];
/** Every song to upload (or re-gate), the vote songs excepted: the vote owns those. */
const CONTENT_TRACKS = [BB, SJ, LIL, IR, OBAN, ROTP, FPOB, OTOIME].flatMap((project) =>
  SONGS[project]
    .map((song, i) => ({ song, i, title: titleOf(project, song) }))
    .filter(({ title }) => !VOTE_SONGS.has(title))
    .map(({ song, i, title }) => ({
      title,
      rung: rungOf(title, project),
      file: `${DIR}/${FOLDER[project] ?? project}/${i + 1} - ${song}.wav`,
      artFile: COVER[project],
    })),
);

export const DRE_TIER_PROMISES: Record<string, string> = {
  Bronze: 'His most-watched songs, free.',
  Silver: 'Two whole projects, complete.',
  Gold: 'Get the full project the fans pick.',
  Platinum: 'Every project, complete, today.',
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
    `${FREE_SONGS} songs free: the 2 most-watched from all ${PROJECTS} projects`,
    'A bonus song, unlocked when you join',
    'A vote on which project Dre unlocks first',
    'First word on the mixtape and every drop',
  ],
  Silver: [
    `Blood Brothaz and Life I Live, complete (${SILVER_SONGS} songs)`,
    'Behind the scenes from every era',
    'Everything in Bronze',
  ],
  Gold: [
    `Shotta In Da Jungle and Im Reloaded, complete (${GOLD_SONGS} songs)`,
    'The Vault: cuts, alternate versions and unreleased videos as Dre adds them',
    `The complete winning project, unlocked ${DRE_FIRST_UNLOCK_DATE}`,
    'Everything in Silver',
  ],
  Platinum: [
    `All ${PROJECTS} projects, complete, today (${ALL_SONGS} songs)`,
    `${OBAN}, his hardest project to find, and all 3 vote projects`,
    'First listen to the project after the mixtape, before anyone else',
    'Group listening sessions when Dre opens one',
    'Platinum recognition',
    'Everything in Gold',
  ],
};

/** One registry key per DISTINCT capability, on the lowest rung that promises it. */
export const DRE_BENEFIT_IDENTITIES: Record<string, { key: string; line: string }[]> = {
  Bronze: [
    { key: 'welcome_unlock', line: 'A bonus song, unlocked when you join' },
    { key: 'creative_voting', line: 'A vote on which project Dre unlocks first' },
    { key: 'drop_alerts', line: 'First word on the mixtape and every drop' },
  ],
  Silver: [
    { key: 'exclusive_tracks', line: `Blood Brothaz and Life I Live, complete (${SILVER_SONGS} songs)` },
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
  title: 'Every project, complete',
  description: `Everyone else waits for the vote. Platinum gets all ${PROJECTS} projects, ${ALL_SONGS} songs, today.`,
};

// Dre has not shot his video yet (founder, 2026-09-28): the slot shows the COVER of the video
// he is about to make, as a non-playable still with "coming soon". When he records it, set
// `url` to the hosted mp4 and the same slot becomes the player.
const STAND_IN_VSL = {
  url: null,
  posterUrl: 'https://ecpqtuidtsncjfwtkvwc.supabase.co/storage/v1/object/public/album-art/afa05eb6-da91-438a-8e28-3952c1bded83/offer/photo-vsl-thumb.webp',
};

export const DRE_PLATINUM_OFFER: TierOfferExperience = {
  promise: 'Every project, complete, today.',
  description: `Everyone else waits to see which project wins the vote. Platinum gets all ${PROJECTS} projects, ${ALL_SONGS} songs, the moment you join: ${ROTP}, ${FPOB}, ${OTOIME}, ${OBAN} (his hardest project to find), and everything in the levels below.`,
  cta: `Unlock All ${PROJECTS} Projects`,
  secondaryCue: 'See what you get',
  heroImageUrl: `${OFFER_ART}photo-hero-platinum.webp`,
  vsl: STAND_IN_VSL,
  previews: [
    {
      kind: 'collection',
      // Real since 2026-09-30: these projects are uploaded, complete, and open to Platinum.
      truth: 'real',
      title: 'Only in Platinum, complete',
      description: 'Not a sampler. Every song on every project, the moment you join.',
      items: [
        { title: ROTP, subtitle: `${N[ROTP]} songs`, locked: true, artUrl: ART[ROTP] },
        { title: FPOB, subtitle: `${N[FPOB]} songs`, locked: true, artUrl: ART[FPOB] },
        { title: OTOIME, subtitle: `${N[OTOIME]} songs`, locked: true, artUrl: ART[OTOIME] },
        { title: OBAN, subtitle: `${N[OBAN]} songs`, locked: true, ...(ART[OBAN] ? { artUrl: ART[OBAN] } : {}) },
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
      'Shotta In Da Jungle and Im Reloaded, complete',
      'Blood Brothaz and Life I Live, complete',
      'The Vault as Dre adds to it',
      `The ${FREE_SONGS} free songs and the bonus song`,
    ],
  },
  faqs: [
    {
      q: 'What if I only want the project that wins?',
      a: `The $25 a month level gets the one project that wins the vote, unlocked ${DRE_FIRST_UNLOCK_DATE}. This level gets all ${PROJECTS} projects complete today, and hears the project after the mixtape first.`,
    },
    {
      q: 'Is the mixtape included?',
      a: 'The mixtape drops everywhere, free to stream. This is his whole catalog, every project complete, in one place.',
    },
    {
      q: 'Can I cancel?',
      a: 'Any time. Your access runs to the end of the billing period you already paid for.',
    },
  ],
};

export const DRE_GOLD_OFFER: TierOfferExperience = {
  promise: 'Get the full project the fans pick.',
  description: `Shotta In Da Jungle and Im Reloaded, ${GOLD_SONGS} songs, the moment you join. Then the project with the most votes by ${DRE_FIRST_UNLOCK_DATE} unlocks for you too, every song on it.`,
  cta: 'Unlock the Winning Project',
  secondaryCue: 'See what you get',
  heroImageUrl: `${OFFER_ART}photo-hero-gold.webp`,
  vsl: STAND_IN_VSL,
  previews: [
    {
      kind: 'audio',
      truth: 'real',
      title: 'Two projects, today',
      description: 'Both complete. Yours the moment you join.',
      items: [
        ...SJ_SONGS.filter((t) => !DRE_BRONZE_SINGLES.includes(t)).slice(0, 3).map((t) => ({ title: t, subtitle: SJ, locked: true })),
        ...IR_SONGS.filter((t) => !DRE_BRONZE_SINGLES.includes(t)).slice(0, 2).map((t) => ({ title: t, subtitle: IR, locked: true })),
      ],
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
      'Blood Brothaz and Life I Live, complete',
      'Behind the scenes from every era',
      `The ${FREE_SONGS} free songs and the bonus song`,
    ],
  },
  faqs: [
    {
      q: 'What if the project I voted for does not win?',
      a: `The project with the most votes by ${DRE_FIRST_UNLOCK_DATE} is the one that unlocks here. If you want every project no matter what wins, the $100 a month level gets all ${PROJECTS} today.`,
    },
    {
      q: 'Is the mixtape included?',
      a: 'The mixtape drops everywhere, free to stream. This is his whole catalog, every project complete, in one place.',
    },
    {
      q: 'Can I cancel?',
      a: 'Any time. Your access runs to the end of the billing period you already paid for.',
    },
  ],
};

export const DRE_SILVER_OFFER: TierOfferExperience = {
  promise: 'Two whole projects, complete.',
  description: `Blood Brothaz and Life I Live, all ${SILVER_SONGS} songs. Yours the moment you join.`,
  cta: 'Get Both Projects',
  secondaryCue: 'See what you get',
  vsl: { url: null },
  previews: [
    {
      kind: 'audio',
      truth: 'real',
      title: 'Two projects, today',
      description: 'Both complete. Yours the moment you join.',
      items: [
        ...BB_SONGS.filter((t) => t !== BONUS_SONG && !DRE_BRONZE_SINGLES.includes(t)).slice(0, 3).map((t) => ({ title: t, subtitle: BB, locked: true })),
        ...LIL_SONGS.filter((t) => !DRE_BRONZE_SINGLES.includes(t)).slice(0, 2).map((t) => ({ title: t, subtitle: LIL, locked: true })),
      ],
      actionLabel: 'Unlock the music',
    },
  ],
  inherited: {
    heading: 'Also included',
    items: [`The ${FREE_SONGS} free songs and the bonus song`, 'First word on the mixtape and every drop'],
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
  // Drop funnels: one song each at /drop/<link>. A fan gives an email, hears it through a link
  // that expires, joins Bronze, and meets the Platinum offer with Gold as the downsell.
  //   2026-09-29: Round Here (Gold) and Letter To LA (Silver), the first two.
  //   2026-09-30: one for every Bronze single (founder), so each video's audience has a page.
  // The player already names the song and the project, so each line only adds the why.
  drops: [
    { magnetTrackTitle: 'Round Here', magnetTitle: 'Round Here', magnetDescription: 'Yours free.', live: true },
    { magnetTrackTitle: 'Letter To LA - JMoney', magnetTitle: 'Letter To LA', magnetDescription: 'With JMoney. Yours free.', live: true, linkSlug: 'princedre-letter-to-la' },
    ...DRE_BRONZE_SINGLES.map((t) => ({ magnetTrackTitle: t, magnetTitle: t, magnetDescription: 'Yours free.', live: true })),
  ],
  // The lead magnet: one song from each project, in the founder's order. The label is the
  // PROJECT (what the fan votes on); the song is how they hear it; the cover is the project's.
  vote: {
    offerSlug: 'vote',
    offerName: 'First unlock vote',
    headline: '3 FULL PROJECTS. YOU PICK ONE.',
    // Kept to three lines: the covers and the vote button must sit above a laptop's fold.
    description: `Vote for the one Dre unlocks first. Most votes by ${DRE_FIRST_UNLOCK_DATE} unlocks in full for his $25 members. Every vote gets a bonus song in the free account we email you.`,
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
  // What each rung holds: every song on every project (see CONTENT_TRACKS). `rung` is the LOWEST
  // rung that hears it; every rung above it is listed on the track too (the gate is an exact
  // match, there is no inheritance). The script only ever ADDS rungs to a track already there.
  content: {
    tracks: CONTENT_TRACKS,
    // Each project is an album on his page, in track order. The vote projects carry their vote
    // label, so `--unlock-winner` opens the winner's Platinum songs to Gold.
    projects: [ROTP, FPOB, OTOIME, BB, SJ, LIL, IR, OBAN].map((title) => ({
      title,
      artFile: COVER[title],
      ...([ROTP, FPOB, OTOIME].includes(title) ? { voteLabel: title } : {}),
      trackTitles: pageTitles(title),
    })),
  },
};
