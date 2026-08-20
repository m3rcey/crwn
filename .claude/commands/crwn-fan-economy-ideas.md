# CRWN Fan Economy Ideas

Pitch a batch of NEW Fan Economy case-study ideas, numbered, so the founder can cull them down to
the two worth building. This skill produces PITCHES, not scripts and not artwork.

## Invocation

`/crwn-fan-economy-ideas [count] [optional focus]`

- `/crwn-fan-economy-ideas` gives 10, the default batch
- `/crwn-fan-economy-ideas 10 women in R&B` narrows the pool
- `/crwn-fan-economy-ideas 10 live experiences` narrows the mechanism

Produce EXACTLY the count asked for. Then stop and wait. **Never write a script or render an image
in the same turn as the pitch list.** The whole point is that the founder culls first.

## The pipeline this sits at the front of

    /crwn-fan-economy-ideas   ->  10 pitches
    founder picks 2
    /crwn-fan-economy         ->  a researched, fact-checked script per pick
    /crwn-fan-economy-carousel ->  the 4-slide carousel per pick

A carousel cannot be built from a pitch. `/crwn-fan-economy-carousel` refuses to invent a case
study and reads its numbers off a script's `META:` line, so **every accepted pitch becomes a script
first**. Say that plainly when the founder picks, and never shortcut it: a carousel built from an
unverified pitch is a fact-checkable claim published with no fact check behind it.

## Every pitch is NEW

**Never pitch an artist already used.** Scan `videos/scripts/fan-economy/` before writing and
exclude every artist appearing in a filename or a `META:` line, as SUBJECT or as FOIL. The founder
has explicitly said not to recycle the existing backlog: these are new posts, not a to-do list of
scripts already written.

Also vary the MECHANISM, not just the name. Ten pitches about limited vinyl is one idea with ten
faces. Spread them across the mechanism library in `/crwn-fan-economy`: memberships and tiers,
vault and catalog access, live experiences and ticketing, Executive Producer Sessions, direct
product sales, demand discovery (cities, songs, merch), fan identification, retention and LTV, fan
A&R, preorders and reservations, owned relationships. Aim for no more than two pitches per
mechanism in a batch of ten.

## The pitch rules, inherited and binding

- **ICP fit governs the SUBJECT.** Tier 1 per `docs/ICP.md`: roughly 250k to 5M followers, 100k to
  3M monthly listeners, 40+ songs, a PROVEN direct seller with a fragmented stack. The subject is
  never a megastar.
- **Polarity: the ICP artist wins.** In a versus pitch the foil is the BIGGER artist and the ICP
  artist comes out ahead. Never build a pitch that makes a potential CRWN customer look small.
- **The repost test.** Would the subject repost it? If the honest answer is no, the pitch is dead,
  no matter how good the number is.
- **Rotate the foil.** Do not use the same megastar as the foil twice in one batch.
- **Streaming is the discovery job, never the villain**, and no cross-artist benchmarks. See
  POSITIONING sections 23 and 24, which are binding.
- **Gender mix across the batch, not per pitch.** The artist base runs roughly 65/35, so name women
  deliberately or the batch drifts entirely male, the same way the first image set came out 93%
  male because every prompt just said "artist".

## The math gate, and honesty at pitch stage

A Fan Economy post is a withheld number that pays off. So every pitch must name:

- the **hook question**, as facts then question, in the unit the reveal will answer in,
- the **withheld variable**, the one thing held back, and
- the **reveal shape**, what KIND of answer lands.

**Do not state a figure as fact in a pitch.** At this stage no research has been done, and a pitch
that quotes an invented number gets picked because of that number and then dies at script time when
it turns out to be wrong. Give the SHAPE ("the resale price per copy", "the seat count times the
seat price") and mark it. Every pitch carries one of:

- **`NUMBER: LIKELY`** a public, findable figure very probably exists (resale listings, ticket
  prices, published pressing sizes, a stated membership price).
- **`NUMBER: NEEDS RESEARCH`** plausible but unconfirmed, and the script may have to hedge it.
- **`NUMBER: RISKY`** the figure may not be public at all. Pitch it only if the angle survives the
  number being unavailable, and say what the fallback is.

The script, not the pitch, runs the real verification, the product-truth tier and the CTA mapping.

## Output format

One block per pitch, numbered, nothing else between them:

    **N. [Artist] ([vs Foil, if versus]) — [the angle in five words]**
    Hook: [facts, then the question, as it would be spoken]
    Withheld: [the one variable held back]
    Reveal shape: [what kind of answer lands, no invented figure]
    Wow: [the reframe that makes it repostable]
    Mechanism: [from the library] · Family: [A-J] · Magnet: [tool] + [KEYWORD]
    ICP: [one line on why this artist is Tier 1 and would repost it]
    NUMBER: LIKELY | NEEDS RESEARCH | RISKY

Note the em dash in that template header is the ONLY place one is allowed, because a pitch list is
internal working copy and never user-facing. The moment a pitch becomes a script or a caption, the
no-em-dash rule applies absolutely.

Close the list with one line telling the founder to reply with two numbers, and nothing else. Do
not recommend a favourite unless asked: the culling is the founder's job and a recommendation
front-runs it.

## After the founder picks

1. Confirm the two picks by name and restate each hook in one line.
2. Run `/crwn-fan-economy` for each pick. That is where research, the math gate, the product-truth
   tier and the artist rotation check actually happen. A pitch that fails research at this stage is
   REPORTED, not quietly rewritten into something else.
3. Then run `/crwn-fan-economy-carousel` for each resulting script.
4. Report what got written, and any pitch whose number did not survive contact with the research.

$ARGUMENTS
