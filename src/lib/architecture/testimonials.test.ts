// TESTIMONIAL-001..009: the fan testimonial boundary, asserted against the SOURCE.
//
// core.test.ts pins the pure decisions. This suite pins the things a pure function cannot see:
// which module a route trusts for identity, whether an edit path exists at all, whether the public
// view can be widened, and whether the ask can grow a second delivery channel.
//
// Each test names the mutation it catches. Vitest runs node-env, so components and routes are read
// as SOURCE TEXT rather than imported, matching navigation.test.ts.

import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { readStripped, readRaw, violation } from './sourceScan';
import { INVARIANTS } from './invariants';

const CORE = 'src/lib/testimonials/core.ts';
const SERVER = 'src/lib/testimonials/server.ts';
const PUBLIC_READ = 'src/lib/testimonials/publicRead.ts';
const FAN_ROUTE = 'src/app/api/testimonials/route.ts';
const ARTIST_ROUTE = 'src/app/api/artist/testimonials/route.ts';
const CRON = 'src/app/api/cron/testimonial-requests/route.ts';
const MIGRATION = 'supabase/schema-phase2-fan-testimonials.sql';
const POPUPS = 'src/lib/popups/registry.ts';
const PUBLIC_SECTION = 'src/components/artist/PublicTestimonials.tsx';
const LIBRARY = 'src/components/artist/TestimonialLibrary.tsx';
const FAN_CARD = 'src/components/fan/TestimonialRequestCard.tsx';

const DOC = 'docs/crwn-brain/27-AUTOMATED-FAN-TESTIMONIALS-ARCHITECTURE.md';

describe('the feature exists where the registry says it does', () => {
  it('every module the invariants name is present', () => {
    for (const f of [CORE, SERVER, PUBLIC_READ, FAN_ROUTE, ARTIST_ROUTE, CRON, MIGRATION, PUBLIC_SECTION, LIBRARY, FAN_CARD]) {
      expect(existsSync(f), violation('TESTIMONIAL-001', `${f} is gone; the invariants below are scanning nothing`, { docs: DOC })).toBe(true);
    }
  });

  it('all nine invariants are registered', () => {
    const ids = INVARIANTS.filter((i) => i.id.startsWith('TESTIMONIAL-')).map((i) => i.id).sort();
    expect(ids).toEqual([
      'TESTIMONIAL-001', 'TESTIMONIAL-002', 'TESTIMONIAL-003', 'TESTIMONIAL-004',
      'TESTIMONIAL-005', 'TESTIMONIAL-006', 'TESTIMONIAL-007', 'TESTIMONIAL-008', 'TESTIMONIAL-009',
    ]);
  });
});

describe('TESTIMONIAL-001 — the artist manages visibility, never authorship', () => {
  // MUTATION: add `body` to the artist route's accepted payload, or to the update patch in
  // setTestimonialVisibility. Both tests below fail.
  it('the artist route never reads a body/text field off the request payload', () => {
    const src = readStripped(ARTIST_ROUTE);
    for (const field of ['payload?.body', 'payload.body', 'payload?.text', 'payload?.responseText', 'response_text']) {
      expect(
        src.includes(field),
        violation('TESTIMONIAL-001', `the artist route reads ${field}. Visibility ownership is not content authorship: an artist may feature or hide a testimonial, never rewrite it.`, { file: ARTIST_ROUTE, docs: DOC }),
      ).toBe(false);
    }
  });

  it('the artist visibility writer patches only visibility columns', () => {
    const src = readStripped(SERVER);
    const fn = src.slice(src.indexOf('export async function setTestimonialVisibility'));
    const body = fn.slice(0, fn.indexOf('\nexport '));
    expect(body.length, 'setTestimonialVisibility not found').toBeGreaterThan(100);
    for (const forbidden of ['body:', 'display_identity:', 'fan_id:', 'prompt_key:']) {
      expect(
        body.includes(forbidden),
        violation('TESTIMONIAL-001', `setTestimonialVisibility writes ${forbidden}, which is authorship, not visibility.`, { file: SERVER, docs: DOC }),
      ).toBe(false);
    }
    expect(body).toContain('featured_at');
  });

  it('the database freezes the body as a second line, independent of any route', () => {
    const sql = readRaw(MIGRATION);
    expect(sql).toContain('trg_freeze_testimonial_body');
    expect(sql).toContain('NEW.body                       := OLD.body;');
    expect(
      sql,
      violation('TESTIMONIAL-001', 'the freeze must also pin fan_id and artist_id, or a row can be reassigned to another author or another artist.', { file: MIGRATION, docs: DOC }),
    ).toContain('NEW.fan_id                     := OLD.fan_id;');
  });

  it('the artist library UI offers no edit control', () => {
    const src = readStripped(LIBRARY);
    for (const forbidden of ['<textarea', 'contentEditable', "action: 'edit'"]) {
      expect(
        src.includes(forbidden),
        violation('TESTIMONIAL-001', `the library renders ${forbidden}: the artist must not be able to type over a fan's words.`, { file: LIBRARY, docs: DOC }),
      ).toBe(false);
    }
  });
});

describe('TESTIMONIAL-002 — artist authority comes from the session', () => {
  // MUTATION: read `payload.artistId` and pass it to listArtistTestimonials. This fails.
  it('the artist route resolves the artist from the authenticated user, not the payload', () => {
    const src = readStripped(ARTIST_ROUTE);
    expect(src).toContain("eq('user_id', user.id)");
    for (const forbidden of ['payload?.artistId', 'payload.artistId', 'body.artistId', 'searchParams.get(\'artistId\')']) {
      expect(
        src.includes(forbidden),
        violation('TESTIMONIAL-002', `the artist route trusts ${forbidden}. A caller-supplied target id is never the authenticated actor's identity (SEC-001).`, { file: ARTIST_ROUTE, docs: DOC }),
      ).toBe(false);
    }
  });

  it('every artist-scoped write filters on the resolved artist id', () => {
    const src = readStripped(SERVER);
    // Bounded to THIS function. An unbounded slice reaches suppressPendingRequests, which carries
    // its own artist_id filter and therefore kept a counting assertion green while the update below
    // had lost its tenancy scope. Found by mutation on 2026-08-12; counting was the wrong tool.
    const start = src.indexOf('export async function setTestimonialVisibility');
    const fn = src.slice(start, src.indexOf('\nexport ', start + 10));
    expect(fn.length, 'setTestimonialVisibility not found').toBeGreaterThan(100);

    // The READ is scoped, so a foreign testimonial id resolves to no row.
    expect(
      fn,
      violation('TESTIMONIAL-002', 'the visibility lookup must be scoped by artist_id, or Artist A can read Artist B rows by id.', { file: SERVER, docs: DOC }),
    ).toContain("eq('id', testimonialId)\n      .eq('artist_id', artistId)");

    // The WRITE is scoped too, and as one literal chain: a count would pass while this exact
    // clause was deleted, which is the mutation that got through.
    expect(
      fn,
      violation('TESTIMONIAL-002', 'the visibility UPDATE must chain .eq(artist_id, artistId), or a guessed testimonial id crosses tenancy even though the read was scoped.', { file: SERVER, docs: DOC }),
    ).toContain(".update(patch).eq('id', testimonialId).eq('artist_id', artistId)");
  });
});

describe('TESTIMONIAL-003 — the fan is the session, never a token or a parameter', () => {
  // MUTATION: accept `payload.fanUserId` and pass it as fanId. This fails.
  it('the fan route passes the authenticated user id as the author', () => {
    const src = readStripped(FAN_ROUTE);
    expect(src).toContain('fanId: user.id');
    for (const forbidden of ['payload?.fanId', 'payload.fanId', 'payload?.fanUserId', 'payload.fanUserId', 'respondentId', 'verifySurveyToken']) {
      expect(
        src.includes(forbidden),
        violation('TESTIMONIAL-003', `the fan route reads ${forbidden}. A forwarded link must never let one person publish words as another fan; that is exactly the pattern POST /api/surveys carries.`, { file: FAN_ROUTE, docs: DOC }),
      ).toBe(false);
    }
  });

  it('withdraw and decline are scoped to the caller fan id in the query predicate', () => {
    const src = readStripped(SERVER);
    for (const fnName of ['withdrawTestimonial', 'declineRequest']) {
      const fn = src.slice(src.indexOf(`export async function ${fnName}`));
      const body = fn.slice(0, fn.indexOf('\nexport '));
      expect(
        body.includes("eq('fan_id', fanId)"),
        violation('TESTIMONIAL-003', `${fnName} does not scope by fan_id, so one fan could act on another fan's row.`, { file: SERVER, docs: DOC }),
      ).toBe(true);
    }
  });

  it('submit re-checks that the request belongs to this fan rather than trusting its id', () => {
    const src = readStripped(SERVER);
    const fn = src.slice(src.indexOf('export async function submitTestimonial'));
    expect(fn.slice(0, 2000)).toContain('req.fan_id !== input.fanId');
  });
});

describe('TESTIMONIAL-004 — consent is required for publication, everywhere', () => {
  // MUTATION: drop the consent_scope clause from the view's WHERE. This fails.
  it('the public view requires crwn_only consent AND artist featuring', () => {
    const sql = readRaw(MIGRATION);
    const view = sql.slice(sql.indexOf('CREATE VIEW fan_testimonials_public'));
    expect(view).toContain("t.consent_scope = 'crwn_only'");
    expect(view).toContain('t.featured_at IS NOT NULL');
    expect(view).toContain('t.hidden_at IS NULL');
    expect(view).toContain('t.withdrawn_at IS NULL');
    expect(view).toContain("t.moderation_status = 'auto_ok'");
  });

  it('the artist cannot feature a response the fan kept private', () => {
    const src = readStripped(SERVER);
    const fn = src.slice(src.indexOf('export async function setTestimonialVisibility'));
    expect(
      fn.slice(0, 2000),
      violation('TESTIMONIAL-004', 'featuring must refuse a private_to_artist row explicitly, not silently no-op.', { file: SERVER, docs: DOC }),
    ).toContain("row.consent_scope !== 'crwn_only'");
  });

  it('the fan card presents consent as an unchecked opt-in, never a pre-ticked default', () => {
    const src = readStripped(FAN_CARD);
    expect(
      src,
      violation('TESTIMONIAL-004', 'the consent checkbox must default to OFF: a pre-ticked permission is not a permission.', { file: FAN_CARD, docs: DOC }),
    ).toContain('useState(false)');
    expect(src).toContain('allowPublicDisplay: allowPublic');
  });
});

describe('TESTIMONIAL-005 — verification is derived, never asserted', () => {
  // MUTATION: accept `payload.verified` in the fan route, or store a verification_label column.
  it('no route accepts a verification claim from the client', () => {
    for (const f of [FAN_ROUTE, ARTIST_ROUTE]) {
      const src = readStripped(f);
      for (const forbidden of ['verified', 'verificationLabel', 'badge']) {
        expect(
          src.includes(`payload?.${forbidden}`) || src.includes(`payload.${forbidden}`),
          violation('TESTIMONIAL-005', `${f} reads a client ${forbidden}. The badge derives from canonical relationship evidence on the server.`, { file: f, docs: DOC }),
        ).toBe(false);
      }
    }
  });

  it('no verification LABEL is stored on the row; only an evidence pointer is', () => {
    const sql = readRaw(MIGRATION);
    const table = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS fan_testimonials '), sql.indexOf('CREATE INDEX IF NOT EXISTS idx_testimonials_artist'));
    expect(table).toContain('verification_evidence_kind');
    expect(
      table.includes('verification_label') || table.includes('verification_kind'),
      violation('TESTIMONIAL-005', 'a stored verification label goes stale after a refund. Store the evidence pointer and re-derive.', { file: MIGRATION, docs: DOC }),
    ).toBe(false);
  });

  it('the view derives the badge from live subscription state', () => {
    const sql = readRaw(MIGRATION);
    const view = sql.slice(sql.indexOf('CREATE VIEW fan_testimonials_public'));
    expect(view).toContain("s.status <> 'active'");
    expect(view).toContain('s.is_founder');
  });
});

describe('TESTIMONIAL-006 — no invertible spend in the public payload', () => {
  // MUTATION: add tier.name to the view's SELECT list, or add tierName to PublicTestimonial.
  // The first test fails on the view; core.test.ts fails on the type.
  it('the public view selects no tier name, price or amount', () => {
    const sql = readRaw(MIGRATION);
    const view = sql.slice(
      sql.indexOf('CREATE VIEW fan_testimonials_public'),
      sql.indexOf('GRANT SELECT ON public.fan_testimonials_public'),
    );
    const selectList = view.slice(0, view.indexOf('FROM fan_testimonials t'));
    for (const forbidden of ['tier.name', 'tier.price', 'AS tier', 'tier_name', 'price', 'amount', 't.fan_id']) {
      expect(
        selectList.includes(forbidden),
        violation('TESTIMONIAL-006', `the public testimonial view emits "${forbidden}". Tier plus tenure beside a public price list is lifetime spend to the dollar: the exact defect leaderboardPrivacy.ts exists to prevent.`, { file: MIGRATION, docs: DOC }),
      ).toBe(false);
    }
  });

  it('the migration asserts the forbidden columns are absent at apply time, not just at review time', () => {
    const sql = readRaw(MIGRATION);
    expect(sql).toContain('SECURITY: public testimonial view exposes a forbidden column');
  });

  it('the public read names its columns explicitly instead of select(*)', () => {
    const src = readStripped(PUBLIC_READ);
    expect(
      src.includes(".select('*')"),
      violation('TESTIMONIAL-006', 'select(*) on the public view means a column added later starts shipping on its own.', { file: PUBLIC_READ, docs: DOC }),
    ).toBe(false);
    expect(src).toContain('verification_label, tenure_label');
  });

  it('the public section component renders no tier and no money', () => {
    const src = readStripped(PUBLIC_SECTION);
    for (const forbidden of ['tier', 'price', '$', 'spent', 'amount']) {
      expect(
        src.toLowerCase().includes(forbidden),
        violation('TESTIMONIAL-006', `the public testimonial card mentions "${forbidden}".`, { file: PUBLIC_SECTION, docs: DOC }),
      ).toBe(false);
    }
  });
});

describe('TESTIMONIAL-007 — one delivery path, at the bottom of the priority order', () => {
  // MUTATION: raise fan_share_experience above fan_first_support, or add a Resend call.
  it('the testimonial pop-up is the lowest priority in the catalog', () => {
    const src = readStripped(POPUPS);
    const block = src.slice(src.indexOf("key: 'fan_share_experience'"));
    const mine = Number(/priority:\s*(\d+)/.exec(block)?.[1]);
    expect(Number.isFinite(mine)).toBe(true);

    const all = [...src.matchAll(/priority:\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(
      Math.min(...all),
      violation('TESTIMONIAL-007', `fan_share_experience is priority ${mine} but the catalog minimum is ${Math.min(...all)}. Asking a fan for a favour must never outrank their money, their access or an obligation.`, { file: POPUPS, docs: DOC }),
    ).toBe(mine);
  });

  it('nothing in the feature sends an email or writes a notification', () => {
    for (const f of [SERVER, FAN_ROUTE, ARTIST_ROUTE, CRON]) {
      const src = readStripped(f);
      for (const forbidden of ['resend', 'FROM_EMAIL', 'createNotification', 'notifySubscribers', 'campaignSender']) {
        expect(
          src.includes(forbidden),
          violation('TESTIMONIAL-007', `${f} references ${forbidden}. V1 delivers through the Pop-up Engine and the fan hub card only; email needs the governor gap closed and a shared HTML escaper first.`, { file: f, docs: DOC }),
        ).toBe(false);
      }
    }
  });

  it('the ask reaches the fan hub as well, so a dismissed pop-up does not destroy the request', () => {
    const command = readStripped('src/app/(main)/command/page.tsx');
    expect(command).toContain('<TestimonialRequestCard />');
  });

  it('the cron requires the canonical secret and fails closed', () => {
    const src = readStripped(CRON);
    expect(src).toContain('process.env.CRON_SECRET');
    expect(src).toContain('status: 401');
  });
});

describe('TESTIMONIAL-008 — private survey research is not testimonial content', () => {
  // MUTATION: read survey_responses inside the testimonial modules. This fails.
  it('no testimonial module reads the loyalty survey', () => {
    for (const f of [CORE, SERVER, PUBLIC_READ, FAN_ROUTE, ARTIST_ROUTE, CRON]) {
      const src = readStripped(f);
      for (const forbidden of ['survey_responses', 'loyalty_fan', 'surveyTokens', 'verifySurveyToken']) {
        expect(
          src.includes(forbidden),
          violation('TESTIMONIAL-008', `${f} touches ${forbidden}. Answering a private research survey is not permission to publish; the two domains stay separate.`, { file: f, docs: DOC }),
        ).toBe(false);
      }
    }
  });

  it('the migration creates its own tables rather than extending survey_responses', () => {
    const sql = readRaw(MIGRATION);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS fan_testimonials');
    expect(
      sql.includes('ALTER TABLE survey_responses'),
      violation('TESTIMONIAL-008', 'testimonials must not be bolted onto the private research table.', { file: MIGRATION, docs: DOC }),
    ).toBe(false);
  });
});

describe('TESTIMONIAL-009 — triggers read canonical state', () => {
  // MUTATION: swap the subscriptions read for a fan_events read. This fails.
  it('the generator reads subscriptions and fulfillment_events, never fan_events', () => {
    const src = readStripped(SERVER);
    expect(src).toContain("from('subscriptions')");
    expect(src).toContain("from('fulfillment_events')");
    expect(
      src.includes('fan_events'),
      violation('TESTIMONIAL-009', 'fan_events declares subscribe/purchase/live_join in its CHECK but no writer emits them, so a trigger built on it silently produces nothing.', { file: SERVER, docs: DOC }),
    ).toBe(false);
  });

  it('every fulfillment read passes the fan-promise filter', () => {
    const src = readStripped(SERVER);
    expect(
      src,
      violation('TESTIMONIAL-009', 'a fulfillment_events row carrying metadata.ramp_step_key is a Revenue Ramp step, not a fan promise. Asking a fan about it violates the ratified boundary.', { file: SERVER, docs: DOC }),
    ).toContain('isFanPromiseEvent');
  });

  it('promise eligibility reuses the calendar own audience rule instead of copying it', () => {
    const src = readStripped(SERVER);
    expect(
      src,
      violation('TESTIMONIAL-009', 'a second copy of the audience rule lets the calendar and the ask disagree about who was owed something.', { file: SERVER, docs: DOC }),
    ).toContain('fanEligibleForObligation');
  });

  it('dedupe is enforced by database indexes, not only by the generator', () => {
    const sql = readRaw(MIGRATION);
    expect(sql).toContain('idx_testimonial_req_one_pending');
    expect(sql).toContain('idx_testimonial_req_once_per_trigger');
    expect(sql).toContain("WHERE status = 'pending'");
  });
});

describe('the base tables are closed to every client role', () => {
  it('the migration revokes client access and enables RLS on both tables', () => {
    const sql = readRaw(MIGRATION);
    expect(sql).toContain('ALTER TABLE fan_testimonial_requests ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE fan_testimonials         ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('REVOKE ALL ON public.fan_testimonial_requests FROM anon, authenticated');
    expect(sql).toContain('REVOKE ALL ON public.fan_testimonials         FROM anon, authenticated');
  });

  it('the self-verify asserts the closure as a PROPERTY, not by object existence', () => {
    const sql = readRaw(MIGRATION);
    expect(sql).toContain('SECURITY: % client grant(s) remain on the testimonial base tables');
    expect(sql).toContain('relrowsecurity');
  });

  it('only the public view is granted to client roles', () => {
    const sql = readRaw(MIGRATION);
    const grants = [...sql.matchAll(/GRANT SELECT[^;]*TO anon, authenticated/g)].map((m) => m[0]);
    expect(grants.length).toBe(1);
    expect(grants[0]).toContain('fan_testimonials_public');
  });
});

describe('no AI touches a testimonial', () => {
  it('no testimonial module calls a model provider', () => {
    for (const f of [CORE, SERVER, PUBLIC_READ, FAN_ROUTE, ARTIST_ROUTE, CRON, LIBRARY, FAN_CARD, PUBLIC_SECTION]) {
      const src = readStripped(f).toLowerCase();
      for (const forbidden of ['deepseek', 'openai', 'anthropic', 'callmodel', 'completion(']) {
        expect(
          src.includes(forbidden),
          violation('TESTIMONIAL-005', `${f} references ${forbidden}. A model may never write, reword, rate or classify a fan's statement: deterministic templates are the whole of V1.`, { file: f, docs: DOC }),
        ).toBe(false);
      }
    }
  });
});
