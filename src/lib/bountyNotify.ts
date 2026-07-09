// Notify PROVEN clippers when a bounty goes live — people who have actually
// clipped for this artist (a clipper-attributed referral OR a prior bounty
// submission), NOT the whole fanbase. Drives clipping->subs without spamming
// fans who don't clip. Degrades safely if the clipper-attribution column isn't
// applied. Best-effort — callers wrap in try/catch; never block bounty writes.
//
// Fires on: bounty created active, and a draft flipped to active (guarded to
// the transition so it can't double-notify).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export async function notifyClippersOfNewBounty(
  supabaseAdmin: Admin,
  artistId: string,
  bountyTitle: string,
) {
  const { data: ap } = await supabaseAdmin
    .from('artist_profiles').select('user_id').eq('id', artistId).single();
  const artistUserId: string | null = ap?.user_id ?? null;

  const clipperIds = new Set<string>();

  // Signal 1: clipper-attributed referrals for this artist.
  const { data: refs } = await supabaseAdmin
    .from('referrals').select('referrer_fan_id')
    .eq('artist_id', artistId).eq('source', 'clipper');
  for (const r of refs || []) if (r.referrer_fan_id) clipperIds.add(r.referrer_fan_id);

  // Signal 2: anyone who submitted to a prior bounty of this artist.
  const { data: myBounties } = await supabaseAdmin
    .from('clip_bounties').select('id').eq('artist_id', artistId);
  const bountyIds = (myBounties || []).map((x: any) => x.id);
  if (bountyIds.length) {
    const { data: subs } = await supabaseAdmin
      .from('clip_bounty_submissions').select('clipper_id').in('bounty_id', bountyIds);
    for (const s of subs || []) if (s.clipper_id) clipperIds.add(s.clipper_id);
  }

  if (artistUserId) clipperIds.delete(artistUserId); // never notify the artist about their own bounty
  const ids = [...clipperIds];
  if (!ids.length) return;

  let artistName = 'An artist';
  if (artistUserId) {
    const { data: p } = await supabaseAdmin
      .from('profiles').select('display_name').eq('id', artistUserId).single();
    artistName = p?.display_name || artistName;
  }

  await supabaseAdmin.from('notifications').insert(
    ids.map((fid) => ({
      user_id: fid,
      type: 'bounty_available',
      title: `✂️ New clip bounty from ${artistName}`,
      message: `${bountyTitle}. Clip it and earn.`,
      link: '/my-bounties',
    })),
  );
}
