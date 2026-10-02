# Idea Scorecard

Grade every short-form TOPIC on this **before it goes to scripting**. The cheapest place to kill a weak video is at idea selection — a stale or unanchored topic cannot be saved by a great script (`feedback_freshness_over_rescue`). Calibrated from the 15-video set in `reference_shortform_metrics_dataset`; full model in `feedback_shortform_performance_model`.

The idea scorecard scores **topic-level fuel**: does this story/breakdown have a surprise, is it anchored, will it earn saves. It does NOT score craft (that's the script + image scorecards).

---

## Why this gate exists

Surprise is a property of the **material, not the construction.** Craft fixes skip (the gate); only the topic provides share+save (the fuel). A topic whose payoff is already in the audience's head (#4 Kendrick Grammys, #50 50 Cent Vitamin Water, #8 Drake ice) died or capped at ~4k no matter how it was built. A topic with no named person and no concrete number (#55, #57) is the floor. Pick fresh + anchored, or don't write it.

---

## Hard gates (any fail = reject the idea, swap it out)

1. **FRESHNESS.** State the payoff in one sentence. If the target avatar already knows or believes it, REJECT. ("Own your masters," "streaming pays pennies," "Kendrick won Grammys" — all stale.) A known FACT with a hidden surprising mechanism is fine ("Drake's $2M deal was actually an $11M debt"); a known OUTCOME is not.
2. **ANCHOR.** The topic ties to a **named person** (household-recognizable preferred) **or a concrete shocking number.** No person + no number = reject (that's the death quadrant).
3. **SURPRISE AVAILABLE.** There is a real "wait, what?" in the material — a belief it reverses or a number nobody expects. If the only payoff is a belief the audience already holds, reject.
4. **NOT A DUPLICATE.** Passes the concept/beat dedup (artist+story, explainer, and primitive-overload checks) already in `crwn-content-ideas`. **And not a fast repeat of a hit:** if the same artist had a hit (10k+ reach) in the last 14 days, reject the idea or move it out. Every repeat in the ledger dropped 6 to 30x: Drake 132.6k then five reels at 2.2k to 4.7k, DMX 54k then 4.3k two days later, Lauryn Hill 25.6k then 4.1k three days later. Each repeat also retold much the same story, so the audience may have been tired of the story rather than the artist. Treat both as the same rule until the ledger can split them.
5. **IN GENRE.** Anchor is hip-hop, R&B, or directly adjacent.
6. **LOSS-FRAMED, NOT GAIN-FRAMED.** State what the topic makes the viewer FEEL. If it's "someone won something" (hope of gain), REJECT — pure-gain stories are the dead pile (#4 Kendrick Grammys, #50 50 Cent Vitamin Water, capped ~4k). It must open on a LOSS being taken (masters, fans, money) and, if it resolves to a positive, that positive is the escape from the loss, never the lead. The payoff/CTA is loss-framed too ("stop handing your fans away," not "start owning your fans"). Fear of loss moves ~2x hope of gain (`feedback_loss_aversion_over_gain`). Loss must be TRUE (`feedback_factcheck_before_and_after`).

---

## Score it: 100 points (must clear 75 AND all hard gates)

### FUEL POTENTIAL (40) — does the topic carry share + save
- [ ] **A specific surprise/reversal exists** in the material (15) — reverses a belief or drops an unseen number, not a restate of a known truth.
- [ ] **Save-worthy substance** — a concrete number or mechanism a breakdown can teach (the thing fans keep/forward) (15). Explainers/breakdowns score high here (highest save rates: #9, #21, #6); abstract truisms score zero (#55).
- [ ] **The surprise implicitly demos a real CRWN capability** (no naming) (10) — own the line, sell direct, premium access, fans-refer-fans, go live, see the money.

### REACH POTENTIAL (30) — does the topic clear the gate
- [ ] **Household-recognizable anchor** the avatar follows (Drake/Kendrick/Jay/Wayne tier) (10). Star power lowers skip, but it raises the floor, not the ceiling: household-name reels had a median reach of 4.5k against 2.6k with no name, while the same name ranged from 2.2k to 132.6k (Drake). The angle decides the outcome, so this line can never outweigh the surprise line above.
- [ ] **Indie hero beats a household-name foil** (5). The star brings the crowd and the indie artist winning gives the ICP someone to see themselves in. Tech N9ne over 50 Cent produced 13 of the first 14 T1/T2 leads; two indie artists with no star (Curren$y vs Westside Gunn) produced 0 from 28 DM starts. One post so far, and the WORTH keyword rode with it: score it, but do not treat it as proven.
- [ ] **A concrete dramatic noun/number** to front (a deal, a lawsuit, a $ figure, "masters") (10).
- [ ] **Fresh tension, not stale news** (5).

### FIT (30)
- [ ] **One clean lesson that points to direct-to-fan** (10).
- [ ] **Format assignment correct** ([S] one insight / [Y] multi-layer journey) (10).
- [ ] **Lesson lands on the ARTIST avatar**, never the producer (10).

---

## Story vs breakdown (both allowed)

- **Stories** drive reach (named artist + injustice = low skip). **Breakdowns/explainers** convert better (highest save rates) but die if abstract — anchor them to a named person or a stark number.
- **Best = hybrid:** a breakdown delivered through a household-name story with a surprise (#2, #21 — top reach AND top follows). Prefer these.

## Grade bands

| Score (gates passed) | Verdict |
|---|---|
| 85–100 | A-tier topic — schedule it, hand to scripting |
| 75–84 | Solid — schedule it |
| 60–74 | Weak fuel — re-angle to a sharper surprise before scripting |
| under 75, or any hard gate failed | Reject — swap for a fresher/anchored topic |

## The one rule

**Pick topics with a live surprise anchored to a real person or number. Never schedule a topic whose payoff the audience already holds — no script can add fuel that the material doesn't have. And lead with the loss, never the win — fear of losing moves people ~2x the hope of gaining (`feedback_loss_aversion_over_gain`).**

## Check the ledger before you score

[CONTENT_LEDGER.csv](CONTENT_LEDGER.csv) is one row per published post: artists, star level, versus or solo, angle, CTA keyword, era, reach, share and save rate, watch time, skip rate, hours from the nearest reel, DM starts, T1/T2 leads, and anything unusual about how it spread. Seeded 2026-10-01 from all 75 posts.

Before scoring a topic, filter the ledger by its artist and its angle:
- **The artist had a hit in the last 14 days:** hard gate 4 rejects it.
- **The artist has flopped twice on different angles:** the name is not doing the work for this audience, so the surprise has to.
- **The angle has never qualified a T1/T2 lead:** say so in the score. Reach is not traction.

Rules for reading it:
- **Carousel reach is mostly spillover from the nearest reel.** Judge a carousel on share rate and leads, never reach. The `hours_from_nearest_reel` column shows how exposed each one was.
- **An artist repost is distribution, not a topic score.** The June 27 Snoop reel reached 114k because Snoop reposted it himself, with a 0.2% share rate. It says nothing about the hook. `distribution_note` flags rows like it.
- **Blank means unknown, never zero.** Skip rate exists only for the four rows you recorded. DM leads are only traceable from September on.

After each audit, add the new rows and fill in skip rate, watch time and leads for the old ones. Once about 60 reels carry a skip rate, the ledger can answer "which artist for this topic, and how will it do" as a lookup. Until then it can only say what has and has not worked.
