"""Builds the digits-only font that tightens Onest's figures.

Onest spaces its digits wider than its letters; numbers read loose. This
takes Onest's latin file (variable, wght 100-900), keeps only 0-9 with
their proportional and tabular forms, and narrows every digit by
TIGHTEN units, half from each side, so shapes and weights stay Onest's.
index.css loads the result for U+0030-0039 only, ahead of Onest, so
letters and every other character still come from Onest itself.

Onest is under the SIL Open Font License 1.1 (no Reserved Font Name);
the modified font carries its own name and ships with OFL.txt.

    python3 -m venv /tmp/fontenv && /tmp/fontenv/bin/pip install fonttools brotli
    /tmp/fontenv/bin/python scripts/build_figures_font.py
"""

import io
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

# The latin subset Google Fonts serves for Onest (v11).
SOURCE = 'https://fonts.gstatic.com/s/onest/v11/gNMKW3F-SZuj7xmf-HYoEoey.woff2'
OUT = Path(__file__).resolve().parent.parent / 'src' / 'assets' / 'fonts' / 'true-portfolio-figures.woff2'
FAMILY = 'True Portfolio Figures'
# In font units (1000 per em): each digit loses this much width.
TIGHTEN = 40
# Onest's tabular 1 is a bare stem centered in a full digit cell, so it
# reads as a gap on both sides. Give it the side bearings of its
# neighbors instead (left, right): a 1 in a table column is then ~0.24em
# narrower than other digits, a small shift traded for even spacing.
TABULAR_ONE_BEARINGS = (90, 100)


def main() -> None:
    font = TTFont(io.BytesIO(urllib.request.urlopen(SOURCE).read()))

    options = subset.Options()
    options.layout_features = ['tnum', 'pnum', 'kern']
    options.name_IDs = ['*']
    options.flavor = 'woff2'
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=range(0x30, 0x3A))
    subsetter.subset(font)

    cmap = font.getBestCmap()
    bases = {cmap[c] for c in range(0x30, 0x3A)}
    digits = {g for g in font.getGlyphOrder() if g.split('.')[0] in bases}
    glyf, hmtx = font['glyf'], font['hmtx']
    half = TIGHTEN // 2
    shift = {g: -half for g in digits}

    for name in digits:
        glyph = glyf[name]
        if glyph.isComposite():
            # A component that is itself a digit has moved already.
            for component in glyph.components:
                component.x += shift[name] - shift.get(component.glyphName, 0)
        elif glyph.numberOfContours > 0:
            glyph.coordinates.translate((shift[name], 0))
        glyph.recalcBounds(glyf)
        advance, _ = hmtx[name]
        hmtx[name] = (advance - TIGHTEN, getattr(glyph, 'xMin', 0))

    tabular_one = f'{cmap[0x31]}.tf'
    if tabular_one in digits:
        glyph = glyf[tabular_one]
        left, right = TABULAR_ONE_BEARINGS
        glyph.coordinates.translate((left - glyph.xMin, 0))
        glyph.recalcBounds(glyf)
        hmtx[tabular_one] = (glyph.xMax + right, glyph.xMin)

    names = font['name']
    for record in list(names.names):
        if record.nameID in (1, 16):
            names.setName(FAMILY, record.nameID, record.platformID, record.platEncID, record.langID)
        elif record.nameID in (3, 4):
            names.setName(f'{FAMILY} Regular', record.nameID, record.platformID, record.platEncID, record.langID)
        elif record.nameID in (6, 25):
            names.setName(FAMILY.replace(' ', ''), record.nameID, record.platformID, record.platEncID, record.langID)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    font.flavor = 'woff2'
    font.save(OUT)
    print(f'{OUT} ({OUT.stat().st_size} bytes, {len(digits)} digit glyphs)')


if __name__ == '__main__':
    main()
