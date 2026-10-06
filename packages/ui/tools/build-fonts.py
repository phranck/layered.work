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

# The text a page sets is split in two files per face, which together cover
# Basic Latin, Latin-1, Latin Extended-A, the combining marks, General
# Punctuation, the euro and trademark signs, Arrows and Mathematical Operators.
# A browser fetches a face only for characters a page contains, so the second
# file loads only on a page that writes one of its characters. The ranges do not
# overlap, because a character in both would fetch both.
CORE_UNICODES = (
    "U+0000-00FF, U+0131, U+0152-0153, U+0304, U+0308, U+0329, "
    "U+2000-206F, U+20AC, U+2122, U+2190-2193, U+2212, U+2215"
)
EXTENDED_UNICODES = (
    "U+0100-0130, U+0132-0151, U+0154-017F, U+0300-0303, U+0305-0307, "
    "U+0309-0328, U+032A-036F, U+2194-21FF, U+2200-2211, U+2213-2214, "
    "U+2216-22FF"
)
PUA_UNICODES = "U+E000-F8FF, U+F0000-FFFFD, U+100000-10FFFD"

# Every layout feature Barlow has except its small capitals (`smcp`, `c2sc` and
# the `aalt` that reaches them), which no stylesheet asks for. Named rather than
# subtracted, because pyftsubset cannot take a feature away from `*`. Fira Code
# keeps every feature, because its ligatures are what a code block is set with.
BARLOW_FEATURES = "ccmp,dnom,frac,kern,liga,locl,mark,mkmk,numr,ordn,pnum,sups,tnum"


@dataclass(frozen=True)
class FontSource:
    family: str
    weight: int
    source_url: str
    text_output: str
    symbols_output: str | None = None
    layout_features: str = "*"

    @property
    def extended_output(self) -> str:
        """The file holding the characters outside the core range."""
        return self.text_output.replace(".woff2", "-extended.woff2")


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
                    layout_features=BARLOW_FEATURES,
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


def subset(
    pyftsubset: str,
    source: Path,
    output: Path,
    unicodes: str,
    layout_features: str = "*",
) -> None:
    subprocess.run(
        [
            pyftsubset,
            str(source),
            f"--output-file={output}",
            "--flavor=woff2",
            f"--unicodes={unicodes}",
            f"--layout-features={layout_features}",
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

Icon sources and licenses are recorded separately in [ICON_NOTICES.md](ICON_NOTICES.md).

The webfonts in this directory are generated subsets. Do not edit the WOFF2 files directly. From the repository root, run:

```sh
uv tool install 'fonttools[woff]=={FONTTOOLS_VERSION}'
brew install harfbuzz
python3 packages/ui/tools/build-fonts.py
```

## Sources and versions

- [Barlow](https://github.com/google/fonts/tree/{GOOGLE_FONTS_REVISION}/ofl/barlow) and [Barlow Condensed](https://github.com/google/fonts/tree/{GOOGLE_FONTS_REVISION}/ofl/barlowcondensed) come from `google/fonts` revision `{GOOGLE_FONTS_REVISION}`, licensed under the SIL Open Font License 1.1. The pinned source directories contain the exact TTF files and their respective `OFL.txt` license files.
- [Fira Code Nerd Font](https://github.com/ryanoasis/nerd-fonts/tree/{NERD_FONTS_REVISION}/patched-fonts/FiraCode) comes from `ryanoasis/nerd-fonts` tag `{NERD_FONTS_REVISION}`. It is based on Fira Code, patched by Nerd Fonts, and licensed under the SIL Open Font License 1.1. See the pinned [font license](https://github.com/ryanoasis/nerd-fonts/blob/{NERD_FONTS_REVISION}/patched-fonts/FiraCode/LICENSE) and the [Nerd Fonts root license](https://github.com/ryanoasis/nerd-fonts/blob/{NERD_FONTS_REVISION}/LICENSE).
- Nerd Fonts tooling and repository notices are covered by the upstream root license, which includes MIT and OFL terms and Ryan L. McIntyre's notice.

The complete upstream license texts are retained in `font-licenses/`.

## Subsetting

Each face is split into two files. The first holds Basic Latin, Latin-1 Supplement, dotless i, the ligatures Œ and œ, General Punctuation, the euro and trademark signs, four arrows, the minus sign and the division slash. The second holds the rest of Latin Extended-A, Combining Diacritical Marks, Arrows and Mathematical Operators, and a browser fetches it only for a page that writes one of those characters. The two `unicode-range` descriptors do not overlap.

Barlow and Barlow Condensed leave out their small capitals, which no stylesheet sets. Fira Code keeps every layout feature, so its ligatures continue to shape.

The private-use glyphs of Fira Code Nerd Font are split into separate files covering the BMP, supplementary and plane 16 private-use ranges, and a browser fetches each only for a page that writes one of its characters. The text and symbol `unicode-range` descriptors do not overlap.

Generated with fontTools/pyftsubset {FONTTOOLS_VERSION}. HarfBuzz 14.4.0 was used to verify shaping after converting the generated WOFF2 files back to temporary TTF files.
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
        for output in (source.text_output, source.extended_output, source.symbols_output)
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
            for output, unicodes in (
                (source.text_output, CORE_UNICODES),
                (source.extended_output, EXTENDED_UNICODES),
            ):
                subset(
                    pyftsubset,
                    source_path,
                    fonts_dir / output,
                    unicodes,
                    source.layout_features,
                )
                faces.append(font_face(source, output, unicodes))

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

    stylesheet = assets_dir / "fonts.css"
    stylesheet.write_text("\n\n".join(faces) + "\n")
    # The repository's formatter decides how a long `unicode-range` wraps, so the
    # sheet passes `pnpm lint` without this script knowing that rule.
    subprocess.run(["pnpm", "exec", "biome", "format", "--write", str(stylesheet)], check=True)
    (assets_dir / "THIRD_PARTY_NOTICES.md").write_text(notices())

    print(f"Generated {len(expected_fonts)} WOFF2 files in {fonts_dir}")


if __name__ == "__main__":
    main()
