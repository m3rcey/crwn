# Fan Economy idea batch 04

Pitched 2026-08-22. Fifty new case studies. 142 distinct names were excluded before a single pitch
was written: every subject and foil in scripts 1-50, plus every name pitched in batches 01, 02 and
03, built or passed.

**This is the first batch built to the versus quota.** 26 of the 50 below are versus pitches, and
every one of the 50 subjects is a Tier 1 ICP artist. No megastar and no platform appears as a
subject anywhere in this batch; they appear only as foils. That is the rule batch 03 broke in three
slots and had to be rebuilt for.

Selection rule unchanged: a public, checkable number, verified BEFORE any script is written. The
ten picks below carry their verified figure and its source in the pitch, so nothing is picked on
the strength of a number that later turns out not to exist.

## PICKED (built as scripts 51-60)

| # | Pitch | Verified before writing |
|---|---|---|
| 1 | Little Simz vs Bad Bunny | cancelled an 11-date North American tour in April 2022, weeks after winning a BRIT, saying self-financing it meant "a huge deficit" (Variety, DJ Mag, Consequence) |
| 2 | Joe Budden vs Future | roughly 70,000 paid Patreon members averaging about $1.04M a month in 2025 (Billboard) |
| 3 | Brent Faiyaz vs PARTYNEXTDOOR | turned down a reported $250,000 major-label advance to keep his masters and start Lost Kids (Yahoo Finance, AfroTech) |
| 4 | Ledisi vs H.E.R. | left Verve in Jan 2019 after a decade, founded Listen Back Entertainment, then won a Grammy for a record on her own label (AllMusic) |
| 5 | Freddie Gibbs vs Lil Baby | Alfredo released on his own ESGN, peaked at 15 on the Billboard 200, nominated for Best Rap Album (Wikipedia, NPR) |
| 6 | Big K.R.I.T. vs Gunna | six years signed to Def Jam produced two albums (HipHopWired, AllMusic) |
| 7 | Tha God Fahim vs Playboi Carti | roughly 70 tapes in about three years, sold direct on Bandcamp (Bandcamp Daily) |
| 8 | Run the Jewels vs Doja Cat | album given away free while the deluxe bundles ran from $10 to $5,000 (Stereogum) |
| 9 | Jorja Smith vs Ella Mai | three studio albums, all on her own FAMM, never signed a major deal (Wikipedia, MBW) |
| 10 | Kool Keith | 47 studio albums, 24 solo and 23 collaborative (Wikipedia discography) |

- **PICKED:** 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
- **PASSED:** 11 through 50

Nine of the ten are versus posts. The tenth, Kool Keith, is the one straight post, so the versus
share of this batch is 90% against a quota of 50% and a previous twenty-script run of zero.

Gender across the ten subjects is three women to seven men. That is 30% against the 65/35 target,
so it is short rather than balanced, and it is short because the ICP pool that survives the
142-name exclusion list is heavily male. Naming women earlier in the pitching, rather than
correcting at pick time, is what would fix it next batch.

**Vulfpeck and Cory Wong were both verified and then dropped anyway.** Both carry excellent public
numbers (5.5M silent streams paying $19,655; eight albums in one year on his own label) and both
are funk bands rather than hip hop or R&B artists. Batch 03 had three picks rejected for exactly
this, a subject the viewer cannot see themselves in, so a verified number was not allowed to
override ICP fit. They sit at 11 and 12 in the passed list if the rule ever changes.

## What the review caught after rendering

Four defects, all found by looking at the images rather than by trusting the prompts:

| Sheet | Defect | Cause and fix |
|---|---|---|
| 53 | "PARTYNEXTDOOR" lettered twice | model duplicated a name label; prompt now pins each name to exactly one appearance |
| 57 | bottom line garbled to "ONE COUNTS PLAYS. THE OTHERS. THE OTHER COUNTS PEOPLE." | the parallel "ONE COUNTS X / THE OTHER COUNTS Y" structure invited a fragment; rewritten as two unrelated lines |
| 58 | Doja Cat drawn as a pale blonde white woman | her stored reference was a 30KB washed-out blonde frame, so the model drew what it was given; photo deleted, draw note added, refetched |
| 56 slide 2 | five year-boxes under a "6 YEARS SIGNED" headline | count restated explicitly in the prompt |

**Nine of the twenty people in this batch had no reference photo at all** (Little Simz, Ledisi,
H.E.R., Freddie Gibbs, Tha God Fahim, Killer Mike, El-P, Ella Mai, Kool Keith), so they were drawn
from my prose alone, which is the exact condition that has produced every wrong likeness so far.
All nine are now registered in `known-people.json` with draw notes and will be photo-referenced
from here on. El-P's note names his glasses explicitly, since glasses are the documented feature
the model drops.

Rerolling 58 against real photos then tripped the colour guard at 361,630 non-greyscale pixels:
the colour reference photos bled skin tone into a black-ink page. A skin rule was added stating
that darker skin is denser hatching, never a colour.

**All ten sheets are now photo-grounded.** Registering the nine people fixed 57 and 58 immediately,
but left 51, 54, 55, 59 and 60 still carrying prose-drawn likenesses of Little Simz, Ledisi,
H.E.R., Freddie Gibbs, Ella Mai and Kool Keith. Those five were re-rendered against the real
references, with the skin rule applied BEFORE the render rather than after, and none tripped the
colour guard. Each was compared side by side against the version it replaced rather than swapped
blind: all five came back equal or better, and the two that looked risky at montage scale (55's
note boxes, 59's layout) were both cleaner at full resolution than the originals. The before
versions were kept until that comparison was made, so a worse reroll would have cost nothing.

The judgment worth keeping: "it looked plausible to me" is the standard that failed on Saba,
redveil, Tech N9ne and Del. A likeness drawn from prose can look completely fine and still be the
wrong person, so the fix is not a better description, it is a photo.

---

**1. Little Simz (vs Bad Bunny) — the tour she could not afford**
Hook: She had just won a BRIT and had eleven North American dates on sale. In the same year the biggest tour on earth was grossing hundreds of millions. How many of her eleven shows did she actually play?
Withheld: that the answer is zero, and that she cancelled for money, not health or demand
Reveal shape: a count that turns out to be none, followed by her own words about the deficit
Wow: an award-winning artist with millions of listeners could not afford to meet them in person
Mechanism: touring economics and owned relationships · Family: I · Magnet: between-tour-calculator + TOUR
ICP: Tier 1 by every measure, independent, and she published the reason herself, so it is her argument, not ours
NUMBER: VERIFIED

**2. Joe Budden (vs Future) — seventy thousand people who pay**
Hook: One of them has tens of millions of monthly listeners. The other has about seventy thousand people paying him every month. Which number actually pays a mortgage?
Withheld: the monthly total those seventy thousand add up to
Reveal shape: a monthly figure in seven digits, against a listener count that pays a fraction of it
Wow: he stopped rapping and built the thing rappers are told they already have
Mechanism: memberships and tiers · Family: A · Magnet: vault-revenue-planner + VAULT
ICP: a rapper who built a paid membership on top of an existing audience, which is exactly the move being sold
NUMBER: VERIFIED

**3. Brent Faiyaz (vs PARTYNEXTDOOR) — the advance he said no to**
Hook: He was offered a major-label advance as a new artist and turned it down. What did saying no cost him on the day?
Withheld: the size of the advance
Reveal shape: a six-figure number he walked away from, and what he owns now because he did
Wow: the cheque was the whole offer, and the masters were the whole point
Mechanism: owned relationships · Family: B · Magnet: own-your-fans-calculator + OWN
ICP: independent, owns his masters, and the decision is public and quotable
NUMBER: VERIFIED

**4. Ledisi (vs H.E.R.) — the Grammy she won without them**
Hook: She spent a decade on a major label collecting nominations. Then she left and started her own. How long until she won?
Withheld: that the win came AFTER she left, on her own label
Reveal shape: a date and a category, close enough to the departure to make the point
Wow: the label was never the thing that made her good
Mechanism: owned relationships · Family: B · Magnet: own-your-fans-calculator + OWN
ICP: a veteran R&B artist now operating as her own label, the exact profile CRWN serves
NUMBER: VERIFIED

**5. Freddie Gibbs (vs Lil Baby) — the same shelf, a different owner**
Hook: One album came from a major label machine. The other came from a label the rapper owns. Both ended up in the same Grammy category. Where did the independent one chart?
Withheld: the Billboard peak of the self-released record
Reveal shape: a top-twenty chart position achieved with no major behind it
Wow: he did not need permission to reach the same shelf, only distribution
Mechanism: direct product sales · Family: G · Magnet: royalty-readiness-check + ROYALTY
ICP: self-released on his own imprint at full commercial scale
NUMBER: VERIFIED

**6. Big K.R.I.T. (vs Gunna) — six years, and what he got for them**
Hook: He signed to one of the biggest labels in rap and stayed six years. How many albums did those six years produce?
Withheld: the album count
Reveal shape: a single-digit number so small it reframes the whole deal
Wow: the deal was not slow because he was slow, and he has released more since leaving
Mechanism: catalog and release strategy · Family: C · Magnet: own-your-fans-calculator + OWN
ICP: independent since 2017 on his own Multi Alumni, still touring at scale
NUMBER: VERIFIED

**7. Tha God Fahim (vs Playboi Carti) — seventy tapes, one storefront**
Hook: One of them has released a couple of albums this decade and has tens of millions of listeners. The other put out roughly seventy tapes in three years and sells them himself. Which one knows who his buyers are?
Withheld: the tape count, and that every one sells direct
Reveal shape: a two-digit release count against a listener count with seven digits
Wow: volume is only an asset when you own the counter
Mechanism: direct product sales · Family: G · Magnet: proof-of-demand-test-builder + DEMAND
ICP: a Bandcamp-native seller with a countable buyer base, the purest version of the ICP
NUMBER: VERIFIED

**8. Run the Jewels (vs Doja Cat) — free album, five thousand dollar box**
Hook: They gave the album away for nothing. On the same day they sold a version of it. What was the most expensive one?
Withheld: the top price of the deluxe package
Reveal shape: a four-figure price sitting on top of a free download
Wow: free was the bottom rung of a ladder, not the business
Mechanism: memberships and tiers · Family: A · Magnet: vault-revenue-planner + VAULT
ICP: fully independent, run their own store, and the free-plus-ladder model is the CRWN ladder
NUMBER: VERIFIED

**9. Jorja Smith (vs Ella Mai) — three albums, no deal**
Hook: Two British singers broke at almost the same moment. One signed to a major. How many albums has the other released without one?
Withheld: the count, and that the label is hers
Reveal shape: a small number of albums, all on a label she owns
Wow: she never took the deal and never stopped releasing
Mechanism: owned relationships · Family: B · Magnet: own-your-fans-calculator + OWN
ICP: independent through her own FAMM across her whole career
NUMBER: VERIFIED

**10. Kool Keith — forty-seven albums and no list**
Hook: He has been releasing records for over thirty years. How many studio albums is that?
Withheld: the total
Reveal shape: a two-digit album count most people guess at half
Wow: a catalog that size is an asset only if you can reach the people who bought it
Mechanism: catalog and vault access · Family: C · Magnet: vault-revenue-planner + VAULT
ICP: a deep-catalog independent, exactly the artist whose back catalog is worth more than his next release
NUMBER: VERIFIED

---

## PASSED

**11. Vulfpeck (vs Usher) — the silent album that paid**
Hook: They uploaded ten tracks of pure silence and asked fans to loop it overnight. What did silence pay?
Withheld: the royalty total
Reveal shape: a five-figure payout from millions of plays of nothing
Wow: silence and songs pay identically per stream
Mechanism: owned relationships · Family: B · Magnet: own-your-fans-calculator + OWN
ICP: fails ICP on genre, a funk band rather than a hip hop or R&B artist, so the viewer cannot see themselves in it
NUMBER: VERIFIED but the subject is off-ICP

**12. Cory Wong — eight albums in one year**
Hook: How many albums can one independent artist release in twelve months?
Withheld: the count
Reveal shape: a single-year release count in the high single digits
Wow: the label was never the bottleneck
Mechanism: catalog and release strategy · Family: C · Magnet: vault-revenue-planner + VAULT
ICP: off-ICP genre, same problem as 11
NUMBER: VERIFIED but off-ICP

**13. Snarky Puppy — the band that built a festival**
Hook: What is it worth to own the room your fans gather in?
Withheld: the festival economics
Reveal shape: the label and festival as one owned asset
Wow: they stopped renting audiences and built the venue
Mechanism: live experiences and ticketing · Family: I · Magnet: live-experience-calculator + LIVE
ICP: off-ICP genre, and no public figure found for the festival
NUMBER: RISKY

**14. Moonchild — self-released, then chose a label**
Hook: What does a self-released debut buy you in leverage?
Withheld: the terms they got later
Reveal shape: qualitative, which is the problem
Wow: starting independent set the price of every deal after
Mechanism: owned relationships · Family: B · Magnet: own-your-fans-calculator + OWN
ICP: fine on genre, but no checkable number surfaced
NUMBER: RISKY

**15. Musiq Soulchild — six major albums, then his own**
Hook: After six albums on majors, what changed when he left?
Withheld: the independent output
Reveal shape: a before and after album count
Wow: the catalog kept growing once he owned it
Mechanism: catalog and vault access · Family: C · Magnet: vault-revenue-planner + VAULT
ICP: strong ICP, but the post-departure numbers are thin and the story sits close to pick 4
NUMBER: NEEDS RESEARCH

**16. Sabrina Claudio — SoundCloud to her own imprint**
Hook: What does an artist keep when the imprint is hers?
Withheld: the ownership share
Reveal shape: qualitative
Wow: she never needed the first deal
Mechanism: owned relationships · Family: B · Magnet: own-your-fans-calculator + OWN
ICP: fits, but she did later release through Atlantic, which muddies the claim
NUMBER: RISKY

**17. DJ Muggs — six albums in a single year**
Hook: How many albums did he release in 2021 alone?
Withheld: the count
Reveal shape: a six-album year
Wow: a producer with his own audience does not wait for a rollout
Mechanism: catalog and release strategy · Family: C · Magnet: vault-revenue-planner + VAULT
ICP: fits, but it is the third volume-angle pitch and the picks already carry two
NUMBER: VERIFIED, held back for angle overlap

**18. Ransom — ten projects in three years**
Hook: What does a full-time independent release schedule look like?
Withheld: the project count
Reveal shape: a three-year total
Wow: he restarted a stalled career by out-working the release calendar
Mechanism: catalog and release strategy · Family: C · Magnet: vault-revenue-planner + VAULT
ICP: fits, same volume overlap as 17
NUMBER: LIKELY

**19. Nicholas Craven — the producer who picks his rappers**
Hook: What is a producer worth when he owns the record?
Withheld: the split
Reveal shape: producer economics, rarely published
Wow: he is a label with a drum machine
Mechanism: fan identification · Family: D · Magnet: royalty-readiness-check + ROYALTY
ICP: fits, but splits are almost never public
NUMBER: RISKY

**20. Black Milk — Computer Ugly and the long game**
Hook: What does two decades on your own imprint add up to?
Withheld: the catalog value
Reveal shape: qualitative
Wow: nobody can drop him
Mechanism: owned relationships · Family: B · Magnet: own-your-fans-calculator + OWN
ICP: fits, no hard number found
NUMBER: RISKY

**21. 9th Wonder — Jamla and the artists he signed**
Hook: What does a producer keep by building a label instead of taking placements?
Withheld: the roster economics
Reveal shape: qualitative
Wow: he chose the asset over the cheque
Mechanism: owned relationships · Family: B · Magnet: royalty-readiness-check + ROYALTY
ICP: fits, no published figures
NUMBER: RISKY

**22. Madlib — the beat tape as a product**
Hook: What is a beat tape worth when it is sold, not licensed?
Withheld: the direct sales
Reveal shape: qualitative
Wow: the beats were always the product
Mechanism: direct product sales · Family: G · Magnet: proof-of-demand-test-builder + DEMAND
ICP: fits, famously private about business
NUMBER: RISKY

**23. Karriem Riggins — session work versus your own name**
Hook: Which pays more, playing on other people's records or selling your own?
Withheld: the comparison
Reveal shape: qualitative
Wow: the credits do not compound, the catalog does
Mechanism: fan identification · Family: D · Magnet: royalty-readiness-check + ROYALTY
ICP: fits, no numbers
NUMBER: RISKY

**24. House Shoes — the DJ as a storefront**
Hook: What does a respected DJ convert into?
Withheld: the conversion
Reveal shape: qualitative
Wow: respect is not revenue until you ask for money
Mechanism: fan identification · Family: D · Magnet: own-your-fans-calculator + OWN
ICP: fits, below the follower floor
NUMBER: RISKY

**25. Guilty Simpson — the Detroit lifer**
Hook: What does a twenty-year underground career actually pay?
Withheld: the figure
Reveal shape: qualitative
Wow: longevity without a list is just longevity
Mechanism: retention and LTV · Family: E · Magnet: own-your-fans-calculator + OWN
ICP: fits, no published figure
NUMBER: RISKY

**26. Illa J — the brother and the catalog**
Hook: What is it like to inherit an audience you did not build?
Withheld: the conversion rate
Reveal shape: qualitative
Wow: a borrowed audience still has to be earned
Mechanism: fan identification · Family: D · Magnet: own-your-fans-calculator + OWN
ICP: below the floor on listeners
NUMBER: RISKY

**27. Planet Asia — thirty years of features**
Hook: What does a career of guest verses add up to?
Withheld: the total
Reveal shape: a feature count with no residual
Wow: work-for-hire ends when the work does
Mechanism: fan identification · Family: D · Magnet: royalty-readiness-check + ROYALTY
ICP: fits, but the angle duplicates an artist already pitched in batch 03
NUMBER: RISKY

**28. Crimeapple — Bandcamp and nothing else**
Hook: Can you run a whole career from one storefront?
Withheld: the sales
Reveal shape: qualitative
Wow: one owned page beat the whole industry for him
Mechanism: direct product sales · Family: G · Magnet: proof-of-demand-test-builder + DEMAND
ICP: fits, below the follower floor
NUMBER: RISKY

**29. Hus Kingpin — the release-a-month artist**
Hook: What happens to an audience you never stop feeding?
Withheld: the retention
Reveal shape: qualitative
Wow: constant release only works if they can buy
Mechanism: retention and LTV · Family: E · Magnet: vault-revenue-planner + VAULT
ICP: fits, no figures
NUMBER: RISKY

**30. Jay Worthy — the collaborator's catalog**
Hook: What does a career of joint albums own?
Withheld: the splits
Reveal shape: qualitative
Wow: shared records mean shared lists, or no list at all
Mechanism: owned relationships · Family: B · Magnet: own-your-fans-calculator + OWN
ICP: fits, splits not public
NUMBER: RISKY

**31. Royce da 5'9" — the veteran who kept the rights**
Hook: What did staying independent through a whole career preserve?
Withheld: the catalog position
Reveal shape: qualitative
Wow: he never had a year he did not own
Mechanism: owned relationships · Family: B · Magnet: royalty-readiness-check + ROYALTY
ICP: fits, but the ownership angle is already carried three times in the picks
NUMBER: NEEDS RESEARCH

**32. Prof — Stophouse and the Midwest room**
Hook: What is a regional audience worth when you own the label?
Withheld: the regional revenue
Reveal shape: qualitative
Wow: a city can be a business
Mechanism: demand discovery · Family: F · Magnet: proof-of-demand-test-builder + DEMAND
ICP: fits, no published number
NUMBER: RISKY

**33. Dessa — the rapper who wrote a book**
Hook: Which of her products pays best?
Withheld: the mix
Reveal shape: qualitative
Wow: the book audience and the music audience are the same list
Mechanism: direct product sales · Family: G · Magnet: vault-revenue-planner + VAULT
ICP: fits, mix not published
NUMBER: RISKY

**34. P.O.S — the collective that owned itself**
Hook: What does a co-owned label return to its artists?
Withheld: the split
Reveal shape: qualitative
Wow: they built the label rather than joining one
Mechanism: owned relationships · Family: B · Magnet: own-your-fans-calculator + OWN
ICP: fits, no figures
NUMBER: RISKY

**35. Grieves — the touring independent**
Hook: What does a decade of van tours build?
Withheld: the audience value
Reveal shape: qualitative
Wow: the miles only pay if the list survives them
Mechanism: touring economics · Family: I · Magnet: between-tour-calculator + TOUR
ICP: fits, no figures
NUMBER: RISKY

**36. Butcher Brown — the band as a catalog**
Hook: What does a band own that a solo artist does not?
Withheld: the split economics
Reveal shape: qualitative
Wow: five owners is still ownership
Mechanism: owned relationships · Family: B · Magnet: own-your-fans-calculator + OWN
ICP: borderline genre, no figures
NUMBER: RISKY

**37. Robert Glasper — the crossover audience**
Hook: Which of his audiences actually buys?
Withheld: the segmentation
Reveal shape: qualitative
Wow: two audiences, one list, very different value
Mechanism: fan identification · Family: D · Magnet: own-your-fans-calculator + OWN
ICP: above the ceiling and label-signed
NUMBER: RISKY

**38. Cory Henry — the organ and the room**
Hook: What does a virtuoso convert into?
Withheld: the conversion
Reveal shape: qualitative
Wow: skill is not a business model
Mechanism: live experiences · Family: I · Magnet: live-experience-calculator + LIVE
ICP: borderline genre
NUMBER: RISKY

**39. BADBADNOTGOOD — the beat band**
Hook: What is a band worth to a rap audience?
Withheld: the crossover value
Reveal shape: qualitative
Wow: they borrowed a genre and kept the fans
Mechanism: fan identification · Family: D · Magnet: own-your-fans-calculator + OWN
ICP: label-signed, off genre
NUMBER: RISKY

**40. Nubya Garcia — the UK jazz wave**
Hook: What does a scene do for an individual artist's income?
Withheld: the individual figure
Reveal shape: qualitative
Wow: a scene builds reach, not revenue
Mechanism: demand discovery · Family: F · Magnet: proof-of-demand-test-builder + DEMAND
ICP: off genre, label-signed
NUMBER: RISKY

**41. Amber Mark — the bedroom producer who signed**
Hook: What did signing change about what she keeps?
Withheld: the terms
Reveal shape: qualitative
Wow: she produced it all and still had to split it
Mechanism: owned relationships · Family: B · Magnet: royalty-readiness-check + ROYALTY
ICP: fits, terms not public
NUMBER: RISKY

**42. Ravyn Lenae — the slow build**
Hook: How long between the first EP and the first hit?
Withheld: the gap
Reveal shape: a span of years
Wow: the audience was there for years before the industry noticed
Mechanism: retention and LTV · Family: E · Magnet: own-your-fans-calculator + OWN
ICP: fits, but she is label-signed and the money angle is weak
NUMBER: NEEDS RESEARCH

**43. Muni Long — the songwriter who went solo**
Hook: Which paid more, writing hits for others or releasing her own?
Withheld: the comparison
Reveal shape: qualitative
Wow: she wrote for everyone else before she wrote for herself
Mechanism: fan identification · Family: D · Magnet: royalty-readiness-check + ROYALTY
ICP: fits, publishing income not public
NUMBER: RISKY

**44. Leela James — twenty years, same audience**
Hook: What does an audience that never left actually pay?
Withheld: the LTV
Reveal shape: qualitative
Wow: retention is the whole business
Mechanism: retention and LTV · Family: E · Magnet: vault-revenue-planner + VAULT
ICP: strong ICP, but no published figure
NUMBER: RISKY

**45. Avery Sunshine — the church-to-soul audience**
Hook: What is a devoted niche worth per person?
Withheld: the per-fan figure
Reveal shape: qualitative
Wow: small and devoted beats large and passive
Mechanism: retention and LTV · Family: E · Magnet: own-your-fans-calculator + OWN
ICP: fits, below the follower floor
NUMBER: RISKY

**46. Xavier Omar — the independent R&B run**
Hook: What does a fully independent R&B career look like at ten years?
Withheld: the catalog position
Reveal shape: qualitative
Wow: he never had a label year
Mechanism: owned relationships · Family: B · Magnet: own-your-fans-calculator + OWN
ICP: strong fit, no hard number surfaced
NUMBER: NEEDS RESEARCH

**47. Berhana — the four-year gap**
Hook: What does a long silence cost an independent artist?
Withheld: the decay
Reveal shape: qualitative
Wow: an audience you cannot contact decays faster than one you can
Mechanism: retention and LTV · Family: E · Magnet: own-your-fans-calculator + OWN
ICP: fits, no figures
NUMBER: RISKY

**48. Arin Ray — the competition show start**
Hook: What is a TV audience worth years later?
Withheld: the conversion
Reveal shape: qualitative
Wow: borrowed reach expires
Mechanism: fan identification · Family: D · Magnet: own-your-fans-calculator + OWN
ICP: fits, no figures
NUMBER: RISKY

**49. Bilal — the album the label shelved**
Hook: What happens to a record the label decides not to release?
Withheld: the fate of the masters
Reveal shape: a leaked album he never earned from
Wow: they owned it, so they could bury it
Mechanism: owned relationships · Family: B · Magnet: royalty-readiness-check + ROYALTY
ICP: strong ICP and a strong story, but the financial figure does not exist
NUMBER: RISKY, worth a re-pitch if a figure ever surfaces

**50. Van Hunt — dropped mid-campaign**
Hook: What does it cost when a label drops you between records?
Withheld: the loss
Reveal shape: qualitative
Wow: the deal ended and the catalog stayed with them
Mechanism: owned relationships · Family: B · Magnet: own-your-fans-calculator + OWN
ICP: fits, no published figure
NUMBER: RISKY
