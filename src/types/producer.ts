// Executive Producer Session types — see schema-phase2-producer-sessions.sql.
// Dark-launched behind admin_settings.producer_sessions.

export type SubmissionKind = 'beat' | 'vocal' | 'idea' | 'reference' | 'other';
export type SubmissionStatus = 'pending' | 'shortlisted' | 'featured' | 'rejected' | 'archived';

export interface SessionSubmission {
  id: string;
  session_id: string;
  artist_id: string;
  fan_id: string;
  kind: SubmissionKind;
  title: string | null;
  note: string | null;
  link_url: string | null;
  file_key: string | null;
  file_name: string | null;
  file_size: number | null;
  content_type: string | null;
  status: SubmissionStatus;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  sort_order: number | null;
  consent_version: string | null;
  created_at: string;
  updated_at: string;
}

export type PollStatus = 'open' | 'closed';

export interface PollOption {
  id: string;
  label: string;
}

export interface SessionPoll {
  id: string;
  session_id: string;
  artist_id: string;
  question: string;
  options: PollOption[];
  status: PollStatus;
  created_at: string;
  closed_at: string | null;
}

// A poll plus its aggregate tally, as returned by the polls route. `myVote` is
// the option id the requesting fan chose, or null.
export interface SessionPollWithTally extends SessionPoll {
  tally: Record<string, number>; // optionId -> count
  totalVotes: number;
  myVote: string | null;
}
