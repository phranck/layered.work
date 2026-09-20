#!/usr/bin/env python3
"""Build the self-hosted webfont assets from pinned upstream sources."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
import urllib.request
from dataclasses import dataclass
from pathlib import Path


GOOGLE_FONTS_REVISION = "f2bd09badbc763d8757951d52deec29da27e85fb"
NERD_FONTS_REVISION = "v3.5.1"
FONTTOOLS_VERSION = "4.62.1"
GOOGLE_FONTS_BASE = (
    f"https://raw.githubusercontent.com/google/fonts/{GOOGLE_FONTS_REVISION}"
)
NERD_FONTS_BASE = (
    f"https://raw.githubusercontent.com/ryanoasis/nerd-fonts/{NERD_FONTS_REVISION}"
)

TEXT_UNICODES = (
    "U+0000-017F, U+0300-036F, U+2000-206F, U+20AC, U+2122, "
    "U+2190-21FF, U+2200-22FF"
)
PUA_UNICODES = "U+E000-F8FF, U+F0000-FFFFD, U+100000-10FFFD"


@dataclass(frozen=True)
class FontSource:
    family: str
    weight: int
    source_url: str
    text_output: str
    symbols_output: str | None = None


WEIGHTS = {
    400: "Regular",
    500: "Medium",
    600: "SemiBold",
    700: "Bold",
    800: "ExtraBold",
}


def text_sources() -> list[FontSource]:
    sources: list[FontSource] = []
    for family, directory, source_stem, output_stem in (
        ("Barlow", "barlow", "Barlow", "barlow"),
        (
            "Barlow Condensed",
            "barlowcondensed",
            "BarlowCondensed",
            "barlow-condensed",
        ),
    ):
        for weight, style in WEIGHTS.items():
            sources.append(
                FontSource(
                    family=family,
                    weight=weight,
                    source_url=(
                        f"{GOOGLE_FONTS_BASE}/ofl/{directory}/"
                        f"{source_stem}-{style}.ttf"
                    ),
                    text_output=f"{output_stem}-{weight}.woff2",
                )
            )

    for weight, style in ((400, "Regular"), (700, "Bold")):
        sources.append(
            FontSource(
                family="FiraCode Nerd Font",
                weight=weight,
                source_url=(
                    f"{NERD_FONTS_BASE}/patched-fonts/FiraCode/"
                    f"FiraCodeNerdFont-{style}.ttf"
                ),
                text_output=f"firacode-nerd-{weight}.woff2",
                symbols_output=f"firacode-nerd-symbols-{weight}.woff2",
            )
        )
    return sources


LICENSES = {
    "Barlow-OFL-1.1.txt": f"{GOOGLE_FONTS_BASE}/ofl/barlow/OFL.txt",
    "BarlowCondensed-OFL-1.1.txt": (
        f"{GOOGLE_FONTS_BASE}/ofl/barlowcondensed/OFL.txt"
    ),
    "FiraCode-OFL-1.1.txt": (
        f"{NERD_FONTS_BASE}/patched-fonts/FiraCode/LICENSE"
    ),
    "NerdFonts-LICENSE.txt": f"{NERD_FONTS_BASE}/LICENSE",
}


def download(url: str, destination: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "layered-font-builder/1"})
    with urllib.request.urlopen(request) as response:
        if response.status != 200:
            raise RuntimeError(f"Download failed ({response.status}): {url}")
        destination.write_bytes(response.read())


def subset(pyftsubset: str, source: Path, output: Path, unicodes: str) -> None:
    subprocess.run(
        [
            pyftsubset,
            str(source),
            f"--output-file={output}",
            "--flavor=woff2",
            f"--unicodes={unicodes}",
            "--layout-features=*",
            "--glyph-names",
            "--symbol-cmap",
            "--legacy-cmap",
            "--notdef-glyph",
            "--notdef-outline",
            "--recommended-glyphs",
            "--name-IDs=*",
            "--name-legacy",
            "--name-languages=*",
        ],
        check=True,
    )


def font_face(source: FontSource, output_name: str, unicodes: str) -> str:
    return f'''@font-face {{
  font-family: "{source.family}";
  font-style: normal;
  font-weight: {source.weight};
  font-display: swap;
  src: url("./fonts/{output_name}") format("woff2");
  unicode-range: {unicodes};
}}'''


def notices() -> str:
    return f"""# Third-party font notices

The webfonts in this directory are generated subsets. Do not edit the WOFF2
files directly. From the repository root, run:

```sh
uv tool install 'fonttools[woff]=={FONTTOOLS_VERSION}'
brew install harfbuzz
python3 packages/ui/tools/build-fonts.py
```

## Sources and versions

- [Barlow](https://github.com/google/fonts/tree/{GOOGLE_FONTS_REVISION}/ofl/barlow)
  and [Barlow Condensed](https://github.com/google/fonts/tree/{GOOGLE_FONTS_REVISION}/ofl/barlowcondensed):
  `google/fonts` revision `{GOOGLE_FONTS_REVISION}`, licensed under the SIL
  Open Font License 1.1. The pinned source directories contain the exact TTF
  files and their respective `OFL.txt` license files.
- [Fira Code Nerd Font](https://github.com/ryanoasis/nerd-fonts/tree/{NERD_FONTS_REVISION}/patched-fonts/FiraCode):
  `ryanoasis/nerd-fonts` tag `{NERD_FONTS_REVISION}`, based on Fira Code and
  patched by Nerd Fonts, licensed under the SIL Open Font License 1.1. See the
  pinned [font license](https://github.com/ryanoasis/nerd-fonts/blob/{NERD_FONTS_REVISION}/patched-fonts/FiraCode/LICENSE)
  and [Nerd Fonts root license](https://github.com/ryanoasis/nerd-fonts/blob/{NERD_FONTS_REVISION}/LICENSE).
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

Generated with fontTools/pyftsubset {FONTTOOLS_VERSION}. HarfBuzz 14.4.0 was
used to verify shaping after converting the generated WOFF2 files back to
temporary TTF files.
"""


def main() -> None:
    script_path = Path(__file__).resolve()
    assets_dir = script_path.parent.parent / "assets"
    fonts_dir = assets_dir / "fonts"
    licenses_dir = assets_dir / "font-licenses"
    fonts_dir.mkdir(parents=True, exist_ok=True)
    licenses_dir.mkdir(parents=True, exist_ok=True)

    pyftsubset = shutil.which("pyftsubset")
    if pyftsubset is None:
        raise RuntimeError("pyftsubset is required but was not found on PATH")

    sources = text_sources()
    expected_fonts = {
        output
        for source in sources
        for output in (source.text_output, source.symbols_output)
        if output is not None
    }
    for existing in fonts_dir.glob("*.woff2"):
        if existing.name not in expected_fonts:
            existing.unlink()
    for existing in licenses_dir.iterdir():
        if existing.is_file() and existing.name not in LICENSES:
            existing.unlink()

    faces: list[str] = []
    with tempfile.TemporaryDirectory(prefix="layered-fonts-") as temporary:
        temporary_dir = Path(temporary)
        for index, source in enumerate(sources):
            source_path = temporary_dir / f"source-{index}.ttf"
            download(source.source_url, source_path)
            subset(
                pyftsubset,
                source_path,
                fonts_dir / source.text_output,
                TEXT_UNICODES,
            )
            faces.append(font_face(source, source.text_output, TEXT_UNICODES))

            if source.symbols_output:
                subset(
                    pyftsubset,
                    source_path,
                    fonts_dir / source.symbols_output,
                    PUA_UNICODES,
                )
                faces.append(font_face(source, source.symbols_output, PUA_UNICODES))

        for filename, url in LICENSES.items():
            source_license = temporary_dir / filename
            download(url, source_license)
            license_text = "\n".join(line.rstrip() for line in source_license.read_text().splitlines()) + "\n"
            (licenses_dir / filename).write_text(license_text)

    (assets_dir / "fonts.css").write_text("\n\n".join(faces) + "\n")
    (assets_dir / "THIRD_PARTY_NOTICES.md").write_text(notices())

    print(f"Generated {len(expected_fonts)} WOFF2 files in {fonts_dir}")


if __name__ == "__main__":
    main()
