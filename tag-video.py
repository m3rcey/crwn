#!/usr/bin/env python3
"""Bake YouTube SEO metadata into the MP4 copy."""
from mutagen.mp4 import MP4, MP4FreeForm

PATH = "/mnt/c/Users/Merce/Dropbox/CRWN/Why TikTok Artists Are Broke (50M Views = $400).mp4"

TITLE = "Why TikTok Artists Are Broke (50M Views = $400)"
SUBTITLE = "TikTok is an attention casino — your music is the bait, not the product"
TAGS = "why tiktok artists are broke; tiktok creator fund music; how much does tiktok pay; how to make money on tiktok as a musician; independent artist"
COMMENTS = ("Why TikTok artists are broke even at 50 million views: the platform sells your "
            "attention to advertisers and uses your music as bait. The artists making a living "
            "all made one move. thecrwn.app")
ARTIST = "CRWN"
GENRE = "Education"
DIRECTOR = "Josh Williams"
PRODUCER = "CRWN"
PUBLISHER = "JNW Creative Enterprises"
COPYRIGHT = "2026 JNW Creative Enterprises Inc."
YEAR = "2026"

video = MP4(PATH)

video["\xa9nam"] = [TITLE]
video["\xa9ART"] = [ARTIST]
video["\xa9cmt"] = [COMMENTS]
video["\xa9gen"] = [GENRE]
video["\xa9day"] = [YEAR]
video["cprt"] = [COPYRIGHT]
video["desc"] = [SUBTITLE]
video["ldes"] = [SUBTITLE]
video["\xa9wrt"] = [DIRECTOR]
video["keyw"] = [TAGS]

def ff(key, value):
    return MP4FreeForm(value.encode("utf-8"), 1)

video["----:com.apple.iTunes:DIRECTOR"] = [ff("DIRECTOR", DIRECTOR)]
video["----:com.apple.iTunes:PRODUCER"] = [ff("PRODUCER", PRODUCER)]
video["----:com.apple.iTunes:PUBLISHER"] = [ff("PUBLISHER", PUBLISHER)]
video["----:com.apple.iTunes:SUBTITLE"] = [ff("SUBTITLE", SUBTITLE)]
video["----:com.apple.iTunes:KEYWORDS"] = [ff("KEYWORDS", TAGS)]

video.save()

print("Tagged:", PATH)
print()
v = MP4(PATH)
for k in sorted(v.keys()):
    val = v[k]
    if isinstance(val, list) and val and isinstance(val[0], MP4FreeForm):
        val = [bytes(x).decode("utf-8", errors="replace") for x in val]
    print(f"  {k}: {val}")
