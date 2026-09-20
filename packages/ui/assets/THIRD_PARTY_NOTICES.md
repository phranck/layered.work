# Third-party font notices

The webfonts in this directory are generated subsets. Do not edit the WOFF2
files directly. From the repository root, run:

```sh
uv tool install 'fonttools[woff]==4.62.1'
brew install harfbuzz
python3 packages/ui/tools/build-fonts.py
```

## Sources and versions

- [Barlow](https://github.com/google/fonts/tree/f2bd09badbc763d8757951d52deec29da27e85fb/ofl/barlow)
  and [Barlow Condensed](https://github.com/google/fonts/tree/f2bd09badbc763d8757951d52deec29da27e85fb/ofl/barlowcondensed):
  `google/fonts` revision `f2bd09badbc763d8757951d52deec29da27e85fb`, licensed under the SIL
  Open Font License 1.1. The pinned source directories contain the exact TTF
  files and their respective `OFL.txt` license files.
- [Fira Code Nerd Font](https://github.com/ryanoasis/nerd-fonts/tree/v3.5.1/patched-fonts/FiraCode):
  `ryanoasis/nerd-fonts` tag `v3.5.1`, based on Fira Code and
  patched by Nerd Fonts, licensed under the SIL Open Font License 1.1. See the
  pinned [font license](https://github.com/ryanoasis/nerd-fonts/blob/v3.5.1/patched-fonts/FiraCode/LICENSE)
  and [Nerd Fonts root license](https://github.com/ryanoasis/nerd-fonts/blob/v3.5.1/LICENSE).
- Nerd Fonts tooling and repository notices are covered by the upstream root
  license, which includes MIT and OFL terms and Ryan L. McIntyre's notice.

The complete upstream license texts are retained in `font-licenses/`.

## Subsetting

Text subsets contain Basic Latin, Latin-1 Supplement, Latin Extended-A,
Combining Diacritical Marks, General Punctuation, the euro and trademark
characters, Arrows, and Mathematical Operators. OpenType layout tables and all
layout features are retained so Fira Code ligatures continue to shape.

Fira Code Nerd Font private-use glyphs are split into separate, lazily loaded
files covering the BMP, supplementary, and plane 16 private-use ranges. The
text and symbol `unicode-range` descriptors do not overlap.

Generated with fontTools/pyftsubset 4.62.1. HarfBuzz 14.4.0 was
used to verify shaping after converting the generated WOFF2 files back to
temporary TTF files.
