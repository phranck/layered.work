#!/usr/bin/env python3
"""Reads the Publii site database and writes the real content into content.js.

The prototypes must show phranck's actual posts rather than placeholder text, so
this is the single place the content comes from. Running it again after a change
in Publii refreshes all three proposals at once.
"""

import html
import json
import os
import re
import shutil
import sqlite3
import subprocess

PUBLII_SITE = "/Users/phranck/Documents/Publii/sites/layeredwork/input"
HERE = os.path.dirname(os.path.abspath(__file__))
PROPOSALS = os.path.dirname(HERE)
IMAGE_TARGET = os.path.join(PROPOSALS, "assets", "img")

# Prototype images only ever fill a card or a hero, so the longest edge never
# needs more than this. It keeps the whole image folder under four megabytes.
MAX_IMAGE_EDGE = 1600
JPEG_QUALITY = 72

# Publii stores these flags in one comma separated column.
STATUS_FLAGS = ("published", "draft", "hidden", "featured", "excluded_homepage", "trashed", "is-page")

# The two German posts are hidden duplicates of an English original. Publii could
# not express a translation pair, so the relation is reconstructed here.
TRANSLATION_PAIRS = {29: 30, 23: 24}


def strip_markup(raw):
    """Turns a Publii post body into plain text for the excerpt."""
    without_blocks = re.sub(r"<[^>]+>", " ", raw or "")
    unescaped = html.unescape(without_blocks)
    return re.sub(r"\s+", " ", unescaped).strip()


def excerpt_of(raw, length=190):
    """The opening of a post, shortened to a card's worth of text.

    Reads through the block parser rather than over the stored string, because a
    body stored as JSON blocks would otherwise put its own markup on the page.
    """
    paragraphs = paragraphs_of(raw, limit=1)
    if not paragraphs:
        # An empty draft has nothing to quote. Falling back to the stored string
        # would print the editor's own JSON onto the page.
        return ""
    text = paragraphs[0]
    if len(text) <= length:
        return text
    return text[:length].rsplit(" ", 1)[0] + "…"


def language_of(title, text):
    """Publii has no language column, so the language is read off the content.

    Only two posts are German, and both carry unambiguous words in their body.
    """
    german_markers = (" der ", " die ", " das ", " und ", " ich ", " nicht ", " auf einem ")
    sample = " " + strip_markup(text)[:2000].lower() + " "
    hits = sum(1 for marker in german_markers if marker in sample)
    return "de" if hits >= 3 else "en"


def blocks_of(raw):
    """Splits a Publii body into candidate blocks, whichever way it is stored.

    Publii keeps newer posts as a JSON array of editor blocks and older ones as
    plain Markdown, and a body can also be raw HTML. All three shapes reach this
    function, so the caller never has to know which one a given post uses.

    @return A list of (kind, text) pairs, where kind is the block type for JSON
            bodies and "text" otherwise.
    """
    body = (raw or "").strip()
    if body.startswith("[{"):
        try:
            return [(block.get("type", ""), block.get("content", "")) for block in json.loads(body)]
        except (json.JSONDecodeError, AttributeError):
            pass
    if "<p" in body:
        return [("publii-paragraph", chunk) for chunk in re.findall(r"<p[^>]*>(.*?)</p>", body, flags=re.DOTALL)]
    return [("text", chunk) for chunk in re.split(r"\n\s*\n", body)]


# A block that is a diagram, a table, a fence or a front matter header is not
# prose, and reading one as a paragraph puts source code on the page.
NON_PROSE_PREFIXES = ("|", "#", "```", "!", "<", "---", "flowchart", "graph ", "sequenceDiagram")


def paragraphs_of(raw, limit=7):
    """The real paragraphs of a post, for prototypes that must show real prose.

    Line length, rhythm and where a paragraph breaks are half of what is being
    judged, and filler text hides all three.
    """
    texts = []
    for kind, content in blocks_of(raw):
        if kind not in ("text", "publii-paragraph"):
            continue
        # A Markdown link is reduced to its text, because the prototypes render
        # prose rather than Markdown and the raw syntax would show on the page.
        text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", content)
        text = re.sub(r"[*_`]", "", strip_markup(text)).strip()
        if len(text) < 70 or text.startswith(NON_PROSE_PREFIXES):
            continue
        texts.append(text)
        if len(texts) == limit:
            break
    return texts


def headings_of(raw, limit=4):
    """The post's own section headings, so the prototype's structure is real."""
    found = []
    for kind, content in blocks_of(raw):
        if kind == "publii-header":
            found.append(strip_markup(content))
        elif kind == "text":
            found.extend(re.findall(r"^#{2,3}\s+(.+)$", content, flags=re.MULTILINE))
    cleaned = [re.sub(r"[*_`#]", "", strip_markup(item)).strip() for item in found]
    return [item for item in cleaned if item][:limit]


def read_time_of(raw):
    words = len(strip_markup(raw).split())
    return max(1, round(words / 200))


def copy_image(filename, post_id):
    """Copies a featured image across, downscaled to prototype size.

    Several originals run past eight megabytes, which is enough to make a scroll
    animation stutter and so hide the very thing the prototype exists to show.
    Everything lands as .jpg, so no markup has to care about the source format.
    """
    if not filename:
        return None
    source = os.path.join(PUBLII_SITE, "media", "posts", str(post_id), filename)
    if not os.path.isfile(source):
        return None
    target_name = os.path.splitext(filename)[0] + ".jpg"
    target = os.path.join(IMAGE_TARGET, target_name)
    resized = subprocess.run(
        [
            "sips", "-Z", str(MAX_IMAGE_EDGE),
            "-s", "format", "jpeg",
            "-s", "formatOptions", str(JPEG_QUALITY),
            source, "--out", target,
        ],
        capture_output=True,
    )
    if resized.returncode != 0:
        shutil.copy2(source, target)
    return "../assets/img/" + target_name


def main():
    os.makedirs(IMAGE_TARGET, exist_ok=True)
    connection = sqlite3.connect(os.path.join(PUBLII_SITE, "db.sqlite"))
    connection.row_factory = sqlite3.Row

    tags_by_post = {}
    for row in connection.execute(
        "select pt.post_id, t.name, t.slug from posts_tags pt join tags t on t.id = pt.tag_id"
    ):
        tags_by_post.setdefault(row["post_id"], []).append({"name": row["name"], "slug": row["slug"]})

    images_by_post = {}
    for row in connection.execute("select post_id, url from posts_images where url != ''"):
        images_by_post.setdefault(row["post_id"], row["url"])

    entries = []
    for row in connection.execute(
        "select id, title, slug, text, status, created_at from posts order by created_at desc"
    ):
        flags = [flag for flag in STATUS_FLAGS if flag in (row["status"] or "")]
        if "trashed" in flags:
            continue
        entries.append(
            {
                "id": row["id"],
                "title": row["title"],
                "slug": row["slug"],
                "kind": "page" if "is-page" in flags else "post",
                "status": "draft" if "draft" in flags else "hidden" if "hidden" in flags else "public",
                "featured": "featured" in flags,
                "language": language_of(row["title"], row["text"]),
                "translationOf": TRANSLATION_PAIRS.get(row["id"]),
                "date": row["created_at"],
                "readTime": read_time_of(row["text"]),
                "excerpt": excerpt_of(row["text"]),
                "paragraphs": paragraphs_of(row["text"]),
                "headings": headings_of(row["text"]),
                "tags": tags_by_post.get(row["id"], []),
                "image": copy_image(images_by_post.get(row["id"]), row["id"]),
            }
        )

    all_tags = [dict(row) for row in connection.execute("select name, slug from tags order by name")]
    connection.close()

    payload = {"entries": entries, "tags": all_tags}
    target = os.path.join(HERE, "content.js")
    with open(target, "w", encoding="utf-8") as handle:
        handle.write("// Generated by extract.py from the Publii database. Do not edit by hand.\n")
        handle.write("export const content = ")
        handle.write(json.dumps(payload, indent=2, ensure_ascii=False))
        handle.write(";\n")

    posts = sum(1 for entry in entries if entry["kind"] == "post")
    pages = sum(1 for entry in entries if entry["kind"] == "page")
    images = sum(1 for entry in entries if entry["image"])
    print(f"{len(entries)} entries ({posts} posts, {pages} pages), {images} images, {len(all_tags)} tags")


if __name__ == "__main__":
    main()
