import { Crown, Calculator, KeyRound, Share2, Mic2, Mail, TrendingUp } from 'lucide-react';
import type { ComponentType } from 'react';

/**
 * The vector icon that opens a calculator's hero.
 *
 * The registry already carries an `icon` per tool, but those are EMOJI. Emoji render differently
 * on every platform, cannot take the brand gold, and read as clip art beside the hero photograph,
 * which is the same reason the Studio tiles banned them. These are lucide vectors instead, so the
 * hero icon is one colour, one weight and one system with the section icons below it.
 *
 * Keyed by slug with a `Crown` default, so the fourteen paused tools inherit something correct
 * without needing an entry each. A tool is never blocked from rendering by a missing icon.
 */
export type ToolIcon = ComponentType<{ className?: string; strokeWidth?: number }>;

const ICONS: Record<string, ToolIcon> = {
  // The complete diagnosis: the only tool that models the whole business at once.
  'opportunity-calculator': Calculator,
  // Reach versus direct value. The trend line is the audience the artist already built.
  worth: TrendingUp,
  // Access to what is locked away.
  'vault-revenue-planner': KeyRound,
  // Advocacy, passed from one fan to the next.
  'share-to-earn-planner': Share2,
  // A seat in the room where the record gets made.
  'executive-producer-session': Mic2,
  // The contact permission, which is the thing actually being owned.
  'own-your-fans-calculator': Mail,
};

export function toolIcon(slug: string): ToolIcon {
  return ICONS[slug] ?? Crown;
}
