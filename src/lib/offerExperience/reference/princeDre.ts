// Prince Dre: the SECOND reference configuration, built from the founder-assisted launch
// blueprint (Prince_Dre_CRWN_Launch_Blueprint.pdf) and the founder's 2026-09-28 ladder:
// every rung gives progressively more of the exact thing his fans asked for, his unreleased
// music from three projects (The Return Of The Prince, Fresh Prince Of O'Block, Only The O
// In My Eyes). scripts/onboard-launch-partner.mjs writes all of it to production.
//
//   Vote (free, no account)  hear one song from each project, vote on which unlocks first
//   Bronze (free, on vote)   the sampler + a bonus unreleased song
//   Silver $10               the archive pack: 6 songs, 2 from each project
//   Gold $25                 the complete WINNING project (unlocks on DRE_FIRST_UNLOCK_DATE)
//   Platinum $100            all 3 complete projects now, first listen to what comes next
//
// The vote never closes: a closed ballot stops capturing fans, and the street-team run lasts
// weeks. "The most votes by DRE_FIRST_UNLOCK_DATE" decides the first unlock; Dre records the
// winner in his Song Lab manager (CRWN never picks) and `--unlock-winner` opens it to Gold.
//
// Deliberately NOT carried: merch (CRWN sells no physical goods), "limited" anything (the
// only real cap is the Founder Window), "priority" (nothing enforces it), any schedule.
//
// PLACEHOLDER AUDIO (2026-09-28): Dre has not sent the archive or the full projects yet, so
// every `placeholder: true` track below is one of the beats in videos/music/, uploaded under
// the title its real song will replace. Swap each file for the real song as it arrives. The
// three vote songs are real. Until the real songs are in, previews stay truth: 'example'.

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
const COVER = {
  [ROTP]: 'videos/output/Prince Dre - The Return Of The Prince.jpg',
  [FPOB]: 'videos/output/Prince Dre - Fresh Prince Of O Block.jpg',
  [OTOIME]: 'videos/output/prince dre - Only The O In My Eyes.jpg',
};

export const DRE_TIER_PROMISES: Record<string, string> = {
  Bronze: 'Hear the unreleased sampler.',
  Silver: 'Go deeper into the archive.',
  Gold: 'Get the full project the fans pick.',
  Platinum: 'All 3 unreleased projects, right now.',
};

export const DRE_TIER_PRICES_CENTS: Record<string, number> = {
  Bronze: 0,
  Silver: 1000,
  Gold: 2500,
  Platinum: 10000,
};

export const DRE_APPROVED_BENEFITS: Record<string, string[]> = {
  Bronze: [
    'The unreleased sampler: one song from each of the 3 projects',
    'A bonus unreleased song, unlocked when you join',
    'A vote on which project Dre unlocks first',
    'First word on the mixtape and every drop',
  ],
  Silver: [
    'Everything in Bronze',
    'The archive pack: 6 unreleased songs, 2 from each project',
    'Behind the scenes from every era',
  ],
  Gold: [
    'Everything in Silver',
    `The complete winning project, unlocked ${DRE_FIRST_UNLOCK_DATE}`,
    'The Vault: cuts, alternate versions and unreleased videos as Dre adds them',
  ],
  Platinum: [
    'Everything in Gold',
    'All 3 unreleased projects, complete, the moment you join',
    'First listen to the project after the mixtape, before anyone else',
    'Group listening sessions when Dre opens one',
    'Platinum recognition',
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
    { key: 'exclusive_tracks', line: 'The archive pack: 6 unreleased songs, 2 from each project' },
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
  title: 'All 3 unreleased projects, right now',
  description:
    'Everyone else waits for the vote to see which project unlocks. Platinum gets all 3, complete, the moment they join.',
};

// Stand-in until Dre records his own: the same CRWN video GB carries, DISCLOSED by
// isPlaceholder (the renderer prints the Example video chip). Swap the url, keep the rule.
const STAND_IN_VSL = {
  url: 'https://pub-490263a6ac304986851fbf65e6f3ff13.r2.dev/vsl/vsl-1-fan-worth.mp4',
  posterUrl: 'https://thecrwn.app/vsl/vsl-1-fan-worth.webp',
  isPlaceholder: true,
};

export const DRE_PLATINUM_OFFER: TierOfferExperience = {
  promise: 'All 3 unreleased projects, right now.',
  description: `Everyone else waits to see which project wins the vote. Platinum gets ${ROTP}, ${FPOB} and ${OTOIME}, complete, the moment you join, and hears the next project before anyone else.`,
  cta: 'Unlock All 3 Projects',
  secondaryCue: 'See what you get',
  vsl: STAND_IN_VSL,
  previews: [
    {
      kind: 'collection',
      truth: 'example',
      title: 'All 3 projects, complete',
      description: 'Not a sampler. Every song on every project, the moment you join.',
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
        { name: 'You', badge: 'Platinum', text: 'Already got all 3. Wishing Well is crazy.', you: true },
        { name: 'Mook', badge: 'Bronze', text: 'How do I hear the full projects?' },
      ],
    },
  ],
  inherited: {
    heading: 'Also included',
    items: [
      'The complete winning project',
      'The Vault as Dre adds to it',
      'The archive pack: 6 unreleased songs',
      'The sampler and the bonus song',
    ],
  },
  faqs: [
    {
      q: 'What if I only want the project that wins?',
      a: `The $25 a month level gets the one project that wins the vote, unlocked ${DRE_FIRST_UNLOCK_DATE}. This level gets all 3 projects complete, today, and hears the project after the mixtape first.`,
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
  description: `The project with the most votes by ${DRE_FIRST_UNLOCK_DATE} unlocks for you, every song on it. Until then you get the archive pack now: 6 unreleased songs, 2 from each project.`,
  cta: 'Unlock the Winning Project',
  secondaryCue: 'See what you get',
  vsl: STAND_IN_VSL,
  previews: [
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
      kind: 'audio',
      truth: 'example',
      title: 'The archive pack, today',
      description: '2 unreleased songs from each project, yours the moment you join.',
      items: [
        { title: ROTP, subtitle: '2 unreleased songs', locked: true, artUrl: ART[ROTP] },
        { title: FPOB, subtitle: '2 unreleased songs', locked: true, artUrl: ART[FPOB] },
        { title: OTOIME, subtitle: '2 unreleased songs', locked: true, artUrl: ART[OTOIME] },
      ],
      actionLabel: 'Unlock the music',
    },
    {
      kind: 'video',
      truth: 'example',
      title: 'The Vault',
      description: 'Cuts, alternate versions and unreleased videos, posted for members as Dre adds them.',
    },
    {
      kind: 'status',
      truth: 'example',
      title: "Dre's community on CRWN",
      description: 'Dre posts here for his fans, and fans talk under every post. Gold shows beside your name every time you comment.',
      badge: 'GOLD',
      thread: [
        { name: 'You', badge: 'Gold', text: 'Fresh Prince Of O\'Block all day.', you: true },
        { name: 'Jaye', badge: 'Silver', text: 'The archive pack alone was worth it.' },
        { name: 'Mook', badge: 'Bronze', text: 'How do I hear the full projects?' },
      ],
    },
  ],
  inherited: {
    heading: 'Also included',
    items: [
      'The archive pack: 6 unreleased songs',
      'Behind the scenes from every era',
      'The sampler and the bonus song',
      'First word on the mixtape and every drop',
    ],
  },
  faqs: [
    {
      q: 'What if the project I voted for does not win?',
      a: `The project with the most votes by ${DRE_FIRST_UNLOCK_DATE} is the one that unlocks here. If you want every project no matter what wins, the $100 a month level gets all 3 today.`,
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
  promise: 'Go deeper into the archive.',
  description: 'The sampler is 3 songs. The archive pack is 6 more: 2 unreleased songs from each project, yours the moment you join.',
  cta: 'Get the Archive Pack',
  secondaryCue: 'See what you get',
  vsl: { url: null },
  previews: [
    {
      kind: 'collection',
      truth: 'example',
      title: 'The archive pack',
      description: '2 unreleased songs from each project.',
      items: [
        { title: ROTP, subtitle: '2 unreleased songs', locked: true, artUrl: ART[ROTP] },
        { title: FPOB, subtitle: '2 unreleased songs', locked: true, artUrl: ART[FPOB] },
        { title: OTOIME, subtitle: '2 unreleased songs', locked: true, artUrl: ART[OTOIME] },
      ],
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
    headline: '3 UNRELEASED PROJECTS. ONE SONG FROM EACH.',
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
      { title: 'Bonus Record', rung: 'Bronze', placeholder: true, file: 'videos/music/primary/7-4 b 135.mp3' },
      { title: `${ROTP}: Archive 1`, rung: 'Silver', placeholder: true, file: 'videos/music/primary/Makavhan Zodiae.mp3', artFile: COVER[ROTP] },
      { title: `${ROTP}: Archive 2`, rung: 'Silver', placeholder: true, file: 'videos/music/secondary/Gorgeous - 7-8.mp3', artFile: COVER[ROTP] },
      { title: `${FPOB}: Archive 1`, rung: 'Silver', placeholder: true, file: 'videos/music/secondary/Triplets - 7-3.mp3', artFile: COVER[FPOB] },
      { title: `${FPOB}: Archive 2`, rung: 'Silver', placeholder: true, file: 'videos/music/tertiary/7-12 100.mp3', artFile: COVER[FPOB] },
      { title: `${OTOIME}: Archive 1`, rung: 'Silver', placeholder: true, file: 'videos/music/tertiary/Now Or Never.wav', artFile: COVER[OTOIME] },
      { title: `${OTOIME}: Archive 2`, rung: 'Silver', placeholder: true, file: 'videos/music/tertiary/Real Rank (Kodak Black x 21 Savage).wav', artFile: COVER[OTOIME] },
      { title: `${ROTP}: Full Project Cut`, rung: 'Platinum', placeholder: true, file: 'videos/music/primary/7-4 b 135.mp3', artFile: COVER[ROTP] },
      { title: `${FPOB}: Full Project Cut`, rung: 'Platinum', placeholder: true, file: 'videos/music/primary/Makavhan Zodiae.mp3', artFile: COVER[FPOB] },
      { title: `${OTOIME}: Full Project Cut`, rung: 'Platinum', placeholder: true, file: 'videos/music/secondary/Triplets - 7-3.mp3', artFile: COVER[OTOIME] },
    ],
    // Each project is an album on his page: the vote song (free), the 2 archive songs
    // (Silver), then the rest (Platinum, and Gold for the winner once it is recorded).
    projects: [
      { title: ROTP, artFile: COVER[ROTP], voteLabel: ROTP, trackTitles: ['Wishing Well', `${ROTP}: Archive 1`, `${ROTP}: Archive 2`, `${ROTP}: Full Project Cut`] },
      { title: FPOB, artFile: COVER[FPOB], voteLabel: FPOB, trackTitles: ['Kill Or Be Killed', `${FPOB}: Archive 1`, `${FPOB}: Archive 2`, `${FPOB}: Full Project Cut`] },
      { title: OTOIME, artFile: COVER[OTOIME], voteLabel: OTOIME, trackTitles: ['In My Eyes', `${OTOIME}: Archive 1`, `${OTOIME}: Archive 2`, `${OTOIME}: Full Project Cut`] },
    ],
  },
};
