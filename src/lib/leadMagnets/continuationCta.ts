// The feature-specific continuation CTA for a calculator.
//
// After an artist sees their result, the button that carries them into CRWN should name the exact
// thing they are about to build ("Build My Membership", "Turn On Share-to-Earn"), not a generic
// "Create your account". This is the single source of that label, so every render site (the web
// result page, the tokenized result page, the emailed result, the /worth page) reads the same copy.
//
// It does NOT change the signup flow. The button still opens the existing signup with the result
// token (see buildContinueUrl); only the words change.

import { getLeadMagnet } from './registry';

// Bespoke wording where a plain "Build My {featureName}" would read wrong (the five named tools plus
// a few whose featureName is a plural/label/diagnostic). Everything else derives its CTA below, so a
// new calculator gets a feature-specific CTA for free.
const CTA_OVERRIDES: Record<string, string> = {
  worth: 'Build My Membership',
  'share-to-earn-planner': 'Turn On Share-to-Earn',
  'executive-producer-session': 'Build My Executive Producer Session',
  'live-experience-calculator': 'Create My First Ticketed Live Event',
  'vault-revenue-planner': 'Build My Vault',
  'fan-mission-generator': 'Launch My First Fan Mission',
  'clip-to-earn-campaign-planner': 'Turn On Clip-to-Earn',
  'artist-quest-path': 'Start Rise Mode',
  'team-split-deal-builder': 'Set Up My Team Splits',
  // The TOOL name "Own Your Fans" stays (running experiment, analytics and route identity).
  // This is a CLAIM, though, and an artist does not own people. Accurate version of the same
  // promise: the relationship and the contact are theirs. See POSITIONING.md section 24.
  'own-your-fans-calculator': 'Build My Direct Fan List',
  'royalty-readiness-check': 'Start My Royalty Setup',
  'fan-stack-calculator': 'Build My Consolidated Membership',
  'between-tour-calculator': 'Build My VIP Membership',
};

/** The continuation CTA label for a calculator slug. Feature-specific for every calculator. */
export function continueCtaFor(slug: string): string {
  const override = CTA_OVERRIDES[slug];
  if (override) return override;
  const feature = getLeadMagnet(slug)?.featureName;
  return feature ? `Build My ${feature}` : 'Build This In CRWN';
}

/**
 * The URL the continuation CTA opens: the EXISTING signup flow, carrying the calculator context.
 * `/signup?result=<token>` is the same server-side token handoff auto-claim already consumes; when
 * there is no token yet (result not persisted) it falls back to a tool-tagged signup. No new flow.
 */
export function buildContinueUrl(slug: string, resultToken?: string | null): string {
  const params = new URLSearchParams({ tool: slug, ref: 'lead-magnet' });
  if (resultToken) params.set('result', resultToken);
  return `/signup?${params.toString()}`;
}
