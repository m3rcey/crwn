# Delete-review prompt

Paste the block below into a fresh conversation with another AI, and attach
`docs/crwn-brain/29-COMPLETE-FEATURE-INVENTORY.md` in the same message.

Fill in the FOUNDER CONTEXT block first. Those four answers change the recommendation more than
anything else in the file, and the inventory cannot supply them.

---

You are reviewing a software product to decide what should be cut.

Play a specific role: an operator who has killed features before and does not enjoy it. You have
launched, run and shut down products. You believe that at pre-product-market-fit, surface area is
the enemy, and that every feature a solo founder keeps is a feature they must maintain, explain,
keep truthful in copy, keep in sync with five other systems, and eventually debug at the worst
possible moment. You are not impressed by how strategic something sounds. You are interested in
what is being used and what it costs to keep.

Do not be diplomatic at the expense of being useful. A review that keeps everything is a failed
review.

## The product

CRWN is a music monetization platform for independent artists. Artists publish a page and sell fan
memberships (recurring), tracks, products, live tickets and sessions. CRWN takes 5 to 12 percent.
One founder writes all the code. It is live in production.

The attached document is a complete inventory of every feature it ships: what each one does, why it
was built, the benefit claimed, how it works, what it couples to, and **live production usage counts
read from the database on 2026-08-13**. Read all of it, including section 0 (the brief), section 12
(already dead code), section 13 (duplication clusters) and section 14 (the do-not-cut list with the
incident behind each entry).

## FOUNDER CONTEXT (fill this in, it changes the answer)

1. **Are the 7 paying fan subscriptions real strangers, or my own test accounts?**
   `<answer: e.g. "mostly my own tests, maybe 2 real">`
2. **What is the single goal for the next 90 days?**
   `<answer: e.g. "get 10 artists to a first real paying fan">`
3. **How many hours a week go into this, and is anyone else building?**
   `<answer: e.g. "solo, ~25 hrs/week">`
4. **Is there anything I have already decided is untouchable for reasons not in the document?**
   `<answer: e.g. "none" or "Team Splits, I promised it to someone">`

## Ask me questions first if you need to

Before you write the report, you may ask me questions. Please do if the answer would change a
recommendation. Rules for asking:

- Ask them all in one batch, up to about 10, then wait.
- Only ask what actually changes a call. Do not ask questions whose answer is already in the
  document, and do not ask me to re-summarize the product back to you.
- Prefer questions about intent, commitments, and things the data cannot show: what I promised
  someone, what I am about to launch, why a feature was built, whether a number is real usage or my
  own testing.
- For anything you could reasonably assume, state the assumption in the report instead of asking.
- If nothing material is missing, say so and go straight to the report.

## The question to actually answer

For every feature in the document, answer: **should this exist at all, right now, at 9 artists and
7 paying fans?**

Not "is it well built" (much of it is). Not "could it matter later" (almost anything could). The
question is whether it earns its place in the product **this quarter**, given who is actually using
it and who has to maintain it.

Three failure modes to avoid, in order of how likely they are:

1. **Keeping something because it is impressive.** Effort already spent is not a reason to keep
   carrying something. Say so when it applies.
2. **Cutting something load-bearing because it looks quiet.** Some features have almost no rows and
   must stay: safety canaries, security controls, and anything on the money path. Section 14 of the
   document lists these with the incident behind each. Respect it, and if you think one of them is
   wrong, argue it explicitly rather than quietly cutting it.
3. **Recommending a rewrite.** Nobody asked for a better architecture. The only moves available are
   the four in section 0.4 of the document: hide the surface, turn the flag off, delete the code and
   keep the data, or delete the code and drop the tables. Every recommendation must name which one.

Two rules about evidence:

- "0 rows" is measured. "unknown" means no telemetry exists, and is **not** the same as zero. Where
  something is unknown and the decision depends on it, say what single measurement would settle it.
- The counts are a snapshot from one day. Treat them as strong evidence about what has never
  happened, and weaker evidence about frequency.

## Forcing function

Do not hand back a balanced list. Give me a specific target and defend it:

**If I had to remove half the product's surface area by the end of next week, what exactly goes,
in what order, and what breaks?**

Then tell me what you would do differently if the target were only 20 percent instead of 50.

## The report I want back

1. **Per-feature verdict table.** Every feature ID from the document, one row:
   `ID | name | KEEP / HIDE / FLAG OFF / DELETE CODE / DELETE ALL | one-sentence reason`.
   No feature may be missing from this table.
2. **The cut list, ordered by founder attention saved**, biggest relief first. For each: what it
   costs me today (maintenance, copy that must stay true, sync with other systems, support surface),
   and how expensive it would be to bring back.
3. **The keep list**, and for each, the specific thing that earns its place *at this scale*. "It is
   core" is not an argument. Name the evidence.
4. **Duplication rulings.** Section 13 lists seven clusters where several features answer the same
   question. For each cluster, pick the ONE survivor and say what happens to the others.
5. **The riskiest cut you are recommending**, and the single piece of evidence that would prove you
   wrong. Be concrete: a number, a user behaviour, a commitment.
6. **What you would NOT cut even though it looks unused**, and why. If this list is empty, you have
   not read section 14 carefully enough.
7. **What the remaining product would be**, in five sentences, if I did everything you said. If that
   description is not sharper and easier to explain than what I have now, your cut list is wrong.

Length: as long as it needs to be, but no summary of the input document. I wrote it, I have read it.
Spend the words on judgment, not on restating features back to me.
