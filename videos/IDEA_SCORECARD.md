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
4. **NOT A DUPLICATE.** Passes the concept/beat dedup (artist+story, explainer, and primitive-overload checks) already in `crwn-content-ideas`.
5. **IN GENRE.** Anchor is hip-hop, R&B, or directly adjacent.
6. **LOSS-FRAMED, NOT GAIN-FRAMED.** State what the topic makes the viewer FEEL. If it's "someone won something" (hope of gain), REJECT — pure-gain stories are the dead pile (#4 Kendrick Grammys, #50 50 Cent Vitamin Water, capped ~4k). It must open on a LOSS being taken (masters, fans, money) and, if it resolves to a positive, that positive is the escape from the loss, never the lead. The payoff/CTA is loss-framed too ("stop handing your fans away," not "start owning your fans"). Fear of loss moves ~2x hope of gain (`feedback_loss_aversion_over_gain`). Loss must be TRUE (`feedback_factcheck_before_and_after`).

---

## Score it: 100 points (must clear 75 AND all hard gates)

### FUEL POTENTIAL (40) — does the topic carry share + save
- [ ] **A specific surprise/reversal exists** in the material (15) — reverses a belief or drops an unseen number, not a restate of a known truth.
- [ ] **Save-worthy substance** — a concrete number or mechanism a breakdown can teach (the thing fans keep/forward) (15). Explainers/breakdowns score high here (highest save rates: #9, #21, #6); abstract truisms score zero (#55).
- [ ] **The surprise implicitly demos a real CRWN capability** (no naming) (10) — own the line, sell direct, premium access, fans-refer-fans, go live, see the money.

### REACH POTENTIAL (30) — does the topic clear the gate
- [ ] **Household-recognizable anchor** the avatar follows (Drake/Kendrick/Jay/Wayne tier) (15) — star power lowers skip.
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
