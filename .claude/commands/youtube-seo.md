# YouTube SEO Metadata Generator

Generate YouTube descriptions, tags, and file metadata optimized for search. Built around what independent artists actually type into YouTube — not what we want to say.

## Invocation

`/youtube-seo <script path or topic>`

The user will provide either:
- A path to a script file (e.g. `/youtube-seo videos/scripts/WILL_AI_REPLACE_MUSICIANS_SCRIPT.md`)
- A topic/thesis sentence (e.g. `/youtube-seo Music is becoming the least valuable part of the offer`)

If a path is given, read the file first to extract the thesis, hook, and main points. If only a topic is given, work from the topic.

**Do not ask follow-up questions.** Generate the full output immediately.

## Target Audience (informs all keyword choices)

Independent music artists, 22-35 years old, 3K-50K followers. Frustrated about money, growth, or the industry. Problem-aware. They search YouTube when they're stuck, broke, or losing momentum.

Reverse-engineer the metadata from what THEY would type into search — not from what the video is "about" in the abstract.

## Workflow

1. Read the script or parse the topic.
2. Identify the core problem the video solves and the primary keyword phrase a frustrated independent artist would actually search.
3. Use WebSearch to validate the keyword phrase and find related search variations (search YouTube-style queries: "how to make money from music", "why streaming doesn't pay", etc.). Pull at least 2 searches to ground the tags in real query patterns.
4. Generate all four sections (Title, Description, Tags, File Metadata) in the format below.
5. Output. Done. No questions, no preamble.

## Output Format

**Output the data directly to the chat. Do NOT save to a file. Each section MUST be in its own fenced code block so the user can copy each section independently with a single click.** Put a plain-text section header line above each block (e.g. `**TITLE:**`) — the header is outside the block, the value is inside.

The full structure looks like this:

**TITLE** (3 options for A/B testing, each its own copyable block):

Option 1:
```
<title 1>
```

Option 2:
```
<title 2>
```

Option 3:
```
<title 3>
```

**THUMBNAIL TEXT** (5 options — 1-4 words each, answers the question the title poses):
```
1. <option 1>
2. <option 2>
3. <option 3>
4. <option 4>
5. <option 5>
```

**DESCRIPTION:**
```
<description — see Description rules>
```

**TAGS:**
```
<comma-separated, 15 max — see Tags rules>
```

**FILE METADATA** — each field is its own copyable block (Windows Properties dialog takes one paste per field):

Title:
```
<same as YouTube title>
```

Subtitle:
```
<one-line thesis>
```

Tags:
```
<5 phrases separated by semicolons>
```

Comments:
```
<2-3 sentence summary with primary keyword and thecrwn.app>
```

Contributing artists:
```
CRWN
```

Genre:
```
Education
```

Directors:
```
Josh Williams
```

Producers:
```
CRWN
```

Publisher:
```
JNW Creative Enterprises
```

Copyright:
```
2026 JNW Creative Enterprises Inc.
```

Writers:
```
Josh Williams
```

Content provider:
```
CRWN
```

Encoded by:
```
CRWN
```

Author URL:
```
https://thecrwn.app
```

Promotion URL:
```
https://thecrwn.app
```

Parental rating:
```
G
```

Parental rating reason:
```

```

Composers:
```

```

Do NOT wrap the entire output in a single code block. Each section AND each metadata field is its own block. Leave the value block empty (just opening and closing fences with a blank line) for fields that should be blank.

## Title Rules

- **Generate 3 distinct title options for A/B testing.** Each option must follow every rule below. The 3 options should explore different *angles* (different question stems, different focal numbers, different framings) so A/B testing actually measures something. Don't ship 3 titles that are word-shuffles of each other.
- **Always a question.** End with a question mark. The title poses the question; the thumbnail text answers it. "Why X" / "Can X" / "Is X" / "How X" / "Are X" / "What X" — pick whichever fits.
- **Always in ALL CAPS.** The entire title is uppercase, including the question mark sentence. Numbers and symbols stay as-is.
- Primary keyword phrase appears in the first 3-5 words (at least 2 of the 3 options should hit this; the third can lead with a different curiosity hook)
- Clear about what the viewer will learn
- Creates curiosity or tension
- **Under 40 characters** (hard cap, count them, including the question mark)
- No clickbait that the video doesn't deliver on

## Thumbnail Text Rules

The thumbnail card holds 1-4 words that **answer the question the title poses**. Together, the title (the setup) and thumbnail text (the answer) should give the viewer a complete idea of what they're about to watch in under one second.

- **1 word beats 2 words. 2 beats 3. 3 beats 4.** Default to 1 word unless the answer genuinely needs more.
- If the title is a literal question ("Can 500 Fans Make You $100K?"), the thumbnail is the literal answer ("YES" / "$100K" / "EASILY").
- If the title is a statement ("Why Streaming Doesn't Pay Artists"), the thumbnail is the *punchy reveal*: the most curiosity-inducing word from the video's payoff ("PENNIES" / "ACCESS" / "NOT MUSIC").
- Generate **5 distinct options**. Show range: short single words, surprising numbers, and 2-3 word answers, so the user can pick the one with the strongest visual contrast against the title.
- All caps reads better at thumbnail size; format the options that way.
- Avoid generic words ("MONEY," "TRUTH," "EXPOSED") that could front any video.

## Title-Thumbnail Pairing Pass (after the user picks a thumbnail)

When the user replies with their chosen thumbnail answer (e.g. "going with YES.", "I'm picking $100K"), do a SECOND PASS to produce **2 title variations specifically tuned to that thumbnail**. The goal: make the title-thumbnail pair feel inevitable. The title sets up the answer, the answer lands the title.

Output format for the pairing pass:

**TITLE PAIRING for thumbnail "<chosen text>"** (2 variations, each its own copyable block):

Option A:
```
<title variation A>
```

Option B:
```
<title variation B>
```

### Pairing rules

- Both variations must follow all original Title Rules (question, ALL CAPS, under 40 chars, no em dashes).
- **VARIATIONS, not new titles.** The 2 outputs must keep the SAME core premise as the original title (same numbers, same subject, same outcome). Only the *phrasing* changes: a different question stem (Can/Will/Is/Could), a different verb (make/pay/get/earn), or word order. If the user picks "CAN 500 FANS MAKE YOU $100K?", do not switch the topic to label deals or 1,000 fans comparisons. Keep "500 fans" and "$100K" intact.
- **The title's question form must match what the thumbnail literally answers.**
  - "YES." / "NO." / "EASILY." answer yes/no questions ("Can X?" / "Is X?" / "Are X?" / "Will X?")
  - A dollar amount ("$100K") answers "how much" or "what's the payoff" questions ("How Much Do X Make?" / "What's X Worth?")
  - A noun ("ACCESS" / "PROCESS") answers "what is X?" or "what are they selling?" questions
  - A number ("500" / "5") answers "how many" questions
- The 2 variations should each pull a different micro-lever (different verb OR different question stem OR different word order), so the user has a real choice between two phrasings of the same idea, not two different ideas.

## Description Rules

- **First line is always:** `Check out CRWN: https://thecrwn.app`
- The description gives VALUE about the topic. It is NOT a CRWN ad. CRWN is mentioned once in the first line and never again.
- The first 160 characters AFTER the CRWN link are the search snippet. Primary keyword must appear in the first sentence after the link.
- Write 3-5 sentences explaining what the video covers and why the viewer should care. Address their pain or curiosity from their perspective.
- **Never** use "In this video I talk about..." or similar filler. State the value directly.
- **Never use em dashes** anywhere in the description, comments, or any other field. Use periods, commas, parentheses, or two short sentences instead.
- End with 3-5 hashtags (never more than 5 — YouTube ignores all of them past 15 across the whole description, and 5 is the safe cap).
  - Always include: `#IndependentArtist #MusicBusiness`
  - Add 1-3 specific to the topic.

## Tags Rules

- 15 tags maximum
- Tag 1: exact primary keyword phrase
- Tags 2-5: close variations of the primary keyword
- Tags 6-15: related topics the target audience searches for
- Every tag must accurately describe the video. Irrelevant tags get penalized.
- Think like the avatar: a 27-year-old independent artist with 8K followers, frustrated about Spotify payouts, typing into YouTube at 1am.

## File Metadata Rules

These are set in Windows file Properties > Details before upload.

- Title: same as YouTube title
- Subtitle: one-line summary of the video's thesis (what the viewer walks away believing)
- Tags: 5 keyword phrases separated by semicolons (subset of the YouTube tags, the highest-intent ones)
- Comments: 2-3 sentences. Must include primary keyword and `thecrwn.app`.
- Remaining fields are static — copy verbatim from the format above.

## Example (reference, do not copy)

For "Music is becoming the least valuable part of the offer":

**TITLE** (3 options for A/B testing, each its own copyable block):

Option 1:
```
WHY DOESN'T STREAMING PAY ARTISTS?
```

Option 2:
```
IS STREAMING A SCAM FOR ARTISTS?
```

Option 3:
```
WHY ARE INDIE ARTISTS BROKE?
```

**THUMBNAIL TEXT** (5 options — 1-4 words each, answers the question the title poses):
```
1. PENNIES
2. .003¢
3. ACCESS
4. NOT MUSIC
5. THE WRONG PRODUCT
```

**DESCRIPTION:**
```
Check out CRWN: https://thecrwn.app

Streaming pays you a third of a penny per play. You already know that. But most artists don't know what to sell instead. This video breaks down what changed, why the song is no longer the product, and what the artists making real money figured out that everyone else missed.

We have to understand why streams were never the answer in the first place, and what to replace them with.

#HowToMakeMoneyFromMusic #IndependentArtist #MusicBusiness #MusicMonetization #DirectToFan
```

**TAGS:**
```
how to make money from music, how to make money as an independent artist, music monetization, why streaming doesn't pay artists, Spotify pay per stream, independent artist income, how to sell music directly to fans, direct to fan music, music business tips, how to monetize music 2026, why artists are broke, artist subscription model, selling access to fans, independent musician tips, music career advice
```

**FILE METADATA:**

Title:
```
WHY DOESN'T STREAMING PAY ARTISTS?
```

Subtitle:
```
Why music is becoming the least valuable part of the offer
```

Tags:
```
how to make money from music; independent artist; music monetization; direct to fan; music business
```

Comments:
```
Streaming pays a third of a penny. The artists making real money are selling something else. This video shows you what it is. thecrwn.app
```

Contributing artists:
```
CRWN
```

Genre:
```
Education
```

Directors:
```
Josh Williams
```

Producers:
```
CRWN
```

Publisher:
```
JNW Creative Enterprises
```

Copyright:
```
2026 JNW Creative Enterprises Inc.
```

Writers:
```
Josh Williams
```

Content provider:
```
CRWN
```

Encoded by:
```
CRWN
```

Author URL:
```
https://thecrwn.app
```

Promotion URL:
```
https://thecrwn.app
```

Parental rating:
```
G
```

Parental rating reason:
```

```

Composers:
```

```

## User argument

$ARGUMENTS
