// Team Splits — shared TypeScript types. Mirrors the columns in
// supabase/schema-phase2-team-splits.sql. Prices are integer CENTS everywhere.

export type DealType =
  | 'campaign_share'
  | 'offer_share'
  | 'subscription_share'
  | 'artist_earnings_share'
  | 'milestone_bonus'
  | 'hybrid'
  | 'custom';

export type RevenueSourceType =
  | 'tier'
  | 'product'
  | 'track'
  | 'live_session'
  | 'booking'
  | 'road_campaign'
  | 'all_earnings'
  | 'custom'
  | 'none';

export type PayoutBasis = 'gross_revenue' | 'net_artist_revenue';

export type StartTrigger =
  | 'on_accept'
  | 'on_deliverable_approval'
  | 'on_date'
  | 'on_first_revenue'
  | 'custom';

export type DealStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'changes_requested'
  | 'accepted'
  | 'active'
  | 'paused'
  | 'completed'
  | 'terminated'
  | 'cancelled'
  | 'disputed'
  | 'expired'
  | 'archived';

export type DeliverableStatus =
  | 'pending'
  | 'submitted'
  | 'revision_requested'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export type EarningStatus = 'held' | 'released' | 'paid' | 'reversed' | 'disputed';

export type PayoutStatus = 'pending' | 'completed' | 'failed';

export type DisputeStatus = 'open' | 'under_review' | 'resolved' | 'rejected' | 'escalated';

export interface TeamSplitDeal {
  id: string;
  artist_id: string;
  collaborator_user_id: string | null;
  collaborator_email: string | null;
  collaborator_name: string | null;
  invite_token: string | null;
  role: string;
  custom_role: string | null;
  title: string;
  description: string | null;
  deal_type: DealType;
  revenue_source_type: RevenueSourceType;
  revenue_source_id: string | null;
  revenue_source_label: string | null;
  payout_basis: PayoutBasis;
  percentage: number | null;
  milestone_amount: number | null;
  milestone_description: string | null;
  upfront_amount: number | null;
  cap_amount: number | null;
  minimum_payout_threshold: number | null;
  start_trigger: StartTrigger;
  starts_at: string | null;
  ends_at: string | null;
  duration_days: number | null;
  payout_starts_after_deliverable_approval: boolean;
  hold_period_days: number;
  auto_approve_deliverable_days: number | null;
  refund_policy: string;
  cancellation_policy: string | null;
  rights_notes: string | null;
  external_agreement_url: string | null;
  status: DealStatus;
  current_version: number;
  terms_snapshot: Record<string, unknown> | null;
  risk_flags: DealWarning[] | null;
  is_high_risk: boolean;
  agreement_version: string | null;
  artist_accepted_at: string | null;
  collaborator_viewed_at: string | null;
  collaborator_accepted_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  changes_requested_at: string | null;
  paused_at: string | null;
  terminated_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamSplitDeliverable {
  id: string;
  deal_id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  status: DeliverableStatus;
  approval_required: boolean;
  submitted_at: string | null;
  submitted_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  revision_notes: string | null;
  file_url: string | null;
  external_link: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface TeamSplitEarning {
  id: string;
  deal_id: string;
  artist_id: string;
  collaborator_user_id: string;
  earning_id: string | null;
  source_type: string | null;
  source_id: string | null;
  basis: string;
  basis_amount: number;
  percentage: number | null;
  gross_amount: number;
  commission_amount: number;
  status: EarningStatus;
  cleared_at: string;
  released_at: string | null;
  paid_at: string | null;
  reason: string | null;
  created_at: string;
}

export type WarningLevel = 'info' | 'warning' | 'high';

export interface DealWarning {
  code: string;
  level: WarningLevel;
  message: string;
}

/** Money buckets shown on both dashboards. All cents. */
export interface CollaboratorBalance {
  estimatedHeld: number;   // accrued but not yet released/cleared
  available: number;       // released + cleared - paid (cashable)
  paid: number;            // already cashed out (completed)
  reversed: number;        // clawed back
}
