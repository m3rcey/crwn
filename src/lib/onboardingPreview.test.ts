import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PREVIEW_QUERY,
  previewUrl,
  previewSignature,
  previewChecklist,
  previewCompletion,
  type PreviewSetupFacts,
} from './onboardingPreview';

const EMPTY: PreviewSetupFacts = {
  slug: '',
  avatarUrl: '',
  hasMusic: false,
  hasTier: false,
  hasProduct: false,
  stripeConnected: false,
};

const src = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8');

describe('previewUrl', () => {
  it('is the artist\'s REAL page, as a visitor, embedded', () => {
    expect(previewUrl('m3rcey')).toBe('/m3rcey?preview=visitor&embed=1');
  });

  it('carries the visitor persona, so the artist sees a fan\'s locks', () => {
    // preview=visitor is the existing persona lens and only ever REMOVES
    // access. Dropping it would show the owner an unlocked page while claiming
    // it is a fan's, which is the exact bug the persona system was built for.
    expect(PREVIEW_QUERY).toContain('preview=visitor');
    expect(PREVIEW_QUERY).toContain('embed=1');
  });

  it('has nothing to show before the page exists', () => {
    expect(previewUrl('')).toBe('');
    expect(previewUrl('   ')).toBe('');
  });
});

describe('previewSignature', () => {
  it('is stable when nothing fan-visible changed', () => {
    expect(previewSignature(EMPTY)).toBe(previewSignature(EMPTY));
  });

  it('changes when the page is claimed', () => {
    expect(previewSignature({ ...EMPTY, slug: 'm3rcey' })).not.toBe(previewSignature(EMPTY));
  });

  it.each([
    ['avatarUrl', { avatarUrl: 'https://x/a.png' }],
    ['hasTier', { hasTier: true }],
    ['hasMusic', { hasMusic: true }],
    ['hasProduct', { hasProduct: true }],
    ['stripeConnected', { stripeConnected: true }],
  ])('changes when %s changes', (_label, patch) => {
    expect(previewSignature({ ...EMPTY, ...patch })).not.toBe(previewSignature(EMPTY));
  });

  it('changes on the nonce, which is how a SECOND upload reloads the frame', () => {
    // hasMusic is already true by then, so the derived facts alone cannot see
    // it. Without the nonce the preview would silently stop updating exactly
    // when the artist is uploading the most.
    const withMusic = { ...EMPTY, hasMusic: true };
    expect(previewSignature(withMusic, 2)).not.toBe(previewSignature(withMusic, 1));
  });
});

describe('previewChecklist', () => {
  it('starts empty and honest', () => {
    expect(previewChecklist(EMPTY).every((i) => !i.done)).toBe(true);
    expect(previewCompletion(EMPTY)).toBe(0);
  });

  it('fills in as the wizard progresses, in wizard order', () => {
    expect(previewChecklist(EMPTY).map((i) => i.key)).toEqual([
      'page',
      'photo',
      'tiers',
      'music',
      'payments',
    ]);
  });

  it('reaches 100% only when every fan-visible piece is real', () => {
    const full: PreviewSetupFacts = {
      slug: 'm3rcey',
      avatarUrl: 'https://x/a.png',
      hasMusic: true,
      hasTier: true,
      hasProduct: true,
      stripeConnected: true,
    };
    expect(previewCompletion(full)).toBe(1);
    expect(previewCompletion({ ...full, hasMusic: false })).toBeLessThan(1);
  });

  it('writes no em dashes (the copy rule applies to preview labels too)', () => {
    for (const item of previewChecklist(EMPTY)) {
      expect(item.label).not.toContain('—');
      expect(item.label).not.toContain('–');
    }
  });
});

// Structural checks. This repo's vitest is node-only (no jsdom, no component
// tests), so the wiring contracts are pinned by reading the source: these are
// the invariants that make the preview real rather than a mockup, and each one
// has a specific failure it prevents.
describe('live preview wiring', () => {
  const preview = src('components/onboarding/LivePagePreview.tsx');
  const wizard = src('app/setup/page.tsx');
  const artistPage = src('app/[slug]/page.tsx');
  const subscribe = src('components/artist/SubscribeSection.tsx');
  const shop = src('components/artist/ShopSection.tsx');
  const previewHook = src('hooks/useArtistPreview.tsx');

  it('renders the REAL artist page, not a second implementation', () => {
    expect(preview).toContain('previewUrl');
    expect(preview).toContain('<iframe');
    // A rebuilt page would have to import the page's own building blocks.
    for (const forked of ['TierCards', 'ShopSection', 'ArtistProfileContent']) {
      expect(preview, forked).not.toContain(forked);
    }
  });

  it('reloads only when the signature changes, never per keystroke', () => {
    expect(preview).toContain('key={version}');
    expect(wizard).toContain('previewSignature(previewFacts, previewNonce)');
  });

  it('binds to the wizard\'s existing source of truth (no duplicate state)', () => {
    // previewFacts is assembled from useArtistSetup's derived values, the same
    // ones the Continue buttons read.
    expect(wizard).toContain('const previewFacts = {');
    expect(wizard).toContain('hasMusic: setup.hasMusic');
    expect(wizard).toContain('hasTier: setup.hasTier');
  });

  it('bumps the preview wherever the wizard already refreshes after a create', () => {
    expect(wizard).toContain('bumpPreview()');
    // The three creates that produce fan-visible content: photo, batch upload,
    // and the generic item create (tiers / track / product).
    expect(wizard.match(/bumpPreview\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('the artist page honours embed=1 and hides the owner chrome', () => {
    expect(artistPage).toContain("resolvedSearch?.embed === '1'");
    expect(artistPage).toContain('embedded={embedded}');
    expect(artistPage).toContain('{!embedded && <PreviewBar />}');
  });

  it('money actions are inert inside the preview', () => {
    // Both subscribe handlers and the shop buy handler stop before checkout.
    expect(subscribe.match(/if \(embedded\) \{/g)?.length ?? 0).toBe(2);
    expect(shop).toContain('if (embedded) {');
  });

  it('embedded survives the non-owner path (it can only remove an action)', () => {
    expect(previewHook).toContain('return { ...INERT, embedded };');
  });

  it('the frame cannot navigate the wizard away or post a form', () => {
    // Read the attribute itself, not the file: the comment above it names the
    // very tokens that must not appear in the value.
    const sandbox = preview.match(/sandbox="([^"]*)"/)?.[1];
    expect(sandbox).toBe('allow-same-origin allow-scripts allow-popups');
    expect(sandbox).not.toContain('allow-top-navigation');
    expect(sandbox).not.toContain('allow-forms');
  });

  it('the fixed sheet portals to body (a transformed ancestor would trap it)', () => {
    expect(preview).toContain('createPortal(');
    expect(preview).toContain('document.body');
    expect(preview).toContain('z-[100]');
  });

  it('respects reduced motion on the only animation it has', () => {
    expect(preview).toContain('motion-reduce:transition-none');
  });
});

describe('same-origin framing', () => {
  const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8');

  it('still blocks every cross-origin framer', () => {
    // frame-ancestors 'self' is what modern browsers enforce, and it is exactly
    // as strict as DENY for anyone who is not thecrwn.app.
    expect(config).toContain("frame-ancestors 'self'");
    expect(config).toContain("value: 'SAMEORIGIN'");
    expect(config).not.toContain("value: 'DENY'");
  });
});
