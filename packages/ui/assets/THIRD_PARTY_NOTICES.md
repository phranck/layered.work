# Third-party font notices

Icon sources and licenses are recorded separately in [ICON_NOTICES.md](ICON_NOTICES.md).

The webfonts in this directory are generated subsets. Do not edit the WOFF2 files directly. From the repository root, run:

```sh
uv tool install 'fonttools[woff]==4.62.1'
brew install harfbuzz
python3 packages/ui/tools/build-fonts.py
```

## Sources and versions

- [Barlow](https://github.com/google/fonts/tree/f2bd09badbc763d8757951d52deec29da27e85fb/ofl/barlow) and [Barlow Condensed](https://github.com/google/fonts/tree/f2bd09badbc763d8757951d52deec29da27e85fb/ofl/barlowcondensed) come from `google/fonts` revision `f2bd09badbc763d8757951d52deec29da27e85fb`, licensed under the SIL Open Font License 1.1. The pinned source directories contain the exact TTF files and their respective `OFL.txt` license files.
- [Fira Code Nerd Font](https://github.com/ryanoasis/nerd-fonts/tree/v3.5.1/patched-fonts/FiraCode) comes from `ryanoasis/nerd-fonts` tag `v3.5.1`. It is based on Fira Code, patched by Nerd Fonts, and licensed under the SIL Open Font License 1.1. See the pinned [font license](https://github.com/ryanoasis/nerd-fonts/blob/v3.5.1/patched-fonts/FiraCode/LICENSE) and the [Nerd Fonts root license](https://github.com/ryanoasis/nerd-fonts/blob/v3.5.1/LICENSE).
- Nerd Fonts tooling and repository notices are covered by the upstream root license, which includes MIT and OFL terms and Ryan L. McIntyre's notice.

The complete upstream license texts are retained in `font-licenses/`.

## Subsetting

Each face is split into two files. The first holds Basic Latin, Latin-1 Supplement, dotless i, the ligatures Œ and œ, General Punctuation, the euro and trademark signs, four arrows, the minus sign and the division slash. The second holds the rest of Latin Extended-A, Combining Diacritical Marks, Arrows and Mathematical Operators, and a browser fetches it only for a page that writes one of those characters. The two `unicode-range` descriptors do not overlap.

Barlow and Barlow Condensed leave out their small capitals, which no stylesheet sets. Fira Code keeps every layout feature, so its ligatures continue to shape.

The private-use glyphs of Fira Code Nerd Font are split into separate files covering the BMP, supplementary and plane 16 private-use ranges, and a browser fetches each only for a page that writes one of its characters. The text and symbol `unicode-range` descriptors do not overlap.

Generated with fontTools/pyftsubset 4.62.1. HarfBuzz 14.4.0 was used to verify shaping after converting the generated WOFF2 files back to temporary TTF files.
