import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  canSubmitToSession,
  ownsSession,
  isProducerSessionsEnabled,
  SUBMISSION_KINDS,
  MAX_SUBMISSION_NOTE_LEN,
} from '@/lib/producer/access';
import { PRODUCER_SUBMISSION_AGREEMENT_VERSION } from '@/lib/producer/consent';
import type { SubmissionKind, SubmissionStatus } from '@/types/producer';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const SELECT =
  'id, session_id, artist_id, fan_id, kind, title, note, link_url, file_key, file_name, file_size, content_type, status, review_note, reviewed_by, reviewed_at, sort_order, consent_version, created_at, updated_at';

// GET /api/producer/submissions?sessionId=...
// Artist owner sees the whole queue; a fan sees only their own submissions.
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sessionId = req.nextUrl.searchParams.get('sessionId');
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });

  if (!(await isProducerSessionsEnabled(supabaseAdmin))) {
    return NextResponse.json({ enabled: false, submissions: [] });
  }

  const owner = await ownsSession(supabaseAdmin, sessionId, user.id);
  let query = supabaseAdmin.from('session_submissions').select(SELECT).eq('session_id', sessionId);
  query = owner
    ? query.order('sort_order', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true })
    : query.eq('fan_id', user.id).order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ enabled: true, isOwner: !!owner, submissions: data || [] });
}

// POST /api/producer/submissions
// Fan creates a submission. Text-only (idea/reference) needs note/link; a beat or
// vocal carries a fileKey already uploaded via the signer. Gated + rate-limited.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { sessionId } = body;
  const kind = (body.kind as SubmissionKind) || 'idea';
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  if (!SUBMISSION_KINDS.includes(kind)) return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });

  const limited = !(await checkRateLimit(user.id, 'producer-submit', 3600, 20));
  if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const gate = await canSubmitToSession(supabaseAdmin, sessionId, user.id);
  if (!gate.ok) {
    const status = gate.reason === 'no_access' ? 403 : gate.reason === 'not_found' ? 404 : 409;
    return NextResponse.json({ error: gate.reason }, { status });
  }

  // Consent gate: the client must echo the CURRENT agreement version, proving it
  // rendered the terms the fan is agreeing to. A stale or absent version is refused.
  if (body.consentVersion !== PRODUCER_SUBMISSION_AGREEMENT_VERSION) {
    return NextResponse.json({ error: 'agreement_required', version: PRODUCER_SUBMISSION_AGREEMENT_VERSION }, { status: 400 });
  }

  const note = typeof body.note === 'string' ? body.note.trim().slice(0, MAX_SUBMISSION_NOTE_LEN) : null;
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : null;
  const linkUrl = typeof body.linkUrl === 'string' ? body.linkUrl.trim().slice(0, 500) : null;
  const fileKey = typeof body.fileKey === 'string' ? body.fileKey : null;

  // A file submission's key must live under this fan's namespace for this session,
  // so a caller can't attach someone else's uploaded object.
  if (fileKey && !fileKey.startsWith(`producer-submissions/${sessionId}/${user.id}/`)) {
    return NextResponse.json({ error: 'Invalid file reference' }, { status: 400 });
  }
  // Every submission must carry SOMETHING: a file, a note, or a link.
  if (!fileKey && !note && !linkUrl) {
    return NextResponse.json({ error: 'Add a file, a note, or a link' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('session_submissions')
    .insert({
      session_id: sessionId,
      artist_id: gate.session!.artist_id,
      fan_id: user.id,
      kind,
      title,
      note,
      link_url: linkUrl,
      file_key: fileKey,
      file_name: typeof body.fileName === 'string' ? body.fileName.slice(0, 200) : null,
      file_size: typeof body.fileSize === 'number' ? body.fileSize : null,
      content_type: typeof body.contentType === 'string' ? body.contentType.slice(0, 100) : null,
      status: 'pending',
      consent_version: PRODUCER_SUBMISSION_AGREEMENT_VERSION,
    })
    .select(SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ submission: data });
}

// PATCH /api/producer/submissions
// Artist review: change status, add a note, set presentation order. Owner only.
export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { submissionId } = body;
  if (!submissionId) return NextResponse.json({ error: 'Missing submissionId' }, { status: 400 });

  const { data: existing } = await supabaseAdmin
    .from('session_submissions')
    .select('id, session_id')
    .eq('id', submissionId)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const owner = await ownsSession(supabaseAdmin, existing.session_id, user.id);
  if (!owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const VALID: SubmissionStatus[] = ['pending', 'shortlisted', 'featured', 'rejected', 'archived'];
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.status === 'string') {
    if (!VALID.includes(body.status as SubmissionStatus)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    update.status = body.status;
    update.reviewed_by = user.id;
    update.reviewed_at = new Date().toISOString();
  }
  if (typeof body.reviewNote === 'string') update.review_note = body.reviewNote.slice(0, 1000);
  if (typeof body.sortOrder === 'number') update.sort_order = Math.round(body.sortOrder);

  const { data, error } = await supabaseAdmin
    .from('session_submissions')
    .update(update)
    .eq('id', submissionId)
    .select(SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ submission: data });
}
