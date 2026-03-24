import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifySurveyToken } from '@/lib/surveyTokens';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export async function POST(req: NextRequest) {
  try {
    const { token, answers, npsScore } = await req.json();

    if (!token || !answers) {
      return NextResponse.json({ error: 'Missing token or answers' }, { status: 400 });
    }

    const payload = verifySurveyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid or expired survey link' }, { status: 401 });
    }

    // Check if already responded
    const { data: existing } = await supabaseAdmin
      .from('survey_responses')
      .select('id')
      .eq('respondent_id', payload.respondentId)
      .eq('survey_type', payload.surveyType)
      .eq('artist_id', payload.artistId || '')
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'You have already submitted this survey' }, { status: 409 });
    }

    await supabaseAdmin.from('survey_responses').insert({
      survey_type: payload.surveyType,
      respondent_id: payload.respondentId,
      artist_id: payload.artistId || null,
      answers,
      nps_score: typeof npsScore === 'number' ? npsScore : null,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Survey submission error:', error);
    const message = error instanceof Error ? error.message : 'Failed to submit';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
