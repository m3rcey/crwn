// Capture-funnel contract tests.
//
// These exist because CRWN shipped a nurture sequence that could never receive a lead, and nothing
// in the suite noticed. They read the actual source, so a regression that re-hides the capture
// surface, drops an analytics event, or lets /worth infer marketing consent fails loudly.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(__dirname, '../../..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf8');

const publicToolClient = read('src/components/lead-magnets/PublicToolClient.tsx');
const captureForm = read('src/components/lead-magnets/LeadCaptureForm.tsx');
const worth = read('src/app/(public)/worth/WorthExperience.tsx');
const worthApi = read('src/app/api/leads/calculator/route.ts');
const captureApi = read('src/app/api/lead-magnets/capture/route.ts');
const analytics = read('src/lib/leadMagnets/analytics.ts');
const analyticsRoute = read('src/app/api/lead-magnets/analytics/route.ts');
const exposureHook = read('src/hooks/useViewportExposure.ts');

describe('the capture surface is reachable on registry calculators', () => {
  // Anchored on the full-result JSX block, same technique as pageComposition.test.ts.
  const fullPhase = publicToolClient.slice(publicToolClient.indexOf("phase === 'full' && result && !editing"));

  it('still renders the capture form for an anonymous visitor', () => {
    expect(fullPhase).toContain('<LeadCaptureForm');
    // It is the else-branch of the resultId check: a visitor who has NOT captured sees the form.
    expect(fullPhase).toMatch(/resultId \?[\s\S]{0,400}<LeadCaptureForm/);
  });

  it('renders the capture BEFORE the builder, which owns the navigating exit', () => {
    // The proven defect: the builder's Wizard footer is `sticky bottom-0`, so its Continue/Save is
    // pinned to the viewport whenever the builder is on screen, and the final press router.push()es
    // to signup. Anything after the builder is behind a permanently visible exit. Moving the card
    // from "after the hand-raiser" to "after the builder" only shortened the distance to it.
    const capture = fullPhase.indexOf('<LeadCaptureForm');
    const builder = fullPhase.indexOf('ref={builderRef}');
    expect(capture).toBeGreaterThan(-1);
    expect(capture).toBeLessThan(builder);
  });

  it('still delivers the result first, so nothing is traded for the placement', () => {
    const capture = fullPhase.indexOf('<LeadCaptureForm');
    expect(fullPhase.indexOf('<LeadMagnetResult')).toBeLessThan(capture);
    expect(fullPhase.indexOf('<ResultToBuilder')).toBeLessThan(capture);
  });

  it('does not compete with the primary CTA for gold', () => {
    // ResultToBuilder immediately above is the gold primary action. A second gold block would read
    // as the required next step, which is exactly what this card must not look like. Caught by
    // LOOKING at the rendered page, not by a unit test: side by side, the full-width gold capture
    // button was visually louder than the primary CTA it sat under.
    expect(fullPhase).toMatch(/ref=\{captureRef\}[^>]*border-crwn-elevated/);
    expect(fullPhase).not.toMatch(/ref=\{captureRef\}[^>]*border-crwn-gold/);
    // The submit button itself must stay secondary.
    expect(captureForm).not.toMatch(/onClick=\{submit\}[\s\S]{0,200}bg-crwn-gold/);
    expect(captureForm).toMatch(/onClick=\{submit\}[\s\S]{0,240}bg-crwn-elevated/);
  });
});

describe('consent is explicit and never inferred', () => {
  it('never pre-checks the box on a registry calculator', () => {
    expect(captureForm).toContain('emailConsent: false');
    expect(captureForm).toMatch(/checked=\{v\.emailConsent\}/);
    expect(captureForm).not.toMatch(/defaultChecked/);
  });

  it('refuses to submit without consent', () => {
    expect(captureForm).toMatch(/if \(!v\.emailConsent\) return setError/);
  });

  it('never pre-checks the box on /worth', () => {
    expect(worth).toContain('useState(false)');
    expect(worth).toMatch(/checked=\{emailConsent\}/);
    expect(worth).not.toMatch(/defaultChecked/);
  });

  it('makes /worth send consent explicitly rather than inferring it from an email', () => {
    expect(worth).toMatch(/emailConsent,/);
    // The transactional breakdown must not be conditional on the marketing box.
    expect(worthApi).toMatch(/if \(body\.emailConsent === true\)/);
  });

  it('keeps enrollment gated on consent in the canonical enroller', () => {
    const enroll = read('src/lib/prospectNurture/enroll.ts');
    expect(enroll).toMatch(/input\.emailConsent !== true[\s\S]*no_consent/);
  });
});

describe('/worth enrolls through the canonical nurture, not a second system', () => {
  it('calls the shared enrollProspect rather than writing its own enrollment', () => {
    expect(worthApi).toContain("from '@/lib/prospectNurture/enroll'");
    expect(worthApi).toMatch(/await enrollProspect\(/);
    expect(worthApi).not.toMatch(/from\('prospect_nurture_enrollments'\)/);
  });

  it('creates the lead row the enroller requires, with a consent audit trail', () => {
    expect(worthApi).toMatch(/from\('lead_magnet_leads'\)/);
    expect(worthApi).toContain('email_consent: true');
    expect(worthApi).toContain('CONSENT_TEXT_VERSION');
    expect(worthApi).toContain('consented_at');
  });

  it('binds to the existing draft when there is one, instead of duplicating the result', () => {
    expect(worthApi).toMatch(/public_token', token/);
    expect(worthApi).toMatch(/lead_id: lmLead\.id/);
  });

  it('writes result_data in the shape the nurture tokens actually read', () => {
    // buildNurtureTokens reads these three. A different shape renders the no-number fallback.
    for (const key of ['heroValue', 'estimatedMonthlyCents', 'estimatedAnnualCents']) {
      expect(worthApi, key).toContain(key);
    }
  });

  it('uses the slug the nurture module and cron already understand', () => {
    expect(worthApi).toMatch(/WORTH_SLUG = 'worth'/);
    const modules = read('src/lib/prospectNurture/calculatorModules.ts');
    expect(modules).toMatch(/^\s+worth: \{/m);
  });

  it('never lets a nurture failure break the capture the visitor asked for', () => {
    expect(worthApi).toMatch(/catch \(err\)[\s\S]{0,160}Worth nurture enrollment failed/);
  });
});

describe('the capture funnel is measurable end to end', () => {
  it('fires the capture-exposure event that was previously dead', () => {
    // Both of these were DEFINED and allowlisted but called by nothing, so the funnel had no
    // denominator and "nobody saw it" was indistinguishable from "saw it and declined".
    expect(analytics).toContain('leadCaptureViewed');
    expect(captureForm).toMatch(/trackLeadMagnet\(LM_EVENTS\.leadCaptureViewed/);
    expect(worth).toMatch(/trackLeadMagnet\(LM_EVENTS\.leadCaptureViewed/);
  });

  it('means VIEWPORT EXPOSURE, never component mount, on both surfaces', () => {
    // The first wiring fired this from a mount effect. Measured on a 375x667 phone, the card mounts
    // at y=588 with the fold at 667, so "mounted" counted a card the visitor could not see, and
    // every rate measured against it would have been wrong in the flattering direction.
    for (const [name, src] of [['registry', captureForm], ['worth', worth]] as const) {
      expect(src, `${name}: must route exposure through the observer hook`).toMatch(/useViewportExposure\(/);
      // No bare mount effect that fires the exposure beacon.
      expect(src, `${name}: exposure must not fire from a mount effect`).not.toMatch(
        /useEffect\(\(\) => \{[^}]*leadCaptureViewed/,
      );
    }
  });

  it('requires the element to STAY visible, so a scroll-past flyby is not an exposure', () => {
    // The primary "Build my ..." CTA scrolls the page past this card. Visibility alone would count
    // that sweep; the dwell is what separates "swept through" from "had a chance to read it".
    expect(exposureHook).toMatch(/dwellMs/);
    expect(exposureHook).toMatch(/setTimeout/);
    expect(exposureHook).toMatch(/intersectionRatio >= threshold/);
    // Leaving the viewport before the dwell elapses cancels the pending fire.
    expect(exposureHook).toMatch(/clear\(\)/);
  });

  it('fires at most once per result experience, surviving remounts and scroll-away-and-back', () => {
    expect(exposureHook).toMatch(/sessionStorage/);
    expect(exposureHook).toMatch(/io\.disconnect\(\)/);
    // Both surfaces pass a stable per-tool key.
    expect(captureForm).toMatch(/key: `crwn_capture_seen:\$\{config\.slug\}`/);
    expect(worth).toMatch(/key: 'crwn_capture_seen:worth'/);
  });

  it('degrades to NOT firing when it cannot observe, rather than to firing on mount', () => {
    // An absent number is honest. An inflated one is not.
    expect(exposureHook).toMatch(/typeof IntersectionObserver === 'undefined'\) return/);
  });

  it('holds the /worth exposure off while the entry wizard is showing', () => {
    // The capture card is not on that surface at all, so an event that could fire there would
    // manufacture a conversion problem that does not exist.
    expect(worth).toMatch(/enabled: !useEntryWizard/);
  });

  it('leaves the capture card partly on screen when the primary CTA scrolls to the builder', () => {
    // Measured: a flush scroll landed the builder at the viewport top with the card 0% visible on
    // a 375x667 phone, so a visitor who tapped the gold CTA never saw the offer. The scroll margin
    // leaves its tail visible. Kept below the exposure threshold so it cannot inflate the metric.
    expect(publicToolClient).toMatch(/ref=\{builderRef\}[^>]*scroll-mt-\[200px\]/);
    expect(worth).toMatch(/ref=\{worthBuilderRef\}[^>]*scroll-mt-\[200px\]/);
  });

  it('fires the submit-attempt event with its consent state on both surfaces', () => {
    for (const [name, src] of [['registry', captureForm], ['worth', worth]] as const) {
      expect(src, name).toMatch(/trackLeadMagnet\(LM_EVENTS\.leadSubmitted/);
      expect(src, name).toMatch(/reasonCode: (?:v\.)?emailConsent \? 'consented' : 'no_consent'/);
    }
  });

  it('records the attempt BEFORE the consent guard, or the two failure modes stay indistinguishable', () => {
    const submitted = captureForm.indexOf('LM_EVENTS.leadSubmitted');
    const guard = captureForm.indexOf('if (!v.emailConsent) return setError');
    expect(submitted).toBeGreaterThan(-1);
    expect(submitted).toBeLessThan(guard);
  });

  it('allowlists every capture event server-side, or the row is silently dropped', () => {
    for (const e of ['lead_magnet_lead_capture_viewed', 'lead_magnet_lead_submitted']) {
      expect(analyticsRoute, e).toContain(e);
    }
  });
});

describe('the transactional result stays independent of marketing permission', () => {
  it('sends the registry result email regardless of the consent box', () => {
    // The email send is guarded by suppression only; consent gates enrollment further down.
    expect(captureApi).toMatch(/if \(!\(await isEmailSuppressed\(supabaseAdmin, email\)\)\)/);
    const emailAt = captureApi.indexOf('leadMagnetResultEmail');
    const enrollAt = captureApi.indexOf('enrollProspect(supabaseAdmin');
    expect(emailAt).toBeGreaterThan(-1);
    expect(enrollAt).toBeGreaterThan(emailAt);
  });

  it('sends the /worth breakdown before and independently of the consent branch', () => {
    const emailAt = worthApi.indexOf('calculatorResultEmail');
    const consentAt = worthApi.indexOf('if (body.emailConsent === true)');
    expect(emailAt).toBeGreaterThan(-1);
    expect(consentAt).toBeGreaterThan(emailAt);
  });
});
