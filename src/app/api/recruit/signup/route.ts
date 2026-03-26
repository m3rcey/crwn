import { NextRequest, NextResponse } from 'next/server';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { recruiterWelcomeEmail } from '@/lib/emails/recruiterWelcome';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export async function POST(req: NextRequest) {
  const { userId } = await req.json();

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('username, display_name')
    .eq('id', userId)
    .single();

  if (!profile?.username) {
    return NextResponse.json({ error: 'Username required to become a recruiter' }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from('recruiters')
    .select('id, referral_code')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ id: existing.id, referralCode: existing.referral_code });
  }

  const { data, error } = await supabaseAdmin
    .from('recruiters')
    .insert({
      user_id: userId,
      referral_code: profile.username,
    })
    .select('id, referral_code')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Send welcome email
  try {
    const { data: userProfile } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .single();

    const userEmail = (await supabaseAdmin.auth.admin.getUserById(userId)).data?.user?.email;
    if (userEmail) {
      const firstName = (userProfile?.display_name || '').split(' ')[0] || 'there';
      const email = recruiterWelcomeEmail({ displayName: firstName, referralCode: data.referral_code });
      await resend.emails.send({ from: FROM_EMAIL, to: userEmail, subject: email.subject, html: email.html });
    }
  } catch (err) {
    console.error('Recruiter welcome email failed:', err);
  }

  return NextResponse.json({ id: data.id, referralCode: data.referral_code });
}
