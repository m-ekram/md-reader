"""
Builds the app's icons from the logo.

    wsl -d Ubuntu-24.04 -- python3 scripts/make-icons.py [--sheet out.png]

Reads resources/logo.png (the full logo: a book mark above the "ekram.md"
wordmark, on an off-white ground) and writes:

    resources/icon.ico                     16-256 px, embedded in the exe, used
                                           for the installer, shortcuts and
                                           .md file associations
    resources/icon.png                     512 px, the window and About icon
    src/renderer/src/assets/logo-mark.png  64 px, the title bar mark

Only the mark is used: the wordmark cannot be read at icon sizes. Only the
ground *outside* the mark is made transparent. The page inside the book is the
same off-white as the ground, and removing it too left a hole that, on a dark
taskbar (Windows' default), showed little but the orange strokes. The page's
outline is not closed, so small gaps are sealed before the outside is filled.
Colours are kept exactly as drawn; the resize to each size smooths the edges.

Needs Pillow (in WSL: apt install python3-pil). --sheet also writes a contact
sheet of the small sizes on dark and light grounds, for judging them by eye.
"""
import os
import sys
from collections import deque

from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "resources", "logo.png")
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

# A pixel this close to the ground in every channel is ground: the source is a
# generated image and its paper is not perfectly flat.
NOISE = 8
# Space around the mark, as a share of its larger side.
MARGIN = 0.06
# How far a pixel must be from the ground to count as part of a stroke.
EDGE = 40
# The page's outline has an opening where it meets the fold. Strokes are
# thickened by this much (px, at the source's scale) while finding what is
# outside, so the fill cannot leak onto the page: measured, 13 px leaks and
# 17 px seals it.
CLOSE = 17
# The ground kept around the mark while working, so the fill starts in it.
PAD = 24


def ground_colour(img):
    """The paper colour, averaged from the four corners."""
    w, h = img.size
    px = img.load()
    corners = [px[2, 2], px[w - 3, 2], px[2, h - 3], px[w - 3, h - 3]]
    return tuple(sum(c[i] for c in corners) // 4 for i in range(3))


def is_ink(p, bg):
    return max(abs(p[i] - bg[i]) for i in range(3)) > NOISE


def mark_box(img, bg):
    """
    The bounding box of the mark: the first band of rows that holds any ink,
    which stops at the gap above the wordmark, then its columns.
    """
    w, h = img.size
    px = img.load()
    top = bottom = None
    for y in range(h):
        if any(is_ink(px[x, y], bg) for x in range(0, w, 2)):
            if top is None:
                top = y
            bottom = y
        elif top is not None:
            break  # the gap between the mark and the wordmark
    if top is None:
        sys.exit("no mark found in " + SOURCE)
    cols = [x for x in range(w) if any(is_ink(px[x, y], bg) for y in range(top, bottom + 1, 2))]
    return min(cols), top, max(cols), bottom


def cut_out(img, bg):
    """
    The mark with the ground outside it transparent, and everything inside it —
    the page included — opaque and in its own colours.

    Outside is what a fill from the border reaches through ground, with the
    strokes thickened by CLOSE so the fill cannot slip through the gap in the
    page's outline; the band the thickening took is then given back to the
    outside wherever it is ground.
    """
    w, h = img.size
    px = img.load()
    ink = Image.new("L", img.size)
    ip = ink.load()
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            ip[x, y] = 255 if max(abs(p[i] - bg[i]) for i in range(3)) > EDGE else 0

    closed = ink.filter(ImageFilter.MaxFilter(CLOSE)).load()
    reached = Image.new("L", img.size)
    rp = reached.load()
    queue = deque((x, y) for x in range(w) for y in (0, h - 1))
    queue.extend((x, y) for y in range(h) for x in (0, w - 1))
    while queue:
        x, y = queue.popleft()
        if rp[x, y] or closed[x, y]:
            continue
        rp[x, y] = 255
        for a, b in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= a < w and 0 <= b < h and not rp[a, b]:
                queue.append((a, b))
    near = reached.filter(ImageFilter.MaxFilter(CLOSE)).load()

    out = img.convert("RGBA")
    op = out.load()
    for y in range(h):
        for x in range(w):
            if near[x, y] and not ip[x, y]:
                op[x, y] = (0, 0, 0, 0)
    return out.crop(out.getbbox())


def square(mark):
    """The mark centred on a transparent square, with a margin."""
    w, h = mark.size
    side = round(max(w, h) * (1 + 2 * MARGIN))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(mark, ((side - w) // 2, (side - h) // 2))
    return canvas


def sized(img, size):
    return img.resize((size, size), Image.Resampling.LANCZOS)


def contact_sheet(icon, path):
    sizes = [16, 24, 32, 48, 64, 128]
    pad = 16
    width = sum(sizes) + pad * (len(sizes) + 1)
    height = (max(sizes) + pad * 2) * 2
    sheet = Image.new("RGB", (width, height), (255, 255, 255))
    for row, ground in enumerate([(36, 41, 46), (255, 255, 255)]):
        band = Image.new("RGB", (width, height // 2), ground)
        x = pad
        for s in sizes:
            small = sized(icon, s)
            y = (height // 2 - s) // 2
            band.paste(small, (x, y), small)
            x += s + pad
        sheet.paste(band, (0, row * height // 2))
    sheet.save(path)


def main():
    logo = Image.open(SOURCE).convert("RGB")
    bg = ground_colour(logo)
    box = mark_box(logo, bg)
    work = logo.crop(
        (
            max(0, box[0] - PAD),
            max(0, box[1] - PAD),
            min(logo.size[0], box[2] + 1 + PAD),
            min(logo.size[1], box[3] + 1 + PAD),
        )
    )
    mark = cut_out(work, bg)
    icon = square(mark)

    icon.save(
        os.path.join(ROOT, "resources", "icon.ico"),
        sizes=[(s, s) for s in ICO_SIZES],
    )
    sized(icon, 512).save(os.path.join(ROOT, "resources", "icon.png"))
    sized(icon, 64).save(os.path.join(ROOT, "src", "renderer", "src", "assets", "logo-mark.png"))
    print(f"ground {bg}, mark {box}, icon {icon.size[0]} px square")

    if "--sheet" in sys.argv:
        path = sys.argv[sys.argv.index("--sheet") + 1]
        contact_sheet(icon, path)
        print("contact sheet:", path)


if __name__ == "__main__":
    main()
