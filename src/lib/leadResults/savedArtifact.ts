// Which artifact did this account actually save before signing up, and what is it called?
//
// ONE rule, read by both sides of the account boundary: the post-setup destination (where the
// artist is sent to continue) and the screens that NAME the artifact on the way there (the
// verified screen, the setup intro). They used to be two reads of "the newest row", which can
// disagree: an artist who emailed themselves a result AND saved a builder draft has two rows, and
// naming one while restoring the other is exactly the broken continuity this exists to close.
//
// The rule: the newest of the caller's own recent rows that carries builder work. Always scoped
// by the SESSION user id the caller passes; never by a client-supplied id or token.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getDeliverableSpec, sanitizeDeliverableValues } from '@/lib/opportunityDrafts/deliverableSpecs';
import { artifactLabel, fanPageArtifactLabel, type ArtifactLabel } from '@/lib/opportunityDrafts/artifactLabel';

export interface SavedArtifactRow {
  tool_slug: string | null;
  input_data: Record<string, unknown> | null;
}

export interface SavedArtifact {
  toolSlug: string;
  /** `deliverable` restores through /plan/<tool>; `fan_page` is the Own Your Fans builder draft. */
  kind: 'deliverable' | 'fan_page';
  /** Null when the row carries builder work CRWN can no longer name (a retired spec, say). */
  label: ArtifactLabel | null;
}

/**
 * Pure: rows must arrive newest first.
 *
 * A deliverable draft wins over a fan-page draft, newest first within each. That is deliberately
 * the SAME precedence `post-setup-destination` uses to pick `savedDeliverableTool` (the newest row
 * carrying `deliverableValues`), so the artifact that gets NAMED is the one that gets RESTORED.
 */
export function pickSavedArtifact(rows: SavedArtifactRow[]): SavedArtifact | null {
  const usable = rows.filter((r) => r.tool_slug && r.input_data && typeof r.input_data === 'object');
  const deliverable = usable.find((r) => r.input_data!.deliverableValues);
  if (deliverable) {
    const spec = getDeliverableSpec(deliverable.tool_slug!);
    const label = spec ? artifactLabel(spec, sanitizeDeliverableValues(spec, deliverable.input_data!.deliverableValues)) : null;
    return { toolSlug: deliverable.tool_slug!, kind: 'deliverable', label };
  }
  const fanPage = usable.find((r) => r.input_data!.builderDraft);
  if (fanPage) {
    return {
      toolSlug: fanPage.tool_slug!,
      kind: 'fan_page',
      label: fanPageArtifactLabel(fanPage.input_data!.builderDraft as { headline?: unknown; ctaLabel?: unknown }),
    };
  }
  return null;
}

export async function findSavedArtifact(admin: SupabaseClient, userId: string): Promise<SavedArtifact | null> {
  try {
    const { data } = await admin
      .from('lead_magnet_results')
      .select('tool_slug, input_data')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);
    return pickSavedArtifact((data ?? []) as SavedArtifactRow[]);
  } catch {
    return null; // naming the artifact must never block the handoff
  }
}
