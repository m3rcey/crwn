# CRWN Automation Audit: Reducing Artist Manual Work

*Prepared 2026-07-27. Audit of CRWN's artist-facing manual work against the current AI capability frontier (Opus 5, Gemini 3.x, Nano Banana Pro, MCP social posting).*

---

## The 2026 capability frontier (what we can build on today)

**Reasoning / agent brains**
- **Claude Opus 5** (Jul 24, 2026): 1M context, 128K output, Adaptive Thinking (auto-scales reasoning to task difficulty), $5/$25 per M tokens. Workhorse for drafting copy, interpreting analytics, and multi-step agent flows.
- **Gemini 3.1 Pro** (Feb 2026) and **Gemini 3.5 Flash** (May 2026): 1M context, `thinking_level` control, strong agentic + spreadsheet/finance behavior. 3.5 Pro (rumored 2M context + Deep Think) is the cheap-fast tier for high-volume drafting.

**Generative media (the artist's biggest hidden labor)**
- **Nano Banana Pro** (Gemini 3 Pro Image): CRWN's image pipeline already rides this. New: legible text baked into images (posters, cover art, IG carousels, product mockups), multi-turn conditional edits, reference-blending, 4K.
- **Video**: Seedance 2.0 (best price/quality), Veo 3.1 (4K, $0.15/s, API), Sora 2, Kling 3.0 (15s 4K/60fps single pass). Short-form promo clips are now API-generatable.

**Agentic action / connectors (MCP)**
- Official **Stripe** and **Supabase** MCP servers exist; CRWN's own stack is MCP-addressable.
- **Playwright MCP** for browser automation.
- **Social posting is the newly-solved piece**: **Socialync** posts natively to all 8 platforms (TikTok/IG/YT/X/LinkedIn/FB/Threads/Bluesky) from any MCP client; **Postiz** covers 30+ and self-hosts.
- **Claude Agent SDK**: subagents (isolated context per specialist), lifecycle hooks, Skills, in-process MCP.

**The honest limit**: autonomous chains past ~15-20 steps still fail at a meaningful rate; high-stakes actions (money, publishing) need a human confirm-tap. That shapes the recommendation: **AI drafts + one-tap artist approval**, not silent full autonomy, wherever money or the artist's public voice is involved.

---

## The one-sentence thesis

CRWN built an AI back office and pointed it at the founder. The biggest, fastest wins come from turning that same machinery toward the artist's blank fields and empty image slots.

## First principles (what the audit established as true)

- **No LLM text generation exists in any artist creation flow.** Bio, tagline, the *required* tier description, product/album descriptions, every campaign/mission/offer title+body, email subjects/bodies, broadcasts: all raw free-text with placeholders only.
- **Every image is a manual upload.** No generated default cover art, avatar, banner, or product image, despite Nano Banana scripts sitting in the repo (founder-only).
- **The "smart" layers are mostly rules, not AI.** "AI Recommended Quest" ([recommend.ts](src/lib/quests/recommend.ts)) is rule-based by its own comment; lead magnets are deterministic math; playbook drafts are static templates the artist must copy-paste and post themselves.
- **Real AI already ships, but is siloed:** DeepSeek AI Manager ([generateInsights.ts](src/lib/ai/generateInsights.ts)) is Pro-gated and on a separate `/studio/manager` surface; Claude drives founder acquisition, not the artist.
- **Frontier tools available today:** Opus 5, Gemini 3.1/3.5, Nano Banana Pro (text-in-image), Veo 3.1/Seedance 2 video, and MCP social-posting (Socialync/Postiz) that can actually publish.
- **Hard limit:** agent chains past ~15-20 steps still fail meaningfully, so anything touching money or the artist's public voice needs a human confirm-tap.

---

## Where the artist's manual work actually is (ranked by burden)

| Rank | Surface | What's manual today | AI assist today |
|---|---|---|---|
| 1 | **Fan CRM email / broadcasts / sequences** ([CampaignComposer.tsx](src/components/artist/CampaignComposer.tsx)) | Subject + long body, cold-start, per send | None (merge tokens only) |
| 2 | **Every builder's Title + Description** (campaigns, missions, offers, products, albums, tiers) | Free-text, placeholder only; tier description is *required* | Static per-type templates at best |
| 3 | **All images** (avatar, banner, cover art, product, promo) | Manual upload, blur-gated | None; Nano Banana exists but founder-only |
| 4 | **Executive Producer submission review** ([SubmissionReviewPanel.tsx](src/components/producer/SubmissionReviewPanel.tsx)) | Play/read/triage every fan submission by hand | None |
| 5 | **Promise Calendar fulfillment** ([PromiseCalendar.tsx](src/components/artist/PromiseCalendar.tsx)) | Deliver + mark complete each cycle | Tracking auto; doing is manual |
| 6 | **Profile setup** ([ArtistProfileForm.tsx](src/components/artist/ArtistProfileForm.tsx)) | Bio, tagline, socials, genres, cal.com | Slug derivation + fixed defaults only |
| 7 | **Analytics interpretation** ([AnalyticsDashboard.tsx](src/components/artist/AnalyticsDashboard.tsx)) | Read raw charts (Starter tier) | AI Manager exists but Pro-gated, separate page |
| 8 | **Social posting** (playbook drafts) | Copy the draft, post it yourself off-platform | Static drafts, un-editable in UI |

---

## Recommendations, tiered by (impact / effort)

### Tier 1 — Ship in days. Reuses infra already wired.

**1.1 "Draft with AI" on every blank field.**
Add a generate button beside every Title/Description/bio/tagline/tier-description/perk field. Feed the model the artist's existing context (name, genre, recent drops, tier, price) which CRWN already has in the DB. Draft appears in the field, editable, one tap to accept.
- *Why first:* removes the #1 and #2 burdens; the required tier description alone is a known drop-off. Loss-framed default copy comes free (matches the copy rule).
- *Build:* you already call an OpenAI-compatible model in [generateActions.ts](src/lib/ai/generateActions.ts). Add one `draftCopy(fieldType, artistContext)` helper and a shared `<AiDraftButton>`. Model: DeepSeek (already keyed) or Opus 5 for the hero fields.
- *Effort:* small. *Impact:* very high, every artist, every session.

**1.2 Inline analytics summary for all tiers.**
The AI Manager already generates plain-English "what it means + what to do." Surface a single line of it at the top of the raw dashboard for Starter too, instead of only a teaser banner. Interpretation is exactly the work Starter artists do by hand today.
- *Build:* reuse [generateInsights.ts](src/lib/ai/generateInsights.ts); render top insight inline.
- *Effort:* small. *Impact:* high (removes "what do these numbers mean").

**1.3 Upgrade "AI Recommended Quest" to actually use AI.**
[recommend.ts](src/lib/quests/recommend.ts) says in its own comment it's rule-based and "upgradeable to a DeepSeek ranking later." Later is now. Rank the next best move against the artist's real state.
- *Effort:* small. *Impact:* medium (it's labeled "AI" but isn't; also fixes a truth-in-labeling gap).

### Tier 2 — Weeks. New surface, but the assets already exist in the repo.

**2.1 Artist-facing generative art (the sleeping giant).**
Ship the ~20 Nano Banana scripts as an in-product generator: cover art, avatar, banner, product images, and IG carousel promo, on-brand (dark + gold, brand rules baked into the prompt) with the artist's name rendered *in* the image (Nano Banana Pro's new text-in-image). Replace "upload or leave blank" with "generate, then keep or replace."
- *Why big:* every image is manual today and most stay empty. This is the largest single removal of manual work after copy.
- *Build:* promote `generate-*.mjs` logic into an API route behind `GEMINI_API_KEY` (already used founder-side). Guardrail: the brand-photo rule (Black hip hop/R&B artist, 18-32, stated age) goes in the prompt template.
- *Effort:* medium. *Impact:* very high.

**2.2 AI email/broadcast/sequence drafting.**
The heaviest sustained writing load. Artist types one line of intent ("announce Friday's drop to Inner Circle"); model drafts subject + body using real context (drop name, tier, recent activity) and auto-inserts the right merge tokens. Personalize the existing 9 sequence templates to the artist instead of generic canned copy.
- *Build:* same `draftCopy` helper, richer context; wire into [SequenceBuilder.tsx](src/components/artist/SequenceBuilder.tsx).
- *Effort:* medium. *Impact:* very high (burden #1).

**2.3 Submission triage for Producer Sessions.**
AI summarizes each fan submission's pitch, scores fit, and proposes a shortlist so the artist reviews a ranked list instead of raw queue. (Text pitch + metadata now; add an audio model later for the track itself.)
- *Effort:* medium. *Impact:* high for artists who run these; scales with fan count.

### Tier 3 — Bigger builds. New integrations, real "do it for me."

**3.1 Close the social loop: draft + generate + post.**
Today playbooks hand the artist a draft to copy-paste elsewhere. Wire an MCP social poster (Socialync posts to all 8 platforms; Postiz self-hosts 30+) so CRWN drafts the caption, generates the image/short-form clip (Veo 3.1 / Seedance 2), and schedules the post, with a confirm-tap. This is where CRWN stops being a place you *plan* promo and becomes where it *happens*.
- *Effort:* large (new integration, scheduling, media gen cost). *Impact:* very high, and a genuine differentiator.

**3.2 Agentic "goal to full campaign" mode (the endgame).**
Built on the Agent SDK: artist states a goal ("sell 50 Vault memberships before the album"), and a CRWN agent drafts the campaign + the promo images + the email + the fan posts + a suggested schedule and target segment, then presents *one* approval screen. This is the maximal reduction of manual work.
- *Guardrail (non-negotiable):* human confirm before anything charges money or publishes publicly. Matches the 2026 reliability reality.
- *Effort:* large. *Impact:* transformational. Build it *after* Tier 1-2 exist, because it orchestrates those same primitives.

**3.3 Auto-suggest send-time and target segment.**
Broadcasts/campaigns send immediately with manual targeting. Have the model propose the best saved segment and send window from engagement data, one tap to accept.
- *Effort:* medium. *Impact:* medium.

---

## Question the requirement: things to fix or delete, not automate

- **The GPT-fabricated sync opportunities are a liability.** [sync-opportunities/route.ts](src/app/api/cron/sync-opportunities/route.ts) generates *fake* briefs attributed to *real* companies (Musicbed, Songtradr). That's not a manual-work win to expand; it risks artists pitching phantom deals and CRWN's credibility. Recommend: replace with real sourced listings, or clearly label as illustrative.
- **ManyChat/acquisition is founder work, not artist work.** Don't fold it into artist automation; it's the founder's funnel.
- **Don't auto-*send* anything money- or voice-related.** Keep the confirm-tap. Draft, don't dispatch.

---

## What Josh would need to unblock the Tier-1/2 work

- Decide the model split: DeepSeek (already keyed, cheap, good enough for drafts) vs Opus 5 (hero copy). Default DeepSeek for volume, Opus 5 for tier descriptions and hero bios.
- `GEMINI_API_KEY` is already set founder-side; artist-facing image gen needs a rate/cost cap decision and a Vercel env promotion.
- A dark-launch flag per feature (same `admin_settings` pattern as `quest_engine`).

---

## Recommended sequencing

Ship **1.1 (AI draft on blank fields)** and **2.1 (generative art)** first. Together they hit the four heaviest burdens (copy + images) and lean almost entirely on infrastructure already built and paid for. Everything else compounds on top.

---

## Existing AI inventory (for reference)

**Shipped / runtime AI (reaches artists or leads)**
- Acquisition decision service — Anthropic Claude (`claude-opus-4-8`), founder funnel, optional/gated ([anthropicClient.ts](src/lib/ai/anthropicClient.ts), [claudeDecisionService.ts](src/lib/acquisition/claudeDecisionService.ts)).
- "AI Manager" for artists — DeepSeek ([generateInsights.ts](src/lib/ai/generateInsights.ts), [generateActions.ts](src/lib/ai/generateActions.ts)), daily cron, Pro-gated.
- Sync opportunities cron — OpenAI GPT-4o-mini, fabricates briefs (flagged above as a liability).

**Founder / admin tooling only (not shipped to artists)**
- Admin business-intelligence agents — DeepSeek.
- Gemini image generation (Nano Banana) — ~20 root `.mjs` scripts run manually, `GEMINI_API_KEY` + `BRAVE_API_KEY`, never referenced in `src/`.
- `.claude/commands/*.md` content skills — carousel, image-gen, shortform, thumbnail, YouTube SEO, etc. Founder marketing production, no artist touches them.

**Pure templating masquerading as "smart"**
- Lead-magnet engine — 100% deterministic math ([resultGenerators.ts](src/lib/leadMagnets/resultGenerators.ts)).
- "AI Recommended Quest" — rule-based ([recommend.ts](src/lib/quests/recommend.ts)).
- Acquisition fallback path — deterministic scoring.

**Env-var signals:** `ANTHROPIC_API_KEY` (optional, acquisition), `DEEPSEEK_API_KEY` (artist AI Manager + admin agents), `OPENAI_API_KEY` (sync cron only), `GEMINI_API_KEY` + `BRAVE_API_KEY` (founder image tooling, not in app).
