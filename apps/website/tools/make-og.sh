#!/usr/bin/env bash
#
# Renders public/og.png and public/apple-touch-icon.png.
#
# Both come from files already in the repository: the sharing image from
# tools/og.html, and the icon from the wordmark itself. Run this after either of
# those changes, or after the launch date moves, and commit what it writes.
#
#   apps/website/tools/make-og.sh
#
# It needs a headless Chromium, which Playwright keeps under
# ~/Library/Caches/ms-playwright, and ImageMagick with pngquant, both from
# Homebrew.

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
public="$here/../public"
module="$here/../src/site.ts"

# Read straight out of the source, with Node stripping the types as it loads it.
# The build used to be the way in, and Astro's bundles the module into chunks
# with no stable name, so there is nothing there to point at any more. Reading
# the source also means there is no build to forget to run first.
if [ ! -f "$module" ]; then
  echo "Cannot find $module. Has it moved?" >&2
  exit 1
fi
read_facts() { node --experimental-strip-types --input-type=module -e "$1" 2>/dev/null; }

# The size and the two lines of text come from the page's own module rather
# than being stated again here. The size is published in og:image:width and
# og:image:height, and a preview is often laid out from those two numbers
# before the picture arrives, so a file of another shape lands in a hole of the
# wrong one. The date is worse than that: a wrong one in a picture is read as
# fact and corrected nowhere.
size="$(read_facts "
  import { SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT } from '$module';
  process.stdout.write(SHARE_IMAGE_WIDTH + ' ' + SHARE_IMAGE_HEIGHT);
")"
width="${size% *}"
height="${size#* }"

# Handed to the page as a query string, which is what keeps a line carrying
# spaces, commas or quotation marks intact on its way through the shell.
query="$(read_facts "
  import { COPY } from '$module';
  process.stdout.write(new URLSearchParams({ lead: COPY.lead, date: COPY.date }).toString());
")"

shell="$(find "$HOME/Library/Caches/ms-playwright" -name chrome-headless-shell -type f 2>/dev/null | sort | tail -1)"
if [ -z "$shell" ]; then
  echo "No headless Chromium found. Install one with: npx playwright install chromium" >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# The fonts and the wordmark are fetched from beside the page, which a file://
# document may not do without being told.
"$shell" \
  --headless \
  --disable-gpu \
  --hide-scrollbars \
  --allow-file-access-from-files \
  --force-device-scale-factor=2 \
  --window-size="$width,$height" \
  --virtual-time-budget=4000 \
  --screenshot="$work/og-2x.png" \
  "file://$here/og.html?$query" >/dev/null 2>&1

# Rendered at twice the published size and brought down to it. The card's border
# and the wordmark are hairlines, and the downscale is what keeps them off the
# pixel grid rather than blinking on and off along their length.
magick "$work/og-2x.png" -resize "${width}x${height}!" -strip "$work/og.png"
pngquant --quality 70-92 --speed 1 --force --output "$public/og.png" "$work/og.png"

# The icon is the mark on the page colour, squared. The file carries empty
# margin, so it is trimmed before it is centred, or the mark sits small in the
# middle of its own whitespace.
rsvg-convert -w 600 "$public/logo.svg" -o "$work/mark.png"
magick "$work/mark.png" \
  -trim +repage \
  -resize '296x296>' \
  -background '#14171b' \
  -gravity center \
  -extent 360x360 \
  -resize '180x180' \
  -strip "$work/icon.png"
pngquant --quality 70-95 --speed 1 --force --output "$public/apple-touch-icon.png" "$work/icon.png"

printf 'og.png            %s\n' "$(magick identify -format '%wx%h %b' "$public/og.png")"
printf 'apple-touch-icon  %s\n' "$(magick identify -format '%wx%h %b' "$public/apple-touch-icon.png")"
