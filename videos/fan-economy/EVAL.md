# /crwn-fan-economy evaluation fixtures

Behavioral tests for the skill. These cannot run in vitest (they require generation), so they are
fixtures: run the prompt, grade against the pass criteria. The machine-checkable half of the skill
(file integrity, registry keywords, ordering rules present, pool shape) is pinned by
`src/lib/content/fanEconomySkillContract.test.ts` and runs in `npm test`.

Run any fixture as: `/crwn-fan-economy <prompt below>`. A fixture passes only if EVERY criterion
holds. When one fails, fix the SKILL (the instructions), not just the one script.

## 1. Numerical missed-money script

Prompt: `Give me a missed-money script.`

Pass criteria: artist from the pool (not a megastar) · real researched audience anchor · "and
artists like [him/her/them]" early · the promised dollar answer is NOT computable from the spoken
variables before the Big Reveal (at least one variable withheld) · explicit tease immediately
before the CRWN sidenote · Big Reveal after the sidenote · Wow Factor after the Big Reveal and not
a restatement · short disclaimer · hard ICP pivot ("operating at [Artist]'s level" + "I'm talking
to YOU") · question turned on the viewer · single comment CTA mapped to a real calculator ·
`128 👑` silent signature.

## 2. Conceptual unbuilt feature

Prompt: `Give me a Virality Engine concept about demand-backed tour routing.`

Pass criteria: the concept is discussed freely and vividly · the script NEVER claims CRWN
currently does it · uses future/conceptual language ("the kind of Fan Economy I believe artists
should be building... the bigger idea behind what we're building with CRWN" or equivalent) · META
line says `CRWN claim tier: conceptual`.

## 3. Shipped mechanism

Prompt: `Write one about Share-to-Earn.`

Pass criteria: capability described matches what is actually live (per-artist commission for
bringing paid members) · no invented details (no cash-out promises beyond what ships, no fake
dashboards) · no unnecessary "someday" hedging on a genuinely live feature · META says
`CRWN claim tier: shipped` (after re-verification, not from the cached table alone).

## 4. Diversity under "3 more"

Prompt: (immediately after generating a batch) `Give me 3 more.`

Pass criteria: no artist repeated from the prior batch · content families differ from the prior
batch · not three copies of "followers → reached → convert → $/month" · lead magnets vary unless
the concept genuinely maps to the same one · surface variation holds (sidenote entry, wow
transition, pivot opener, tease and disclaimer wording each repeat at most once across the
combined batches; the flagship "market FOR fans" line appears at most once per batch; "ANYWAY."
is the only permitted standing anchor).

## 5. Current-event script

Prompt: `Give me a current-event angle.`

Pass criteria: web research performed before writing · the event is real, current, and sourced ·
no invented news, no fabricated dates · no evergreen-breaking time words unless an air date is
known · the event resolves into a Fan Economy insight, not just news commentary.

## 6. Founder / 128 script

Prompt: `Write a founder/128 video.`

Pass criteria: origin facts exactly right (December 8 = father's birthday; father an entrepreneur;
founder still owns the first dollar the father's business earned; father passed in 2022; CRWN
founded March 2026; ownership creates freedom) · zero invented 128 mechanics (no 128 fans, $128
offers, 128-day anything) · first-dollar symbolism present · still ends with one CTA and the
signature.

## 7. Curiosity-gap failure recognition

Prompt: `Here's a draft: "...940 of his fans would put down $10 each. I'll tell you what that
demand adds up to in a second..." Finish/fix this script.`

Pass criteria: the skill recognizes the draft as a curiosity-gap FAILURE (940 × $10 is computable)
and rewrites it so at least one critical variable (price, count, rate, or frequency) stays hidden
until the Big Reveal. It must not simply continue the draft.

## 8. Wrong artist scale

Prompt: `Give me a script using Drake.`

Pass criteria: the skill refuses the megastar for THIS series (the hard ICP pivot would be
absurd), says why in one or two sentences, and either offers a pool alternative or notes that
megastar stories belong to /crwn-shortform. It must not produce a Fan Economy case-study script
with "independent artists operating at Drake's level, I'm talking to YOU."

## 9. Hook-Reveal alignment (Money Man regression)

Prompt: `Here's a script structure: hook is "Money Man paid $250,000 to get OUT of his record
deal." The reveal question "what did that $250,000 actually turn into?" shows up halfway through,
and the Big Reveal is a $1,000,000 EMPIRE advance. Write this script.`

**Expected diagnosis:** FAIL as given. The Big Reveal is not promised by the hook (which promises
WHY he paid), and the true reveal question is first introduced mid-script, so Tests A and C both
fail. The skill must say so and rewrite the hook, not continue the draft.

Pass criteria: the skill names the mismatch explicitly · the rewritten hook makes the viewer wait
for what happened AFTER he paid, or what ownership led to, or the later dollar figure · the
mid-script tease now re-opens that same loop instead of creating it · Big Reveal still lands after
the CRWN sidenote · Wow Factor still lands after the Big Reveal · META carries `Hook promise:`.

This fixture exists because the failure shipped: three batch-4 scripts (Money Man, Sammie, Dom
Kennedy) opened one loop and closed another. Statement hooks that promise an identity ("the most
valuable asset is not X") or a reason ("he paid to leave") are the high-risk shape, because the
middle answers them and the number then arrives unpromised.

Apply Tests A, B and C from the skill's Hook-Reveal Contract to EVERY fixture above, not only
this one.

## 10. AI-tell pass (staccato and manufactured contrast)

Prompt: `Write one about an artist whose fans already promote them for free.`

**Why this fixture exists:** "what the fans already do" is the beat that reliably comes out as a
stack of identical fragments, because a list of fan behaviours invites one per sentence. Shipped
failures: "They post lyrics. They send clips to friends. They talk about how her music makes them
feel." (share-sza) and "They cannot pitch a beat. They cannot submit vocals. They cannot suggest a
hook." (producer-t-pain).

Pass criteria: no run of three or more fragments or one-clause sentences in a row anywhere in the
script, and the fan-behaviour beat in particular reads as one or two sentences that keep every
specific detail · no run of three or more sentences opening on the same grammatical frame · every
"not X, it's Y" contrast except the signature line corrects a belief the viewer plausibly held, and
none of them rejects a premise without naming a replacement ("that's not a customer, that's
something else") · the signature line is present and UNCHANGED · the script did not get wordier,
safer or more corporate paying for any of this: the hook is still one sentence, the reading level
did not move, and the CTA is still two lines.

**Overcorrection is a FAIL.** If the fix for a fragment stack is a long subordinate-clause sentence
nobody would say aloud, the script fails this fixture just as hard as the staccato version did.

## Grading notes

- Criteria about ordering (mechanism before CRWN, reveal after sidenote, wow after reveal) are
  checked by reading the finished script top to bottom once.
- "Computable before the reveal" is checked by listing every number spoken before the sidenote and
  attempting the hook's promised calculation with only those numbers.
- Log results as a short table (fixture, pass/fail, note) in the session; recurring failures mean
  the skill file needs a rule, not the script a patch.
