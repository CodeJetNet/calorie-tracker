#!/usr/bin/env python3
"""scripts/make-icons.py: cut every icon the app ships from the brand lockup. Needs Pillow and numpy.

    python3 scripts/make-icons.py        # reads docs/design/brand/lockup.png, writes assets/ and docs/design/brand/

Sizes and safe zones are explained in docs/design/design-system.md under "App icon".
"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BRAND, ASSETS = ROOT / 'docs/design/brand', ROOT / 'assets'
MIST, WHITE = (0xF3, 0xF7, 0xF6), (255, 255, 255)

lockup = Image.open(BRAND / 'lockup.png').convert('RGBA')
px = np.array(lockup)
px[px[..., 3] < 8] = 0                       # the export carries alpha-1 noise across the background
solid = px[..., 3] > 0
rows = np.where(solid.any(axis=1))[0]
gap = next(i for i, (a, b) in enumerate(zip(rows, rows[1:])) if b - a > 15)   # the blank band between mark and wordmark
top, bottom = rows[0], rows[gap]
cols = np.where(solid[top:bottom + 1].any(axis=0))[0]
mark = Image.fromarray(px).crop((cols[0], top, cols[-1] + 1, bottom + 1))


def placed(size: int, frac: float, img: Image.Image = mark) -> Image.Image:
    """`img` centred on a transparent square canvas, its longer side `frac` of the canvas."""
    w = round(size * frac)
    m = img.resize((w, round(w * img.height / img.width)) if img.width >= img.height else (round(w * img.width / img.height), w), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    return out


def tile(size: int) -> Image.Image:
    """White at the top easing to Soft Mist: the icon tile on the brand sheet."""
    t = np.linspace(0, 1, size)[:, None, None]
    grad = (np.array(WHITE) * (1 - t) + np.array(MIST) * t).astype(np.uint8)
    return Image.fromarray(np.broadcast_to(grad, (size, size, 3)).copy(), 'RGB')


def on_tile(size: int, frac: float) -> Image.Image:
    out = tile(size).convert('RGBA')
    out.alpha_composite(placed(size, frac))
    return out.convert('RGB')


silhouette = np.array(mark)
silhouette[..., :3] = 255                    # Android tints the monochrome layer; only alpha matters

mark.resize((384, round(384 * mark.height / mark.width)), Image.LANCZOS).save(ASSETS / 'logo.png')   # in-app mark
on_tile(1024, 0.68).save(ASSETS / 'icon.png')                                   # iOS and the default: opaque, the OS rounds it
placed(1024, 0.48).save(ASSETS / 'android-icon-foreground.png')                 # 0.48 of 108dp sits inside the 66dp safe circle
tile(1024).save(ASSETS / 'android-icon-background.png')
placed(1024, 0.48, Image.fromarray(silhouette)).save(ASSETS / 'android-icon-monochrome.png')
placed(1024, 0.62).save(ASSETS / 'splash-icon.png')                             # Android 12+ masks the splash image to a circle
on_tile(1024, 0.68).resize((48, 48), Image.LANCZOS).save(ASSETS / 'favicon.png')
on_tile(1024, 0.68).resize((512, 512), Image.LANCZOS).save(BRAND / 'play-icon-512.png')   # Play Console listing upload
print('mark', mark.size, '-> assets/ and docs/design/brand/')
