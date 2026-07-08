// Team Splits — plain-language legal disclaimer copy. Both parties see and
// accept the CURRENT version; the accepted version string is stored on the deal
// (agreement_version) so there is a durable record of what was agreed to.
//
// This is NOT legal advice and does not create an enforceable contract on its
// own. Bump TEAM_SPLIT_AGREEMENT_VERSION whenever the copy below changes.

export const TEAM_SPLIT_AGREEMENT_VERSION = '2026-07-08.v1';

export const TEAM_SPLIT_DISCLAIMER_PARAGRAPHS: string[] = [
  'This Team Split records a revenue-share arrangement between an artist and a collaborator for services or creative work. It is a record of what both parties agreed to on CRWN — it is not legal advice and CRWN is not a party to your agreement.',
  'A Team Split only governs the share of the specific CRWN revenue named in this deal. It does not by itself transfer ownership of masters, publishing, video, footage, artwork, or any other intellectual property. If you need to clarify IP ownership, licensing, publishing splits, or master rights, put that in a separate written agreement and consult an attorney.',
  'Estimated earnings shown anywhere in Team Splits are projections, not guarantees. Actual payouts depend on real revenue, refunds, chargebacks, cancellations, and platform fees.',
  'Payouts are made through Stripe. The collaborator is responsible for their own taxes, and must complete Stripe payout onboarding (identity/KYC) before any money can be released. Payouts may be held during refund windows, disputes, or risk review.',
  'For large, long-term, broad "all earnings," or manager deals, both parties should seek independent legal review before accepting.',
];

/** Per-deal-type extra warning copy shown in review (Pitfalls 18-21). */
export function dealTypeLegalNote(role: string, sourceType: string): string | null {
  if (['producer', 'engineer', 'mixing_engineer', 'mastering_engineer'].includes(role)) {
    return 'This CRWN Team Split does not replace a producer agreement, beat license, publishing split, master split, or sample clearance. Handle those separately.';
  }
  if (['videographer', 'video_editor', 'photographer', 'motion_designer'].includes(role)) {
    return 'Clarify who owns and may use the video, footage, photos, or edits. A revenue share does not by itself grant usage or ownership rights.';
  }
  if (role === 'manager') {
    return 'Management commissions can be legally sensitive. Prefer a source-specific, time-limited deal and get legal review before a broad or long-term arrangement.';
  }
  if (sourceType === 'all_earnings') {
    return 'This deal shares a percentage of your broader CRWN earnings, not one specific source. This is higher risk — keep the percentage and duration conservative.';
  }
  return null;
}
