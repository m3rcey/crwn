# Storyboard wireframes for the Prince Dre VSL (STORYBOARD.md): composition, text placement and
# the type system from his own covers. Windows Python + Pillow:
#   python docs/vsl/prince-dre/wireframes.py
# Fonts are open-license Google Fonts, downloaded once into a temp folder (never committed):
# Rye (Tuscan slab headline), Knewave (stand-in for the red dry-brush key word), Montserrat
# (tracked credits and subtitles). Frame 5 cuts his real logo out of type-reference/.
# Cover art is read from `videos/` under DRE_MEDIA (default: this repo). Those files are not
# committed, so a fresh worktree draws grey boxes unless DRE_MEDIA points at the main checkout.
#
# THE ONE LAYOUT RULE (Josh, 2026-10-03): nothing passes behind a letter. Text lives in the left
# 52% of the frame, every subject starts at RIGHT_ZONE or later.
import os
import tempfile
import urllib.request

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'storyboard-wireframes.png')
LOGO = os.path.join(HERE, 'type-reference', 'logo-prince-dre.jpg')
MEDIA = os.environ.get('DRE_MEDIA') or os.path.normpath(os.path.join(HERE, '..', '..', '..'))
FONT_DIR = os.environ.get('DRE_FONTS') or os.path.join(tempfile.gettempdir(), 'dre-vsl-fonts')
FONTS = {
    'Rye-Regular.ttf': 'ofl/rye/Rye-Regular.ttf',
    'Knewave-Regular.ttf': 'ofl/knewave/Knewave-Regular.ttf',
    'Montserrat[wght].ttf': 'ofl/montserrat/Montserrat%5Bwght%5D.ttf',
}
os.makedirs(FONT_DIR, exist_ok=True)
for name, path in FONTS.items():
    dest = os.path.join(FONT_DIR, name)
    if not os.path.exists(dest):
        urllib.request.urlretrieve('https://github.com/google/fonts/raw/main/' + path, dest)

SLAB = os.path.join(FONT_DIR, 'Rye-Regular.ttf')
BRUSH = os.path.join(FONT_DIR, 'Knewave-Regular.ttf')
SANS_PATH = os.path.join(FONT_DIR, 'Montserrat[wght].ttf')
FACE = {'slab': SLAB, 'chrome': SLAB, 'strike': SLAB, 'brush': BRUSH}


def sans(size, weight='SemiBold'):
    f = ImageFont.truetype(SANS_PATH, size)
    f.set_variation_by_name(weight)
    return f


W, H = 480, 270
TEXT_RIGHT = W * 0.52
RIGHT_ZONE = W * 0.55
BG, WHITE, RED = (13, 13, 13), (245, 245, 242), (224, 38, 43)   # #E0262B, 4.15:1 on #0D0D0D
ORANGE, GREY, PANEL = (210, 120, 40), (70, 70, 66), (30, 30, 30)

PD = 'videos/prince dre'
COVERS = {
    'STTT': f'{PD}/Stompin Thru The Trenches/Stompin Thru The Trenches (Cover Art).png',
    'BB': f'{PD}/Blood Brothaz/Blood Brothaz (Cover Art).jpg',
    'SJ': f'{PD}/Shotta In Da Jungle/Shotta In Da Jungle (Cover Art).jpg',
    'LIL': f'{PD}/Life I Live/Life I Live (Cover Art).jpg',
    'IR': f'{PD}/Im Reloaded/Im Reloaded (Cover Art).png',
    'OBAN': f'{PD}/O Block Ass Nigga/O Block Ass Nigga (Cover Art).jpg',
    'SDLY': f'{PD}/Streets Dont Love You/Streets Dont Love You (Cover Art).jpg',
    'ROTP': 'videos/output/Prince Dre - The Return Of The Prince.jpg',
    'FPOB': 'videos/output/Prince Dre - Fresh Prince Of O Block.jpg',
    'OTOIME': 'videos/output/prince dre - Only The O In My Eyes.jpg',
}
# Release order, Stompin last: the grid in frame 11 reads oldest to newest.
CATALOG = ['FPOB', 'BB', 'SJ', 'OBAN', 'OTOIME', 'LIL', 'SDLY', 'IR', 'ROTP', 'STTT']
_cover_cache = {}


def cover(key, size):
    if (key, size) not in _cover_cache:
        path = os.path.join(MEDIA, COVERS[key])
        if os.path.exists(path):
            im = Image.open(path).convert('RGB')
            side = min(im.size)
            im = im.crop(((im.width - side) // 2, (im.height - side) // 2, (im.width + side) // 2, (im.height + side) // 2))
            im = im.resize((size, size), Image.LANCZOS)
        else:
            im = Image.new('RGB', (size, size), (90, 90, 90))
        _cover_cache[(key, size)] = im
    return _cover_cache[(key, size)]


def redacted(key, size, torn=False):
    im = cover(key, size).filter(ImageFilter.GaussianBlur(size / 14)) if not torn else cover(key, size).copy()
    d = ImageDraw.Draw(im)
    if torn:
        d.polygon([(0, size * 0.40), (size * 0.38, size * 0.34), (size * 0.30, size * 0.50), (0, size * 0.55)], fill=(0, 0, 0))
        d.polygon([(size * 0.72, size * 0.52), (size, size * 0.46), (size, size * 0.60), (size * 0.80, size * 0.64)], fill=(0, 0, 0))
    else:
        d.rectangle([0, size * 0.40, size, size * 0.58], fill=(0, 0, 0))
    return im


# (source, subject, letterbox, lines, label, extra). A line is [(text, face)]:
# face 'slab' | 'brush' (always the red key word) | 'chrome' | 'strike' (white slab, red strike).
FRAMES = [
    # EVERGREEN (Josh, 2026-10-03): no frame names a current project, shows a count, or puts a
    # cover on a price card. The hook is an unlabeled disc; only released covers ever appear.
    ('P1+G', 'disc', False, [[('MUSIC', 'slab')], [('NOBODY', 'brush'), (' EVER HEARD', 'slab')]], 'I got music aint nobody ever heard', None),
    ('G', 'none', False, [[('NOT ON YOUTUBE', 'strike')], [('NOT ON NO MIXTAPE SITE', 'strike')]], 'It aint on YouTube. Not on no mixtape site.', None),
    ('A', 'dre', False, [[('NOWHERE.', 'brush')]], 'It aint nowhere. By the time this video over...', 'sub:you gon know how to get it'),
    ('P2', 'courtyard', False, [], "I'm Prince Dre. The Fresh Prince Of O'Block.", 'logo'),
    ('R', 'cover43:FPOB', False, [], 'I been dropping since like 2013', "credit:2013 · FRESH PRINCE OF O'BLOCK"),
    ('R', 'cover43:BB', False, [], '(eras, about 1 s each)', 'credit:2015 · BLOOD BROTHAZ'),
    ('R', 'comments', False, [[('WHERE CAN I HEAR', 'slab')], [('ALL', 'brush'), (' OF IT?', 'slab')]], 'Where can I hear all of the music...?', None),
    ('P3', 'courtyard', False, [], 'Random projects all over old mixtape sites', 'sub:(subtitle only)'),
    ('R', 'screen', False, [[('EVERY PROJECT', 'chrome')], [('ONE PLACE', 'chrome')]], 'So I put it all in one place, on CRWN', None),
    ('R+G', 'grid10', False, [[('SOME YOU HEARD', 'slab')], [('SOME YOU ', 'slab'), ("AIN'T", 'brush')]], "A lot of em you heard of, some you ain't", None),
    ('R', 'player', False, [], 'If you just got a free song from me', 'sub:(subtitle only)'),
    ('P4', 'courtyard', True, [[('FROM EVERY', 'slab')], [('ERA', 'brush')]], 'Stuff from every era that I dropped', None),
    ('R', 'archive', True, [], 'Pictures nobody ever seen. Videos...', 'credit:PHOTO · NEVER POSTED · 2015'),
    ('R', 'post', False, [], 'Thats all going in here', 'sub:(subtitle only)'),
    ('R', 'vote', False, [[('YOU ', 'slab'), ('PICK', 'brush')], [('WHAT DROPS NEXT', 'slab')]], 'You pick which ones I put out next', None),
    ('G+P5', 'card1', False, [], 'Ten dollars a month', None),
    ('G', 'number', False, [[('YOUR ', 'slab'), ('NUMBER', 'brush')], [('NEVER CHANGES', 'slab')]], 'A number next to your name', None),
    ('G+P5', 'card2', False, [], '$25 a month', None),
    ('G+P5', 'card3', False, [], '$50 a month: everything, no waiting', None),
    ('P1+G', 'discreveal', False, [[('AINT NOBODY', 'slab')], [('HEARD IT', 'slab')], [('$50 · ', 'slab'), ('ALL', 'brush'), (' OF IT', 'slab')]], 'That music I told you about. Its in here.', None),
    ('G', 'end', False, [[('PICK YOUR LEVEL', 'slab')], [('BELOW', 'brush')]], 'Pick your level below', 'sub:Cancel whenever you want'),
]


def line_width(d, line, size):
    return sum(d.textlength(t, font=ImageFont.truetype(FACE[f], size)) for t, f in line)


def fit(d, line, max_w, start=56, floor=14):
    size = start
    while size > floor and line_width(d, line, size) > max_w:
        size -= 1
    return size


def chrome(im, xy, text, font):
    # Silver gradient with a dark horizon band, clipped to the glyphs (How Im Coming's title).
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).text(xy, text, font=font, fill=255, anchor='ls')
    box = mask.getbbox()
    if not box:
        return
    top, bot = box[1], box[3]
    grad = Image.new('RGB', im.size)
    g = ImageDraw.Draw(grad)
    for y in range(top, bot + 1):
        t = (y - top) / max(1, bot - top)
        v = int(250 - 120 * (t / 0.5)) if t < 0.5 else int(95 + 150 * ((t - 0.5) / 0.5))
        g.line([0, y, im.size[0], y], fill=(v, v, min(255, v + 12)))
    im.paste(grad, (0, 0), mask)


def tracked(d, xy, text, font, fill, track=0.25, center=False):
    # Montserrat with +250 tracking: Pillow has no letter-spacing, so set each glyph.
    widths = [d.textlength(ch, font=font) + font.size * track for ch in text]
    x, y = xy
    if center:
        x -= (sum(widths) - font.size * track) / 2
    for ch, w in zip(text, widths):
        d.text((x, y), ch, font=font, fill=fill)
        x += w


def logo_cutout(target_w):
    # His real lockup (crown over the I, DRE in brush) lifted off the textured background.
    src = Image.open(LOGO).convert('L').crop((285, 290, 995, 1015))
    alpha = src.point(lambda v: 255 if v > 175 else (0 if v < 120 else int((v - 120) * 255 / 55)))
    logo = Image.new('RGBA', src.size, WHITE + (0,))
    logo.putalpha(alpha)
    return logo.resize((target_w, int(src.size[1] * target_w / src.size[0])), Image.LANCZOS)


def person(d):
    d.rectangle([W * 0.62, H * 0.12, W * 0.92, H], fill=GREY)
    d.ellipse([W * 0.69, H * 0.0, W * 0.85, H * 0.32], fill=(95, 95, 90))
    d.rectangle([W * 0.92, H * 0.1, W * 0.94, H * 0.9], fill=ORANGE)


def card(im, d, x, y, w, h, key, price, rows, hot):
    d.rounded_rectangle([x, y, x + w, y + h], 8, fill=(34, 32, 30), outline=RED if hot else GREY, width=2)
    side = w - 24
    if key:
        im.paste(cover(key, side), (x + 12, y + 10))
    else:
        # Evergreen: his mark where a cover would go, so the card never names a project.
        d.rectangle([x + 12, y + 10, x + 12 + side, y + 10 + side], fill=(22, 22, 22))
        lg = logo_cutout(int(side * 0.7))
        im.paste(lg, (x + 12 + (side - lg.width) // 2, y + 10 + (side - lg.height) // 2), lg)
    d.text((x + 12, y + side + 42), price, font=ImageFont.truetype(SLAB, 28), fill=WHITE, anchor='ls')
    yy = y + side + 50
    for row in rows:
        if row == 'EVERYTHING':
            d.text((x + 12, yy + 16), row, font=ImageFont.truetype(BRUSH, 16), fill=RED, anchor='ls')
            yy += 20
        else:
            size = 7
            while size > 5 and sum(d.textlength(ch, font=sans(size)) + size * 0.15 for ch in row) > w - 24:
                size -= 1
            tracked(d, (x + 12, yy), row, sans(size), WHITE, 0.15)
            yy += 11


CARD_DEFS = [
    (None, '$10', ['FULL PROJECTS', 'BEHIND THE SCENES', 'A VOTE', 'YOUR NUMBER']),
    (None, '$25', ['MORE PROJECTS DAY ONE', 'THE VAULT', 'MORE THE LONGER', 'YOU STAY']),
    (None, '$50', ['EVERYTHING', 'NO WAITING', 'NEW MUSIC FIRST']),
]


def disc(im, d, torn):
    # The unlabeled CD in a jewel case (plate P1), right third. Hook: under a redaction bar.
    # Payoff: the bar torn off and gold light spilling out of the case.
    x0, y0, s = int(W * 0.6), int(H * 0.16), int(W * 0.34)
    if torn:
        glow = Image.new('RGB', (W, H), (0, 0, 0))
        ImageDraw.Draw(glow).ellipse([x0 - 30, y0 - 30, x0 + s + 30, y0 + s + 30], fill=(150, 110, 30))
        im.paste(Image.blend(im, glow.filter(ImageFilter.GaussianBlur(28)), 0.9), (0, 0))
        d = ImageDraw.Draw(im)
    d.rectangle([x0, y0, x0 + s, y0 + s], fill=(40, 40, 44), outline=(150, 150, 160), width=2)
    d.ellipse([x0 + 12, y0 + 12, x0 + s - 12, y0 + s - 12], fill=(205, 205, 212) if torn else (120, 120, 128))
    c = s // 2
    d.ellipse([x0 + c - 14, y0 + c - 14, x0 + c + 14, y0 + c + 14], fill=(40, 40, 44))
    if torn:
        d.polygon([(x0 - 6, y0 + s * 0.38), (x0 + s * 0.34, y0 + s * 0.30), (x0 + s * 0.26, y0 + s * 0.48), (x0 - 6, y0 + s * 0.54)], fill=(0, 0, 0))
        d.polygon([(x0 + s * 0.74, y0 + s * 0.50), (x0 + s + 6, y0 + s * 0.44), (x0 + s + 6, y0 + s * 0.60), (x0 + s * 0.82, y0 + s * 0.64)], fill=(0, 0, 0))
    else:
        d.rectangle([x0 - 8, y0 + s * 0.40, x0 + s + 8, y0 + s * 0.58], fill=(0, 0, 0))


def subject(im, d, subj):
    rz = RIGHT_ZONE
    if subj == 'dre':
        person(d)
    elif subj == 'courtyard':
        for k in range(6):
            d.rectangle([W * (0.56 + k * 0.075), H * (0.15 + (k % 2) * 0.1), W * (0.62 + k * 0.075), H], fill=(60 + k * 6, 40, 30))
    elif subj in ('disc', 'discreveal'):
        disc(im, d, torn=(subj == 'discreveal'))
    elif subj.startswith('cover43'):
        d.rectangle([W * 0.125, 0, W * 0.875, H], fill=(25, 25, 22))
        side = int(H * 0.66)
        im.paste(cover(subj.split(':')[1], side), ((W - side) // 2, int(H * 0.06)))
    elif subj == 'comments':
        for k in range(4):
            x, y = int(rz) + 8 + k * 12, 20 + k * 52
            d.rounded_rectangle([x, y, W - 6, y + 40], 6, fill=(245, 245, 245))
            d.rectangle([x + 6, y + 8, x + 30, y + 32], fill=(150, 150, 150))
            for j in range(2):
                d.line([x + 38, y + 14 + j * 12, W - 30 - j * 30, y + 14 + j * 12], fill=(120, 120, 120), width=3)
    elif subj == 'screen':
        x0 = int(rz)
        d.rectangle([x0, H * 0.1, W - 14, H * 0.9], fill=(26, 26, 26), outline=(212, 175, 55), width=2)
        side = 44
        for k, key in enumerate(['FPOB', 'BB', 'SJ', 'OBAN', 'IR', 'ROTP']):
            cx, cy = x0 + 12 + (k % 3) * (side + 10), int(H * 0.2) + (k // 3) * (side + 30)
            im.paste(cover(key, side), (cx, cy))
            d.line([cx, cy + side + 8, cx + side - 8, cy + side + 8], fill=(150, 150, 150), width=3)
    elif subj == 'grid10':
        side, gap = 33, 5
        x0 = int(rz) + 4
        y0 = (H - (2 * side + gap)) // 2
        # Seven RELEASED covers lit, three unlabeled dark squares for what nobody has heard. Never a
        # real unreleased cover: that would date the video when the project moves or comes out.
        released = ['FPOB', 'BB', 'SJ', 'OBAN', 'OTOIME', 'LIL', 'ROTP']
        for k in range(10):
            x, y = x0 + (k % 5) * (side + gap), y0 + (k // 5) * (side + gap)
            if k in (3, 7, 9):
                d.rectangle([x, y, x + side, y + side], fill=(28, 28, 30), outline=RED, width=1)
                d.rectangle([x, y + side * 0.4, x + side, y + side * 0.58], fill=(0, 0, 0))
            else:
                im.paste(cover(released.pop(0), side), (x, y))
    elif subj == 'player':
        x0 = int(rz)
        d.rounded_rectangle([x0, H * 0.12, W - 14, H * 0.88], 10, fill=PANEL)
        side = 90
        im.paste(cover('SJ', side), (x0 + 20, int(H * 0.18)))
        d.line([x0 + 20, H * 0.18 + side + 22, W - 34, H * 0.18 + side + 22], fill=(110, 110, 110), width=4)
        d.line([x0 + 20, H * 0.18 + side + 22, x0 + 80, H * 0.18 + side + 22], fill=(212, 175, 55), width=4)
        d.ellipse([x0 + 20, H * 0.18 + side + 34, x0 + 48, H * 0.18 + side + 62], fill=(212, 175, 55))
    elif subj == 'archive':
        for k, (dx, dy, tone) in enumerate([(0.42, 0.16, (88, 78, 70)), (0.60, 0.26, (70, 64, 60)), (0.74, 0.14, (100, 90, 80))]):
            x, y = W * dx, H * dy
            d.rectangle([x, y, x + W * 0.2, y + H * 0.46], fill=tone, outline=(230, 225, 215), width=3)
        d.rectangle([W * 0.6 + 3, H * 0.26, W * 0.8 + 3, H * 0.72], outline=RED, width=1)
    elif subj == 'post':
        x0 = int(rz)
        d.rounded_rectangle([x0, H * 0.1, W - 14, H * 0.9], 10, fill=PANEL)
        d.ellipse([x0 + 14, H * 0.16, x0 + 40, H * 0.16 + 26], fill=(95, 95, 90))
        d.line([x0 + 50, H * 0.16 + 13, x0 + 120, H * 0.16 + 13], fill=(200, 200, 200), width=4)
        d.rectangle([x0 + 14, H * 0.32, W - 28, H * 0.72], fill=(80, 72, 66))
        d.rounded_rectangle([x0 + 14, H * 0.77, x0 + 100, H * 0.77 + 18], 9, fill=(212, 175, 55))
        tracked(d, (x0 + 22, H * 0.77 + 4), 'MEMBERS', sans(8), (20, 20, 20), 0.2)
    elif subj == 'vote':
        x0 = int(rz)
        d.rounded_rectangle([x0, H * 0.1, W - 14, H * 0.9], 10, fill=PANEL)
        for k in range(3):
            y = H * 0.18 + k * 44
            d.rounded_rectangle([x0 + 12, y, W - 26, y + 34], 6, outline=(212, 175, 55) if k == 1 else GREY, width=2)
            tracked(d, (x0 + 22, y + 11), f'UNRELEASED SONG {"ABC"[k]}', sans(8), WHITE, 0.15)
        d.rounded_rectangle([x0 + 12, H * 0.72, W - 26, H * 0.72 + 26], 13, fill=(212, 175, 55))
        tracked(d, ((x0 + W - 14) / 2, H * 0.72 + 7), 'VOTE', sans(10), (20, 20, 20), 0.2, center=True)
    elif subj == 'number':
        x0 = int(rz)
        for k, (name, pill, you) in enumerate([('Tay', 'GOLD #7', False), ('You', 'SILVER #1', True), ('Mook', 'BRONZE', False)]):
            y = H * 0.16 + k * 66
            d.rounded_rectangle([x0, y, W - 14, y + 54], 8, fill=(48, 44, 30) if you else PANEL, outline=(212, 175, 55) if you else None, width=2)
            d.ellipse([x0 + 10, y + 12, x0 + 38, y + 40], fill=(95, 95, 90))
            d.text((x0 + 46, y + 14), name, font=sans(12, 'Bold'), fill=WHITE)
            pw = d.textlength(pill, font=sans(9)) + 18
            d.rounded_rectangle([x0 + 90, y + 13, x0 + 90 + pw, y + 31], 9, fill=RED if you else (90, 90, 90))
            d.text((x0 + 99, y + 16), pill, font=sans(9), fill=WHITE)
            d.line([x0 + 46, y + 42, W - 40, y + 42], fill=(110, 110, 110), width=3)
        tracked(d, (x0, H - 16), 'EXAMPLE', sans(7), (150, 150, 150), 0.2)
    elif subj.startswith('card'):
        n = int(subj[-1])
        w, h = 132, 236
        for k in range(n):
            key, price, rows = CARD_DEFS[k]
            card(im, d, 24 + k * 146, 17, w, h, key, price, rows, hot=(k == n - 1))
    elif subj == 'end':
        d.polygon([(W * 0.82, H * 0.5), (W * 0.92, H * 0.5), (W * 0.87, H * 0.7)], fill=RED)


def frame(spec):
    src, subj, lbox, lines, label, extra = spec
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)
    subject(im, d, subj)
    if lbox:
        d.rectangle([0, 0, W, 24], fill=(0, 0, 0))
        d.rectangle([0, H - 24, W, H], fill=(0, 0, 0))

    # Headline lines, left aligned, each fitted so it never crosses 52%. Text-only frames (no
    # subject at all) may run wider.
    max_w = (W * 0.86 if subj == 'none' else W * 0.72 if subj == 'end' else TEXT_RIGHT) - 24
    y = 34 if lbox else (64 if subj in ('none', 'end') else 30)
    for line in lines:
        size = fit(d, line, max_w)
        y += int(size * 0.95)
        x = 24
        for text, face in line:
            f = ImageFont.truetype(FACE[face], size)
            if face == 'chrome':
                chrome(im, (x, y), text, f)
            else:
                d.text((x, y), text, font=f, fill=RED if face == 'brush' else WHITE, anchor='ls')
            if face == 'strike':
                mid = y - size * 0.32
                d.line([x - 4, mid + 3, x + d.textlength(text, font=f) + 4, mid - 3], fill=RED, width=max(2, size // 16))
            x += d.textlength(text, font=f)
        y += int(size * 0.35)

    if extra == 'logo':
        lg = logo_cutout(150)
        im.paste(lg, (24, 26), lg)
        tracked(d, (24, H - 34), 'PARKWAY GARDENS · CHICAGO', sans(11), WHITE)
    elif extra and extra.startswith('credit:'):
        tracked(d, (24, H - (50 if lbox else 34)), extra[7:], sans(11), WHITE)
    elif extra and extra.startswith('sub:'):
        text = extra[4:]
        f = sans(14, 'Medium')
        cx = (24 + TEXT_RIGHT) / 2 if subj not in ('none', 'end') else W / 2
        d.text((cx, H - 40), text, font=f, fill=WHITE, anchor='mm')
    return im


def legend(sheet, x, y):
    d = ImageDraw.Draw(sheet)
    d.text((x, y + 30), 'HEADLINE', font=ImageFont.truetype(SLAB, 30), fill=(20, 20, 20), anchor='ls')
    d.text((x + 200, y + 30), 'KEY WORD', font=ImageFont.truetype(BRUSH, 30), fill=RED, anchor='ls')
    tracked(d, (x + 380, y + 10), 'CREDIT LINE', sans(16), (20, 20, 20))
    d.text((x + 560, y + 26), 'Rye  ·  Knewave (stand-in for dry brush)  ·  Montserrat SemiBold +250  ·  red #E0262B  ·  text stays in the left 52%',
           font=sans(16, 'Medium'), fill=(80, 80, 80), anchor='ls')


cols = 4
rows = (len(FRAMES) + cols - 1) // cols
pad, cap, head = 14, 40, 110
sheet = Image.new('RGB', (cols * (W + pad) + pad, head + rows * (H + cap + pad) + pad), (245, 242, 235))
ds = ImageDraw.Draw(sheet)
ds.text((pad, 14), 'PRINCE DRE VSL  ·  STORYBOARD WIREFRAMES  ·  composition + type, nothing generated',
        font=sans(24, 'Bold'), fill=(20, 20, 20))
legend(sheet, pad, 54)
for i, spec in enumerate(FRAMES):
    c, r = i % cols, i // cols
    x, y = pad + c * (W + pad), head + pad + r * (H + cap + pad)
    sheet.paste(frame(spec), (x, y))
    ds.text((x, y + H + 6), f'{i + 1:>2}  [{spec[0]}]  "{spec[4]}"', font=sans(17, 'Medium'), fill=(20, 20, 20))
sheet.save(OUT, optimize=True)
print(OUT, sheet.size)
