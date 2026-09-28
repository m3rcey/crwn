// Registry of founder-assisted launches. Add an artist here after writing their config
// file; scripts/onboard-launch-partner.mjs <key> reads it and launchPartner.test.ts checks
// every entry. See .claude/skills/onboard-icp-artist/SKILL.md.

import type { LaunchPartnerConfig } from './launchPartner';
import { PRINCE_DRE } from './princeDre';

export const LAUNCH_PARTNERS: Record<string, LaunchPartnerConfig> = {
  [PRINCE_DRE.key]: PRINCE_DRE,
};
