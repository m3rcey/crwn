import type { ArtistContext } from '@/hooks/useArtistContext';
import type { GuidedEntry } from '@/hooks/useGuidedEntry';

/** What every guided flow receives: the signed-in artist and the pointer context. */
export interface GuidedFlowProps {
  context: ArtistContext;
  entry: GuidedEntry;
}
