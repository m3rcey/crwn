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

## Where a batch is STORED

**Write the batch to a file before showing it.** A pitch list that only exists in a chat reply is
unrecoverable the moment the session ends, and the founder is then choosing from a list that does
not exist. This actually happened on batch 01.

    videos/ideas/fan-economy/batch-NN.md

Two zero-padded digits, next number up. Each file opens with the date, a one-line note on the
batch's composition, and a status block:

    - **PICKED:** (none yet)
    - **PASSED:** (none yet)

When the founder picks, edit those two lines in the SAME turn. That file is the only record of what
was pitched, what got built and what was rejected.

## Every pitch is NEW

**Rotation scans TWO places, not one.** Exclude every artist appearing in
`videos/scripts/fan-economy/` (filename or `META:` line, as subject or foil) AND every artist
already pitched in any `videos/ideas/fan-economy/batch-*.md`, including the eight that were passed
over. Scanning only the scripts folder means the same unbuilt artists come back in every future
batch, and the founder culls the identical list forever.

A passed-over pitch is not dead, it is REJECTED. Re-pitch one only when a genuinely new angle or a
newly available number changes the case, and say plainly that it is a re-pitch and what changed.


The founder has explicitly said not to recycle the existing backlog: these are new posts, not a
to-do list of scripts already written.

Also vary the MECHANISM, not just the name. Ten pitches about limited vinyl is one idea with ten
faces. Spread them across the mechanism library in `/crwn-fan-economy`: memberships and tiers,
vault and catalog access, live experiences and ticketing, Executive Producer Sessions, direct
product sales, demand discovery (cities, songs, merch), fan identification, retention and LTV, fan
A&R, preorders and reservations, owned relationships. Aim for no more than two pitches per
mechanism in a batch of ten.

## At least HALF of every batch is a VERSUS pitch, and the subject is always ICP

Measured 2026-08-22: scripts 1-30 contain 11 versus posts. Scripts 31-50 contain ZERO. The format
the founder rates most did not fade, it was switched off, and this skill did it.

**The cause was a mistaken belief, not a real constraint.** Batches 02 and 03 selected on "one
public checkable number", and I treated a versus post as needing TWO of them, one per side. It does
not. In every versus post that works, the FOIL's number is an ordinary public stat, usually monthly
listeners, which takes seconds to confirm. Only the ICP side needs real sourcing. Selecting on a
single number therefore excluded versus posts for no reason at all.

So: **at least half of every batch must be a versus pitch**, and the research effort goes on the
ICP side only.

**And the SUBJECT is always ICP.** Snoop Dogg, Spotify and Bandcamp were built as subjects in batch
03 and all three were rejected by the founder for the same reason: they are not who this is for. A
megastar or a platform may appear as the FOIL or as a fact inside a post, never as the subject. An
"industry-anchored" post with no ICP artist in it is not a Fan Economy case study, it is a think
piece, and the viewer cannot see themselves in it.

Before proposing a batch, count: how many are versus, and is every subject Tier 1? If either answer
is wrong, the batch is wrong.

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

## Name the women while PITCHING, not while picking

The versus quota worked first time: batch 04 came out 26 versus pitches of 50 and 9 versus builds
of 10, against zero across the previous twenty scripts. The gender rule did not. Batch 04's ten
built subjects were three women to seven men, because women were noticed at PICK time, when the
only names left to choose from were the ones already pitched.

By pick time it is too late. The picks can only be as balanced as the pitch list, and the pitch
list drifts male by default because the exclusion list grows and the remaining pool of famous
independent artists skews male. **So the count happens on the pitch list**: before writing the
batch file, count the women in the fifty and fix it there, not in the ten. Same failure mode as the
first image set coming out 93% male because every prompt just said "artist".

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
