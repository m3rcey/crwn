import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

interface Props {
  params: Promise<{ code: string }>;
}

export default async function RecruiterJoinRedirect({ params }: Props) {
  const { code } = await params;

  // Track referral click (fire-and-forget, never block redirect)
  try {
    const headersList = await headers();
    const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const ua = headersList.get('user-agent') || 'unknown';
    const visitorHash = crypto.createHash('sha256').update(`${ip}:${ua}`).digest('hex').slice(0, 16);

    // Check if recruiter is a partner
    const { data: recruiter } = await supabaseAdmin
      .from('recruiters')
      .select('is_partner')
      .eq('referral_code', code)
      .eq('is_active', true)
      .maybeSingle();

    await supabaseAdmin
      .from('referral_clicks')
      .upsert(
        {
          referral_code: code,
          visitor_hash: visitorHash,
          source_type: recruiter?.is_partner ? 'partner' : 'recruiter',
        },
        { onConflict: 'referral_code,visitor_hash' }
      );
  } catch {
    // Silent fail — tracking should never block the redirect
  }

  redirect(`/signup?recruiter=${code}`);
}
