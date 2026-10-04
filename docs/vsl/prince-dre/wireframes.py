# Storyboard wireframes for the Prince Dre VSL: composition, text placement and the type system
# from his own covers (STORYBOARD.md "Type"). Windows Python + Pillow:
#   python docs/vsl/prince-dre/wireframes.py
# Fonts are open-license Google Fonts, downloaded once into a temp folder (never committed):
# Rye (Tuscan slab headline), Knewave (stand-in for the red dry-brush key word), Montserrat
# (tracked credits and subtitles). Frame 5 cuts his real logo out of type-reference/.
import os
import tempfile
import urllib.request

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'storyboard-wireframes.png')
LOGO = os.path.join(HERE, 'type-reference', 'logo-prince-dre.jpg')
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


def sans(size, weight='SemiBold'):
    f = ImageFont.truetype(SANS_PATH, size)
    f.set_variation_by_name(weight)
    return f


W, H = 480, 270
TEXT_RIGHT = W * 0.52          # text never crosses 52% of the width (subject sits right)
BG, WHITE, RED = (13, 13, 13), (245, 245, 242), (224, 38, 43)   # #E0262B, 4.15:1 on #0D0D0D
ORANGE, GREY = (210, 120, 40), (70, 70, 66)

# (source, subject, letterbox, lines, label, extra)
# A line is [(text, face)], face 'slab' | 'brush' | 'chrome'. Brush is always the red key word.
FRAMES = [
    ('A/P1', 'right', False, [[('SOMETHING', 'slab')], [('ON MY PHONE', 'slab')]], 'I got something on my phone', 'phone'),
    ('P1+G', 'center', False, [[('[YEAR]', 'brush')], [("NOBODY'S EVER SEEN", 'slab')]], 'from [YEAR]...', 'redact'),
    ('A', 'right', False, [[('NOBODY.', 'brush')]], 'Not my people. Nobody.', None),
    ('A', 'right', False, [], 'Stay with me', 'sub'),
    ('P2', 'full', False, [], "I'm Prince Dre. O'Block.", 'logo'),
    ('R', 'cover43', False, [], 'since 2013', "credit:2013 · FRESH PRINCE OF O'BLOCK"),
    ('R', 'cover43', False, [], '(eras, ~1s each)', 'credit:2015 · BLOOD BROTHAZ'),
    ('R', 'comments', False, [[('WHERE CAN I HEAR', 'slab')], [('ALL', 'brush'), (' OF IT?', 'slab')]], 'Where can I hear all of it?', None),
    ('P3', 'full', False, [], 'Tapes scattered on old sites', 'sub'),
    ('R', 'screen', False, [[('8 PROJECTS', 'chrome')], [('94 SONGS', 'chrome')]], 'So I put it in one place', None),
    ('R', 'screen', False, [], 'That song you just got?', 'sub'),
    ('P4', 'full', True, [[('THE ', 'slab'), ('REAL', 'brush')], [('REASON', 'slab')]], "that ain't the real reason", None),
    ('R', 'archive', True, [], 'Songs that never came out', 'credit:2019 · UNRELEASED'),
    ('R', 'notes', False, [], 'The notes in my phone', None),
    ('A', 'right', False, [[('EVERY', 'slab')], [('MONTH', 'brush')]], 'Every month', None),
    ('G+P5', 'card1', False, [], 'Ten dollars a month', None),
    ('G+P5', 'card2', False, [], 'Twenty-five', None),
    ('G+P5', 'card3', False, [], 'Fifty', None),
    ('P1+G', 'center', False, [[('FIRST DROP · MEMBERS', 'slab')], [('THIS MONTH', 'brush')]], 'That thing from [YEAR]', 'redact'),
    ('G', 'none', False, [[('PICK YOUR LEVEL', 'slab')], [('BELOW', 'brush')]], 'Pick your level below', 'arrow'),
]
FACE = {'slab': SLAB, 'chrome': SLAB, 'brush': BRUSH}


def line_width(d, line, size):
    return sum(d.textlength(t, font=ImageFont.truetype(FACE[f], size)) for t, f in line)


def fit(d, line, max_w, start=64, floor=14):
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
        if t < 0.5:
            v = int(250 - 120 * (t / 0.5))      # bright top falling to the band
        else:
            v = int(95 + 150 * ((t - 0.5) / 0.5))  # dark band rising to a bright lip
        g.line([0, y, im.size[0], y], fill=(v, v, min(255, v + 12)))
    im.paste(grad, (0, 0), mask)


def tracked(d, xy, text, font, fill, track=0.25, anchor_center=False):
    # Montserrat with +250 tracking: Pillow has no letter-spacing, so set each glyph.
    size = font.size
    widths = [d.textlength(ch, font=font) + size * track for ch in text]
    x, y = xy
    if anchor_center:
        x -= (sum(widths) - size * track) / 2
    for ch, w in zip(text, widths):
        d.text((x, y), ch, font=font, fill=fill)
        x += w


def logo_cutout(target_w):
    # His real lockup (crown over the I, DRE in brush) lifted off the textured background.
    src = Image.open(LOGO).convert('L').crop((285, 290, 995, 1015))
    alpha = src.point(lambda v: 255 if v > 175 else (0 if v < 120 else int((v - 120) * 255 / 55)))
    logo = Image.new('RGBA', src.size, WHITE + (0,))
    logo.putalpha(alpha)
    h = int(src.size[1] * target_w / src.size[0])
    return logo.resize((target_w, h), Image.LANCZOS)


def frame(spec):
    src, subj, lbox, lines, label, extra = spec
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)
    if subj == 'right':
        d.rectangle([W * 0.62, H * 0.12, W * 0.92, H], fill=GREY)
        d.ellipse([W * 0.69, H * 0.0, W * 0.85, H * 0.32], fill=(95, 95, 90))
        d.rectangle([W * 0.92, H * 0.1, W * 0.94, H * 0.9], fill=ORANGE)
        if extra == 'phone':
            d.rounded_rectangle([W * 0.66, H * 0.45, W * 0.76, H * 0.8], 6, fill=(200, 215, 230))
    elif subj == 'full':
        for k in range(6):
            d.rectangle([W * (0.56 + k * 0.075), H * (0.15 + (k % 2) * 0.1), W * (0.62 + k * 0.075), H], fill=(60 + k * 6, 40, 30))
        d.rectangle([0, 0, W, H], outline=ORANGE, width=2)
    elif subj == 'center':
        d.rounded_rectangle([W * 0.56, H * 0.08, W * 0.86, H * 0.92], 10, fill=(30, 30, 34))
        d.rectangle([W * 0.6, H * 0.2, W * 0.82, H * 0.6], fill=(80, 80, 90))
        if extra == 'redact':
            d.rectangle([W * 0.58, H * 0.35, W * 0.84, H * 0.47], fill=(0, 0, 0))
    elif subj == 'cover43':
        d.rectangle([W * 0.125, 0, W * 0.875, H], fill=(25, 25, 22))
        d.rectangle([W * 0.3, H * 0.1, W * 0.7, H * 0.72], fill=(110, 70, 50))
    elif subj == 'comments':
        for k in range(4):
            x, y = 70 + k * 22, 20 + k * 52
            d.rounded_rectangle([x + 200, y, x + 420, y + 40], 6, fill=(245, 245, 245))
            d.rectangle([x + 206, y + 8, x + 230, y + 32], fill=(150, 150, 150))
    elif subj == 'screen':
        d.rectangle([W * 0.08, H * 0.08, W * 0.92, H * 0.92], fill=(26, 26, 26), outline=(212, 175, 55), width=2)
        for k in range(4):
            d.rectangle([W * (0.12 + k * 0.2), H * 0.58, W * (0.28 + k * 0.2), H * 0.86], fill=(90, 70, 50))
    elif subj == 'archive':
        d.rectangle([W * 0.2, H * 0.15, W * 0.8, H * 0.78], fill=(70, 60, 55))
        d.rectangle([W * 0.2 + 3, H * 0.15, W * 0.8 + 3, H * 0.78], outline=RED, width=1)
    elif subj == 'notes':
        d.rounded_rectangle([W * 0.3, H * 0.04, W * 0.7, H * 1.0], 10, fill=(250, 245, 225))
        for k in range(7):
            d.line([W * 0.34, H * (0.15 + k * 0.1), W * (0.6 - (k % 3) * 0.05), H * (0.15 + k * 0.1)], fill=(60, 60, 60), width=3)
    elif subj.startswith('card'):
        n = int(subj[-1])
        for k in range(n):
            x = 30 + k * 145
            d.rounded_rectangle([x, 50, x + 130, 235], 8, fill=(34, 32, 30), outline=RED if k == n - 1 else GREY, width=2)
            d.rectangle([x + 15, 62, x + 115, 140], fill=(110, 70, 50))
            d.text((x + 15, 180), ['$10', '$25', '$50'][k], font=ImageFont.truetype(SLAB, 30), fill=WHITE, anchor='ls')
            tracked(d, (x + 15, 192), ['BLOOD BROTHAZ', 'NEW EACH MONTH', 'EVERYTHING'][k], sans(8), WHITE, 0.2)
            if k == 2:
                d.text((x + 15, 225), 'TODAY', font=ImageFont.truetype(BRUSH, 20), fill=RED, anchor='ls')
    if lbox:
        d.rectangle([0, 0, W, 24], fill=(0, 0, 0))
        d.rectangle([0, H - 24, W, H], fill=(0, 0, 0))

    # Headline lines, left aligned in the left region, each fitted so it never crosses 52%.
    max_w = (W * 0.72 if subj == 'none' else TEXT_RIGHT) - 24
    y = 38 if subj != 'none' else 70
    if lbox:
        y = 34
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
            x += d.textlength(text, font=f)
        y += int(size * 0.2)

    if extra == 'logo':
        lg = logo_cutout(150)
        im.paste(lg, (24, 26), lg)
        tracked(d, (24, H - 34), 'PARKWAY GARDENS · CHICAGO', sans(11), WHITE)
    if extra and extra.startswith('credit:'):
        tracked(d, (24, H - 34), extra[7:], sans(11), WHITE)
    if extra == 'sub':
        tracked(d, (W // 2, H - 40), '(subtitle only)', sans(14, 'Medium'), WHITE, track=0.0, anchor_center=True)
    if extra == 'arrow':
        d.polygon([(W * 0.82, H * 0.55), (W * 0.92, H * 0.55), (W * 0.87, H * 0.75)], fill=RED)
    return im


def legend(sheet, x, y):
    d = ImageDraw.Draw(sheet)
    d.text((x, y + 30), 'HEADLINE', font=ImageFont.truetype(SLAB, 30), fill=(20, 20, 20), anchor='ls')
    d.text((x + 200, y + 30), 'KEY WORD', font=ImageFont.truetype(BRUSH, 30), fill=RED, anchor='ls')
    tracked(d, (x + 380, y + 10), 'CREDIT LINE', sans(16), (20, 20, 20))
    d.text((x + 560, y + 26), 'Rye  ·  Knewave (stand-in for dry brush)  ·  Montserrat SemiBold +250  ·  red #E0262B',
           font=sans(16, 'Medium'), fill=(80, 80, 80), anchor='ls')


cols, rows = 4, 5
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
