// Artifact continuity, pinned after the 2026-09-19 audit.
//
// The artist builds a named thing, and then signup, the email screen, the verified screen and the
// first in-app screen each described something generic. These tests pin the ONE label every one
// of those boundaries now reads, and that every boundary actually reads it.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { artifactLabel, artifactNoun, fanPageArtifactLabel } from './artifactLabel';
import { getDeliverableSpec, DELIVERABLE_SPECS } from './deliverableSpecs';
import { pickSavedArtifact } from '@/lib/leadResults/savedArtifact';

const vault = getDeliverableSpec('vault-revenue-planner')!;

describe('the label names what the artist built, in their words', () => {
  it('uses the name they typed, plus one identifying choice', () => {
    const label = artifactLabel(vault, { tierName: 'Marcus Private Vault', price: 25, cadence: 'monthly' })!;
    expect(label.noun).toBe('Vault');
    expect(label.name).toBe('Marcus Private Vault');
    expect(label.savedLine).toBe('Marcus Private Vault is saved');
    expect(label.continueLabel).toBe('Continue Marcus Private Vault');
    expect(label.detail).toBe('$25 a month, monthly drops');
  });

  it('tells two artifacts of the same kind apart', () => {
    const a = artifactLabel(vault, { tierName: 'Jaylen Vault', price: 10, cadence: 'monthly' })!;
    const b = artifactLabel(vault, { tierName: 'Marcus Private Vault', price: 25, cadence: 'weekly' })!;
    expect(a.savedLine).not.toBe(b.savedLine);
    expect(a.detail).not.toBe(b.detail);
  });

  it('never invents a name: no title means "Your Vault", and no work at all means null', () => {
    expect(artifactLabel(vault, { price: 10 })!.savedLine).toBe('Your Vault is saved');
    expect(artifactLabel(vault, { price: 10 })!.continueLabel).toBe('Continue my Vault');
    expect(artifactLabel(vault, {})).toBeNull();
    expect(artifactLabel(vault, null)).toBeNull();
    expect(artifactLabel(vault, { tierName: '', categories: [] })).toBeNull();
  });

  it('describes a ladder by its rungs, not by one name', () => {
    const spec = getDeliverableSpec('opportunity-calculator')!;
    const label = artifactLabel(spec, { t0Name: 'Bronze', t1Name: 'Silver', t2Name: 'Gold', t3Name: 'Platinum' })!;
    expect(label.name).toBeNull();
    expect(label.savedLine).toBe(`Your ${artifactNoun(spec.saveLabel)} is saved`);
    expect(label.detail).toBe('Bronze, Silver, Gold, Platinum');
  });

  it('quotes a fan page headline instead of making a sentence the subject', () => {
    const label = fanPageArtifactLabel({ headline: 'Get everything first', ctaLabel: 'Join the list' })!;
    expect(label.savedLine).toBe('Your fan page "Get everything first" is saved');
    expect(label.continueLabel).toBe('Continue my fan page');
    expect(label.detail).toBe('Button: Join the list');
    expect(fanPageArtifactLabel({})).toBeNull();
    expect(fanPageArtifactLabel(null)).toBeNull();
  });

  it('is plain text: markup and line breaks in artist prose never ride into a label', () => {
    const label = artifactLabel(vault, { tierName: '<img src=x onerror=alert(1)>\nVault', price: 10 })!;
    expect(label.savedLine).not.toMatch(/[<>\n]/);
    expect(artifactLabel(vault, { tierName: 'x'.repeat(200) })!.name!.length).toBeLessThanOrEqual(60);
  });

  it('can name every active deliverable: each save label yields a noun', () => {
    for (const spec of DELIVERABLE_SPECS) {
      const noun = artifactNoun(spec.saveLabel);
      // The noun comes OUT of the save label ("Save my Vault" -> "Vault"); the 'plan' fallback is
      // only acceptable for a label that really says plan.
      expect(spec.saveLabel, spec.toolSlug).toContain(noun);
      expect(noun.length, spec.toolSlug).toBeGreaterThan(2);
      expect(noun, spec.toolSlug).not.toMatch(/^(save|my)\b/i);
    }
  });

  it('writes no em dash or en dash into any label', () => {
    const label = artifactLabel(vault, { tierName: 'Marcus Private Vault', price: 25, cadence: 'monthly' })!;
    expect(`${label.savedLine} ${label.continueLabel} ${label.detail}`).not.toMatch(/[—–]/);
  });
});

describe('the artifact that is NAMED after signup is the one that is RESTORED', () => {
  const vaultRow = { tool_slug: 'vault-revenue-planner', input_data: { deliverableValues: { tierName: 'Marcus Private Vault', price: 25, cadence: 'monthly' } } };
  const emailedResultRow = { tool_slug: 'opportunity-calculator', input_data: { social_followers: 60000 } };
  const fanPageRow = { tool_slug: 'own-your-fans-calculator', input_data: { builderDraft: { headline: 'Get everything first', ctaLabel: 'Join' } } };

  it('names the builder draft, not the newer emailed result sitting above it', () => {
    // Two rows is the normal case: the artist emailed themselves the result AND saved a draft.
    const picked = pickSavedArtifact([emailedResultRow, vaultRow])!;
    expect(picked.toolSlug).toBe('vault-revenue-planner');
    expect(picked.kind).toBe('deliverable');
    expect(picked.label?.savedLine).toBe('Marcus Private Vault is saved');
  });

  it('keeps distinctive text attached to the right artifact when several exist', () => {
    const jaylenRow = { tool_slug: 'vault-revenue-planner', input_data: { deliverableValues: { tierName: 'Jaylen Vault', price: 10 } } };
    expect(pickSavedArtifact([vaultRow, jaylenRow])!.label?.name).toBe('Marcus Private Vault');
    expect(pickSavedArtifact([jaylenRow, vaultRow])!.label?.name).toBe('Jaylen Vault');
  });

  it('names an Own Your Fans page by its headline', () => {
    const picked = pickSavedArtifact([fanPageRow])!;
    expect(picked.kind).toBe('fan_page');
    expect(picked.label?.savedLine).toContain('Get everything first');
  });

  it('prefers a deliverable over a fan page, matching post-setup-destination', () => {
    expect(pickSavedArtifact([fanPageRow, vaultRow])!.kind).toBe('deliverable');
  });

  it('says nothing was saved when nothing was', () => {
    expect(pickSavedArtifact([emailedResultRow])).toBeNull();
    expect(pickSavedArtifact([])).toBeNull();
    expect(pickSavedArtifact([{ tool_slug: null, input_data: null }])).toBeNull();
  });

  it('sanitizes stored values through the spec before naming them', () => {
    const picked = pickSavedArtifact([{ tool_slug: 'vault-revenue-planner', input_data: { deliverableValues: { tierName: 'Real Vault', notAField: 'ignored', cadence: 'hacked' } } }])!;
    expect(picked.label?.name).toBe('Real Vault');
    expect(picked.label?.detail ?? '').not.toContain('hacked');
  });
});

describe('every boundary reads the same label', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

  it('signup card, email screen, verified screen, setup intro and plan page all carry it', () => {
    const signupCard = read('components/opportunity/DraftContinuation.tsx');
    expect(signupCard).toContain('artifactLabel(');
    expect(signupCard).toContain('fanPageArtifactLabel(');
    expect(signupCard).toContain('label.savedLine');

    expect(read('app/(auth)/signup/page.tsx')).toContain('savedArtifactLine=');
    expect(read('components/auth/AuthForm.tsx')).toContain('savedArtifactLine');

    const verify = read('app/verify/page.tsx');
    expect(verify).toContain('artifact.savedLine');
    // The honest failure: a draft that did not land is SAID, with a way back, never "all set".
    expect(verify).toContain('could not be restored');
    expect(verify).toContain('Run the calculator again');

    const setup = read('app/setup/page.tsx');
    expect(setup).toContain("artifact?.savedLine ?? 'Your CRWN plan is saved'");
    expect(setup).toContain('artifact.continueLabel');

    expect(read('app/(main)/plan/[tool]/page.tsx')).toContain('artifactLabel(spec, values)');
  });

  it('resolves the label server-side from the SESSION user, reading nothing from the request', () => {
    const route = read('app/api/lead-results/auto-claim/route.ts');
    expect(route).toContain('findSavedArtifact(supabaseAdmin, user.id)');
    expect(route).toMatch(/export async function POST\(\)/); // still takes no request at all
    expect(route).toContain('draftUnrestored');
  });

  it('the signup card names an Own Your Fans page from the stored draft, not from spec defaults', () => {
    const signupCard = read('components/opportunity/DraftContinuation.tsx');
    // `draft.draft` is the OYF payload. It must be handled BEFORE the generic-defaults fallback.
    expect(signupCard.indexOf('if (draft.draft)')).toBeGreaterThan(-1);
    expect(signupCard.indexOf('if (draft.draft)')).toBeLessThan(signupCard.indexOf('spec.prefill({})'));
  });
});
