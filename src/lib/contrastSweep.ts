/**
 * CRWN — rendered-DOM contrast sweep.
 *
 * The design review found seventeen real failures that were invisible to
 * inspection, all the same shape: a token validated on #0f0f0f reused inside a
 * gold-tinted card or over a gradient, where the true composited ground is
 * lighter. `backgroundColor` alone cannot see that; `groundOf` composites every
 * ancestor paint INCLUDING gradient stops, which is what makes this honest.
 *
 * Browser only — it reads getComputedStyle. The pure decision lives in
 * `auditContrast` (contrast.ts) so it is unit-tested in the node test env.
 *
 * Usage:
 *   import { sweepContrast } from '@/lib/contrastSweep';
 *   sweepContrast();                    // -> failures[], also console.table'd
 *   sweepContrast({ root: cardEl });    // scope it to one subtree
 */

import { auditContrast, groundOf, type RGB, type ContrastVerdict } from './contrast';

export interface ContrastFailure extends ContrastVerdict {
  /** A short CSS-ish path so the node is findable without a screenshot. */
  selector: string;
  text: string;
  color: string;
  ground: string;
  fontSizePx: number;
  fontWeight: number;
}

const rgb = (c: RGB) => `rgb(${c.map((v) => Math.round(v)).join(', ')})`;

const nums = (s: string): number[] => (s.match(/[\d.]+/g) || []).map(Number);

/** Enough of a path to find the node in devtools, without dumping the tree. */
function pathTo(el: Element, limit = 4): string {
  const parts: string[] = [];
  let n: Element | null = el;
  while (n && parts.length < limit && n !== document.body) {
    let part = n.tagName.toLowerCase();
    if (n.id) {
      parts.unshift(`${part}#${n.id}`);
      break;
    }
    const cls = (n.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (cls.length) part += '.' + cls.join('.');
    parts.unshift(part);
    n = n.parentElement;
  }
  return parts.join(' > ');
}

export interface SweepOptions {
  root?: ParentNode;
  /** Log a console.table of failures. Default true. */
  log?: boolean;
}

/**
 * Walks every rendered text node and returns the ones failing WCAG AA for their
 * size and weight. Deliberately skips what is not real text: empty nodes,
 * invisible nodes, deliberately de-emphasised nodes (opacity < 0.9), and
 * background-clip:text elements whose glyphs ARE the gradient.
 */
export function sweepContrast({ root = document, log = true }: SweepOptions = {}): ContrastFailure[] {
  if (typeof window === 'undefined') return [];
  const failures: ContrastFailure[] = [];

  root.querySelectorAll('*').forEach((el) => {
    if (el.children.length) return; // leaf text only
    const text = (el.textContent || '').trim();
    if (!text) return;

    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return;
    if (parseFloat(cs.opacity) < 0.9) return; // deliberately muted
    const clip = (cs as CSSStyleDeclaration & { webkitBackgroundClip?: string }).webkitBackgroundClip;
    if (clip === 'text' || cs.backgroundClip === 'text') return; // gradient glyphs
    if (cs.webkitTextFillColor && /rgba\(.*,\s*0\)/.test(cs.webkitTextFillColor)) return;

    const ink = nums(cs.color).slice(0, 3) as RGB;
    if (ink.length < 3) return;
    // Fully transparent ink paints nothing.
    const alpha = nums(cs.color)[3];
    if (alpha !== undefined && alpha === 0) return;

    const fontSizePx = parseFloat(cs.fontSize);
    const fontWeight = parseInt(cs.fontWeight, 10) || 400;
    const ground = groundOf(el);
    const verdict = auditContrast(ink, ground, fontSizePx, fontWeight);
    if (verdict.pass) return;

    failures.push({
      ...verdict,
      selector: pathTo(el),
      text: text.length > 48 ? text.slice(0, 45) + '...' : text,
      color: rgb(ink),
      ground: rgb(ground),
      fontSizePx,
      fontWeight,
    });
  });

  if (log && typeof console !== 'undefined') {
    if (failures.length) {
      console.warn(`[contrast sweep] ${failures.length} node(s) below WCAG AA`);
      console.table(
        failures.map((f) => ({
          ratio: f.ratio,
          needs: f.required,
          text: f.text,
          ink: f.color,
          ground: f.ground,
          at: f.selector,
        }))
      );
    } else {
      console.info('[contrast sweep] clean: every text node clears WCAG AA');
    }
  }

  return failures;
}

// Dev convenience: window.__crwnContrastSweep() from any page, any time.
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  (window as Window & { __crwnContrastSweep?: typeof sweepContrast }).__crwnContrastSweep = sweepContrast;
}
