#!/usr/bin/env python3
"""Deterministic, read-only Publii export and local preview migration.

The raw export is authoritative. The preview conversion records semantic changes
and unresolved decisions; --strict refuses finalization while they remain.
"""

import argparse
import hashlib
import json
import mimetypes
import re
import shutil
import sqlite3
import sys
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
PROJECT_SLUGS = {
    "next-soundbox",
    "gimli",
    "pandadock",
    "touch-magic",
    "cube",
    "next-megapixel",
    "ono",
}
DEFAULT_SOURCE = Path.home() / "Documents/Publii/sites/layeredwork/input"
GERMAN_WORDS = {
    "der",
    "die",
    "das",
    "und",
    "ich",
    "nicht",
    "ist",
    "mit",
    "für",
    "ein",
    "eine",
    "auf",
}
BLOCK_TAGS = {
    "p",
    "div",
    "section",
    "article",
    "main",
    "header",
    "footer",
    "figure",
    "figcaption",
}
VOID_TAGS = {
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
}


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def slugify(value):
    ascii_value = (
        unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    )
    return re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-") or "media"


def stamp(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return (
            datetime.fromtimestamp(value / 1000, timezone.utc)
            .isoformat()
            .replace("+00:00", "Z")
        )
    return str(value)


def status_of(raw):
    flags = set((raw or "").split(","))
    visibility = (
        "trashed"
        if "trashed" in flags
        else "draft"
        if "draft" in flags
        else "hidden"
        if "hidden" in flags
        else "public"
        if "published" in flags
        else "draft"
    )
    return visibility, "page" if "is-page" in flags else "post"


def read_source(source):
    """Only this function opens SQLite, always with SQLite's read-only URI mode."""
    db = source / "db.sqlite"
    before = digest(db)
    with sqlite3.connect(db.as_uri() + "?mode=ro", uri=True) as connection:
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA query_only = ON")
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }
        result = {}
        for table in (
            "posts",
            "tags",
            "posts_tags",
            "posts_images",
            "posts_additional_data",
            "authors",
        ):
            result[table] = (
                [
                    dict(row)
                    for row in connection.execute(
                        f"SELECT * FROM {table} ORDER BY "
                        + ("post_id, tag_id" if table == "posts_tags" else "id")
                    )
                ]
                if table in tables
                else []
            )
    if digest(db) != before:
        raise ValueError(
            "Publii database changed during the export; retry from a stable copy."
        )
    result["sha256"] = before
    return result


class Element:
    def __init__(self, tag="root", attrs=()):
        self.tag = tag
        self.attrs = dict(attrs)
        self.children = []

    def all(self, tag=None, css=None):
        matches = []
        for child in self.children:
            if isinstance(child, Element):
                if (tag is None or child.tag == tag) and (
                    css is None or css in child.attrs.get("class", "").split()
                ):
                    matches.append(child)
                matches.extend(child.all(tag, css))
        return matches

    def text(self):
        return "".join(
            child.text() if isinstance(child, Element) else child
            for child in self.children
        )


class Fragment(HTMLParser):
    def __init__(self, raw):
        super().__init__(convert_charrefs=True)
        self.root = Element()
        self.stack = [self.root]
        self.feed(raw)
        self.close()

    def handle_starttag(self, tag, attrs):
        element = Element(tag, attrs)
        self.stack[-1].children.append(element)
        if tag not in VOID_TAGS:
            self.stack.append(element)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID_TAGS:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                return

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def plain(raw):
    return re.sub(r"\s+", " ", Fragment(raw).root.text()).strip()


def mermaid_markdown_strings(raw):
    return re.sub(r'"(\*\*[^"\n]+\*\*)"', r'"`\1`"', raw)


def language_of(title, raw):
    try:
        parsed = json.loads(raw)
        text = " ".join(str(block.get("content", "")) for block in parsed)
    except (ValueError, TypeError):
        text = raw
    words = set(re.findall(r"\w+", plain(title + " " + text).lower()))
    markers = sorted(words & GERMAN_WORDS)
    return ("de" if len(markers) >= 3 else "en"), markers


def inventory(source, output):
    files = sorted(
        path
        for path in source.rglob("*")
        if path.is_file() and not path.name.startswith(".")
    )
    bases = Counter(
        slugify(path.stem) for path in files if path.suffix.lower() != ".iso"
    )
    records, skipped, used = [], [], set()
    for path in files:
        if not path.resolve().is_relative_to(source.resolve()):
            raise ValueError(f"Media symlink escapes source: {path}")
        relative = path.relative_to(source).as_posix()
        base = {
            "source": relative,
            "filename": path.name,
            "bytes": path.stat().st_size,
            "sha256": digest(path),
        }
        if path.suffix.lower() == ".iso":
            skipped.append(
                {
                    **base,
                    "reason": "ISO excluded by migration decision #96; external replacement pending",
                }
            )
            continue
        slug = slugify(path.stem)
        if bases[slug] > 1:
            parts = path.relative_to(source).parts
            suffix = (
                parts[1]
                if parts[0] == "posts" and len(parts) > 2
                else slugify(str(path.parent.relative_to(source)))
            )
            slug += "-" + suffix
        if slug in used:
            slug += "-" + hashlib.sha256(relative.encode()).hexdigest()[:8]
        used.add(slug)
        target = output / (slug + path.suffix.lower())
        if target.exists() and digest(target) != base["sha256"]:
            # Only this explicitly selected staging directory is writable.
            shutil.copyfile(path, target)
        elif not target.exists():
            shutil.copyfile(path, target)
        if digest(target) != base["sha256"]:
            raise ValueError(f"Staged checksum mismatch: {relative}")
        mime = {"glb": "model/gltf-binary"}.get(
            path.suffix[1:].lower(),
            mimetypes.guess_type(path.name)[0] or "application/octet-stream",
        )
        records.append(
            {**base, "slug": slug, "src": "/media/" + target.name, "mime": mime}
        )
    return records, skipped


class Converter:
    def __init__(self, media, entry, paths, iso_links):
        self.media = media
        self.by_source = {item["source"]: item for item in media}
        self.entry = entry
        self.paths = paths
        self.iso_links = iso_links
        self.decisions = []
        self.components = set()
        self.translation = None

    def decision(self, code, message, review=True):
        item = {"code": code, "message": message, "reviewRequired": review}
        if item not in self.decisions:
            self.decisions.append(item)

    def media_for(self, reference):
        local = unquote(reference.removeprefix("#INTERNAL_LINK#/file"))
        if local.startswith("#DOMAIN_NAME#"):
            local = f"posts/{self.entry['id']}/" + local[len("#DOMAIN_NAME#") :]
        else:
            url = urlsplit(local)
            if url.netloc and url.netloc not in {"layered.work", "www.layered.work"}:
                return None
            local = url.path.removeprefix("/media/").lstrip("/")
        found = self.by_source.get(local)
        if not found:
            matches = [
                item for item in self.media if item["filename"] == Path(local).name
            ]
            found = matches[0] if len(matches) == 1 else None
        return found

    def link(self, reference):
        reference = reference.removeprefix("#INTERNAL_LINK#/file")
        url = urlsplit(reference)
        if (
            reference.startswith("#DOMAIN_NAME#")
            or url.path.startswith("/media/")
            and (not url.netloc or url.netloc in {"layered.work", "www.layered.work"})
        ):
            if url.path.lower().endswith(".iso"):
                filename = Path(url.path).name
                if filename in self.iso_links:
                    return self.iso_links[filename]
                self.decision(
                    "iso-external-target-pending",
                    f"{filename}: legacy absolute URL retained; supply a verified external replacement with --iso-links",
                )
                return "https://layered.work" + url.path
            found = self.media_for(reference)
            if found:
                return found["src"] + ("#" + url.fragment if url.fragment else "")
            self.decision("missing-local-media", reference)
            return "https://layered.work" + url.path if not url.netloc else reference
        if not url.netloc and url.path.strip("/") in self.paths:
            return self.paths[url.path.strip("/")] + (
                "#" + url.fragment if url.fragment else ""
            )
        return reference

    def component(self, name, slug, **kwargs):
        self.components.add(name)
        args = [json.dumps(slug, ensure_ascii=False)]
        args.extend(
            f"{key}: {json.dumps(value, ensure_ascii=False)}"
            for key, value in kwargs.items()
            if value
        )
        return name + "(" + ", ".join(args) + ")"

    def image(self, reference, alt="", caption=""):
        found = self.media_for(reference)
        if found:
            if alt:
                found.setdefault("alt", alt)
            return self.component("Image", found["slug"], alt=alt, caption=caption)
        self.decision("missing-image", reference)
        return f"![{alt}]({self.link(reference)})"

    def render_html(self, node):
        if isinstance(node, str):
            return re.sub(r"\s+", " ", node)
        tag, attrs = node.tag, node.attrs
        if tag in {
            "script",
            "style",
            "svg",
            "button",
            "input",
            "textarea",
            "select",
            "noscript",
        }:
            return ""
        if tag == "lang":
            self.translation = attrs.get("href", "").strip("/")
            return ""
        if tag == "img":
            return (
                "\n\n" + self.image(attrs.get("src", ""), attrs.get("alt", "")) + "\n\n"
            )
        if tag == "iframe":
            self.decision("iframe-to-link", attrs.get("src", ""), False)
            return f"\n\n[{attrs.get('title') or 'View embedded content'}]({self.link(attrs.get('src', ''))})\n\n"
        if tag == "table":
            rows = []
            for row in node.all("tr"):
                cells = [
                    cell
                    for cell in row.children
                    if isinstance(cell, Element) and cell.tag in {"th", "td"}
                ]
                rows.append(
                    "| "
                    + " | ".join(
                        self.html_element(cell).replace("|", "\\|").replace("\n", " ")
                        for cell in cells
                    )
                    + " |"
                )
                if len(rows) == 1:
                    rows.append("| " + " | ".join("---" for _ in cells) + " |")
            return "\n\n" + "\n".join(rows) + "\n\n"
        if tag == "pre":
            classes = attrs.get("class", "").split()
            if "markdown" in classes:
                return "\n\n" + node.text().strip() + "\n\n"
            language = "mermaid" if "mermaid" in classes else ""
            source = node.text().strip()
            if language == "mermaid":
                source = mermaid_markdown_strings(source)
            return "\n\n" + fence(source, language) + "\n\n"
        children = "".join(self.render_html(child) for child in node.children)
        if tag in {"strong", "b"}:
            return "**" + children.strip() + "**" if children.strip() else ""
        if tag in {"em", "i"}:
            return "*" + children.strip() + "*" if children.strip() else ""
        if tag in {"code", "kbd"} or "kbd" in attrs.get("class", "").split():
            return "`" + node.text().replace("`", "\\`") + "`"
        if tag in {"s", "del"}:
            return "~~" + children.strip() + "~~"
        if tag == "a":
            href = attrs.get("href", "")
            return f"[{children.strip()}]({self.link(href)})" if href else children
        if re.fullmatch(r"h[1-6]", tag):
            return "\n\n" + "#" * int(tag[1]) + " " + children.strip() + "\n\n"
        if tag == "br":
            return "  \n"
        if tag == "hr":
            return "\n\n---\n\n"
        if tag == "li":
            return "\n- " + children.strip() + "\n"
        if tag in {"ul", "ol"}:
            if tag == "ol":
                items = [
                    child
                    for child in node.children
                    if isinstance(child, Element) and child.tag == "li"
                ]
                children = "\n".join(
                    f"{i}. "
                    + "".join(self.render_html(c) for c in child.children).strip()
                    for i, child in enumerate(items, 1)
                )
            return "\n\n" + children.strip() + "\n\n"
        if tag == "blockquote":
            return (
                "\n\n"
                + "\n".join("> " + line for line in children.strip().splitlines())
                + "\n\n"
            )
        if tag in BLOCK_TAGS:
            return "\n\n" + children.strip() + "\n\n"
        return children

    def html(self, raw):
        return re.sub(
            r"\n[ \t]*\n(?:[ \t]*\n)+", "\n\n", self.render_html(Fragment(raw).root)
        ).strip()

    def custom_html(self, raw):
        tree = Fragment(raw).root
        models = tree.all("model-viewer")
        if models:
            output = []
            for model in models:
                found = self.media_for(model.attrs.get("src", ""))
                if not found:
                    self.decision("missing-model", model.attrs.get("src", ""))
                    continue
                output.append(
                    self.component(
                        "Model", found["slug"], alt=model.attrs.get("alt", "")
                    )
                )
            self.decision(
                "model-viewer-to-model",
                "Model replaces the viewer container, controls and lightbox.",
                False,
            )
            return "\n\n".join(output)
        if tree.all("form"):
            self.decision(
                "form-requires-editorial-integration",
                "Form interaction requires the forms work package. Full source retained in raw export; preview includes its explanatory copy only.",
            )
            forms = tree.all("form")
            pieces = []
            for form in forms:
                for element in form.all():
                    if element.tag in {"h2", "h3", "p"}:
                        pieces.append(self.render_html(element).strip())
            return "\n\n".join(piece for piece in pieces if piece)
        cards = tree.all(css="cardbox")
        if cards:
            self.components.update({"Grid", "Card"})
            self.decision(
                "card-grid-to-components",
                f"{len(cards)} semantic cards retained.",
                False,
            )
            return (
                "Grid(columns: 2) {\n"
                + "\n\n".join(
                    "  Card {\n" + indent(self.html_element(card)) + "\n  }"
                    for card in cards
                )
                + "\n}"
            )
        if tree.all(css="lw-cheatsheet"):
            pieces = []
            for card in tree.all("article"):
                headings = card.all("h2")
                pieces.append("### " + plain(headings[0].text()) if headings else "")
                rows = ["| Action | Keys |", "| --- | --- |"]
                for row in card.all(css="row"):
                    names, keys = row.all(css="name"), row.all(css="keys")
                    if names and keys:
                        name = self.html_element(names[0]).replace("|", "\\|")
                        key = self.html_element(keys[0]).replace("|", "\\|")
                        rows.append(f"| {name} | {key} |")
                pieces.append("\n".join(rows))
            self.decision(
                "cheatsheet-to-tables",
                "All named actions and keyboard combinations preserved.",
                False,
            )
            return "\n\n".join(pieces)
        known = tree.all("pre") or tree.all("iframe")
        self.decision(
            "html-to-markdown" if known else "unclassified-html",
            "Semantic HTML converted; complete source retained in raw export.",
            not bool(known),
        )
        return self.html(raw)

    def html_element(self, element):
        return re.sub(
            r"\n[ \t]*\n(?:[ \t]*\n)+", "\n\n", self.render_html(element)
        ).strip()

    def markdown(self, raw):
        def lang(match):
            tree = Fragment(match.group()).root
            self.translation = tree.all("lang")[0].attrs.get("href", "").strip("/")
            return ""

        raw = re.sub(
            r"<lang\b[^>]*>.*?</lang>", lang, raw, flags=re.DOTALL | re.IGNORECASE
        )
        # Keep fenced code byte-for-byte, including shell commands naming ISO files.
        pattern = re.compile(
            r"^[ \t]*(?P<fence>`{3,}|~{3,})[^\n]*\n.*?^[ \t]*(?P=fence)[ \t]*$",
            re.MULTILINE | re.DOTALL,
        )
        output, start = [], 0
        for match in pattern.finditer(raw):
            output.append(self.markdown_prose(raw[start : match.start()]))
            output.append(match.group())
            start = match.end()
        output.append(self.markdown_prose(raw[start:]))
        return "".join(output).strip()

    def markdown_prose(self, raw):
        raw = re.sub(
            r"!\[([^\]]*)\]\(([^\s)]+)\)",
            lambda m: (
                "\n\n" + self.image(m[2], m[1]) + "\n\n"
                if self.media_for(m[2])
                else m[0]
            ),
            raw,
        )
        raw = re.sub(
            r"(?<!!)\[([^\]]*)\]\(([^\s)]+)\)",
            lambda m: f"[{m[1]}]({self.link(m[2])})",
            raw,
        )
        raw = re.sub(r"<br\s*/?>", " / ", raw, flags=re.IGNORECASE)
        # Markdown may contain standalone media HTML as well as ordinary prose.
        raw = re.sub(
            r"<video\b.*?</video>",
            lambda m: self.video(m[0]),
            raw,
            flags=re.DOTALL | re.IGNORECASE,
        )
        raw = re.sub(
            r"<iframe\b.*?</iframe>",
            lambda m: self.html(m[0]),
            raw,
            flags=re.DOTALL | re.IGNORECASE,
        )
        return raw

    def video(self, raw):
        tree = Fragment(raw).root
        sources = tree.all("source") + tree.all("video")
        reference = next(
            (n.attrs.get("src") for n in sources if n.attrs.get("src")), ""
        )
        found = self.media_for(reference)
        if found:
            return "\n\n" + self.component("Video", found["slug"]) + "\n\n"
        self.decision("unresolved-video", reference)
        return self.html(raw)

    def body(self, raw):
        try:
            blocks = json.loads(raw)
        except (ValueError, TypeError):
            if re.match(
                r"^\s*<(?:p|div|h[1-6]|table|article|section)\b",
                raw or "",
                flags=re.IGNORECASE,
            ):
                return self.html(raw)
            return self.markdown(raw or "")
        if not isinstance(blocks, list):
            self.decision("unknown-body-shape", "Expected a JSON array or Markdown.")
            return self.markdown(raw)
        output = []
        for block in blocks:
            kind, content, config = (
                block.get("type"),
                block.get("content", ""),
                block.get("config", {}),
            )
            if kind == "publii-paragraph":
                output.append(self.html(content))
            elif kind == "publii-header":
                output.append(
                    "#" * int(config.get("headingLevel", 2)) + " " + self.html(content)
                )
            elif kind == "publii-html":
                output.append(self.custom_html(content))
            elif kind == "publii-code":
                output.append(fence(content, config.get("language", "")))
            elif kind == "publii-image":
                output.append(
                    self.image(
                        content["image"],
                        content.get("alt", ""),
                        content.get("caption", ""),
                    )
                )
            elif kind == "publii-gallery":
                self.components.add("Gallery")
                images = [
                    self.image(
                        image["src"], image.get("alt", ""), image.get("caption", "")
                    )
                    for image in content.get("images", [])
                ]
                columns = max(1, min(6, int(config.get("columns", 3))))
                output.append(
                    f"Gallery(columns: {columns}) {{\n"
                    + "\n".join("  " + image for image in images)
                    + "\n}"
                )
            elif kind == "publii-quote":
                quote = self.html(content.get("text", ""))
                if content.get("author"):
                    quote += "\n\n" + self.html(content["author"])
                output.append("\n".join("> " + line for line in quote.splitlines()))
            elif kind == "publii-list":
                tag = "ol" if config.get("listType") == "ol" else "ul"
                output.append(self.html(f"<{tag}>{content}</{tag}>"))
            else:
                self.decision(
                    "unknown-block", f"{kind}: source retained in raw export."
                )
                output.append(
                    self.html(content)
                    if isinstance(content, str)
                    else plain(json.dumps(content, ensure_ascii=False))
                )
        return "\n\n".join(piece.strip() for piece in output if piece.strip())


def indent(value):
    return "\n".join("    " + line.replace("}", "\\}") for line in value.splitlines())


def fence(value, language=""):
    length = max([len(match[0]) for match in re.finditer(r"`+", value)] + [2]) + 1
    delimiter = "`" * max(3, length)
    return delimiter + language + "\n" + value + "\n" + delimiter


def legacy_addresses(directory, entries):
    """Read the generated site's actual URLs, including nested project pages."""
    addresses, paths = [], {}
    slugs = {entry["slug"] for entry in entries}
    for file in sorted(directory.rglob("*.html")) if directory.exists() else []:
        relative = file.relative_to(directory).as_posix()
        path = (
            "/" + relative.removesuffix("index.html")
            if file.name == "index.html"
            else "/" + relative
        )
        canonical = None
        for tag in re.findall(
            r"<link\b[^>]*>", file.read_text(encoding="utf-8"), flags=re.IGNORECASE
        ):
            links = Fragment(tag).root.all("link")
            if links and "canonical" in links[0].attrs.get("rel", "").split():
                canonical = links[0].attrs.get("href")
        addresses.append({"path": path, "canonical": canonical, "source": relative})
        slug = file.parent.name
        if (
            file.name == "index.html"
            and slug in slugs
            and not relative.startswith(("tags/", "authors/"))
        ):
            canonical_path = urlsplit(canonical).path if canonical else path
            if canonical_path != path:
                raise ValueError(
                    f"Legacy canonical differs from generated path: {relative}"
                )
            if slug in paths and paths[slug] != path:
                raise ValueError(f"Ambiguous legacy entry path: {slug}")
            paths[slug] = path
    return paths, addresses


def export(
    source,
    output,
    media_output,
    iso_links=None,
    legacy_output=None,
    language_review=None,
):
    source, output, media_output = (
        source.resolve(),
        output.resolve(),
        media_output.resolve(),
    )
    if output.is_relative_to(source) or media_output.is_relative_to(source):
        raise ValueError("Output paths must be outside the Publii source directory.")
    if source.is_relative_to(output) or source.is_relative_to(media_output):
        raise ValueError("Output paths must not contain the Publii source directory.")
    source_data = read_source(source)
    legacy_paths, addresses = legacy_addresses(
        legacy_output or source.parent / "output", source_data["posts"]
    )
    output.mkdir(parents=True, exist_ok=True)
    media_output.mkdir(parents=True, exist_ok=True)
    media, skipped = inventory(source / "media", media_output)
    tags = {tag["id"]: tag for tag in source_data["tags"]}
    assignments = {}
    for row in source_data["posts_tags"]:
        assignments.setdefault(row["post_id"], []).append(tags[row["tag_id"]]["slug"])
    images = {image["id"]: image for image in source_data["posts_images"]}
    reviewed = (
        {entry["id"]: entry for entry in (language_review or {}).get("entries", [])}
        if (language_review or {}).get("databaseSha256") == source_data["sha256"]
        else {}
    )
    paths, languages, review = {}, {}, []
    for row in source_data["posts"]:
        detected, markers = language_of(row["title"], row["text"] or "")
        decision = reviewed.get(row["id"])
        language = decision["language"] if decision else detected
        if language not in {"en", "de"}:
            raise ValueError(f"Unsupported reviewed language: {language}")
        languages[row["id"]] = language
        paths[row["slug"]] = (
            "/de/" + row["slug"] + "/"
            if language == "de"
            else legacy_paths.get(row["slug"], "/" + row["slug"] + "/")
        )
        review.append(
            {
                "id": row["id"],
                "slug": row["slug"],
                "language": language,
                "markers": markers,
                "title": row["title"],
                "sample": plain(row["text"] or "")[:300],
                "detectedLanguage": detected,
                "reviewStatus": "confirmed" if decision else "pending",
                "reviewBasis": decision["basis"] if decision else None,
                "reviewedAt": language_review.get("reviewedAt") if decision else None,
            }
        )
    # Match internal links already using the original nested path as well.
    for slug, original_path in legacy_paths.items():
        paths[original_path.strip("/")] = paths[slug]
    entries, reports, redirects = [], [], []
    for row in source_data["posts"]:
        converter = Converter(media, row, paths, iso_links or {})
        body = converter.body(row["text"] or "")
        visibility, kind = status_of(row["status"])
        if kind == "page" and row["slug"] in PROJECT_SLUGS:
            kind = "project"
        raw = {
            **row,
            "topics": assignments.get(row["id"], []),
            "featuredImage": images.get(row["featured_image_id"]),
            "additionalData": [
                item
                for item in source_data["posts_additional_data"]
                if item["post_id"] == row["id"]
            ],
        }
        write_json(output / f"raw/entries/{row['id']}.json", raw)
        image = images.get(row["featured_image_id"])
        featured = (
            converter.media_for(f"#DOMAIN_NAME#{image['url']}")
            if image and image["url"]
            else None
        )
        if featured and image.get("additional_data"):
            metadata = json.loads(image["additional_data"])
            if metadata.get("alt"):
                featured.setdefault("alt", metadata["alt"])
        # No summary is written here. The site derives one from the body, and it
        # knows the component language this file does not, so a summary cut to
        # length here ends mid-component and is published that way.
        entry = {
            "id": row["id"],
            "title": row["title"],
            "slug": row["slug"],
            "path": paths[row["slug"]],
            "language": languages[row["id"]],
            "visibility": visibility,
            "kind": kind,
            "publishedAt": stamp(row["created_at"]),
            "updatedAt": stamp(row["modified_at"]),
            "summary": None,
            "body": body,
            "topics": assignments.get(row["id"], []),
            "featuredImage": featured["slug"] if featured else None,
            "translationPath": paths.get(converter.translation),
            "featured": "featured" in (row["status"] or "").split(","),
            "template": row["template"],
            "onHomePage": visibility == "public"
            and "excluded_homepage" not in (row["status"] or "").split(","),
            "readingWidth": "normal",
        }
        entries.append(entry)
        reports.append(
            {
                "id": row["id"],
                "slug": row["slug"],
                "visibility": visibility,
                "sourceCharacters": len(row["text"] or ""),
                "convertedCharacters": len(body),
                "components": sorted(converter.components),
                "decisions": converter.decisions,
                "status": "needs-review"
                if any(item["reviewRequired"] for item in converter.decisions)
                else "converted",
            }
        )
        if entry["language"] == "de" and visibility in {"public", "hidden"}:
            original_path = legacy_paths.get(row["slug"], "/" + row["slug"] + "/")
            redirects.append({"source": original_path, "target": entry["path"]})
            if original_path != "/" + row["slug"] + "/":
                redirects.append(
                    {"source": "/" + row["slug"] + "/", "target": entry["path"]}
                )
    topics = [
        {"id": tag["id"], "slug": tag["slug"], "name": tag["name"]}
        for tag in source_data["tags"]
    ]
    site = {
        "entries": entries,
        "topics": topics,
        "media": media,
        "redirects": redirects,
    }
    report = {
        "entries": reports,
        "needsReview": any(row["status"] == "needs-review" for row in reports)
        or any(row["reviewStatus"] == "pending" for row in review),
        "languageReviewComplete": all(
            row["reviewStatus"] == "confirmed" for row in review
        ),
        "validation": "pending: run node scripts/publii/validate.mjs",
        "counts": dict(sorted(Counter(row["visibility"] for row in entries).items())),
    }
    write_json(output / "site.json", site)
    write_json(output / "topics.json", source_data["tags"])
    write_json(output / "legacy-addresses.json", addresses)
    write_json(output / "language-review.json", review)
    write_json(output / "conversion-report.json", report)
    write_json(
        output / "media-report.json",
        {
            "staged": len(media),
            "stagedBytes": sum(item["bytes"] for item in media),
            "skipped": skipped,
            "missingAlt": [
                item["source"]
                for item in media
                if item["mime"].startswith("image/") and not item.get("alt")
            ],
            "checksumVerification": "all local staged originals match source SHA-256",
            "remoteUpload": "not performed",
        },
    )
    write_json(output / "media-inventory.json", media + skipped)
    write_json(
        output / "source.json",
        {
            "databaseSha256": source_data["sha256"],
            "counts": {
                key: len(value)
                for key, value in source_data.items()
                if isinstance(value, list)
            },
        },
    )
    for key in ("posts_tags", "posts_images", "posts_additional_data", "authors"):
        write_json(output / f"raw/{key}.json", source_data[key])
    if digest(source / "db.sqlite") != source_data["sha256"]:
        raise ValueError(
            "Publii database changed during migration; outputs must not be used."
        )
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument(
        "--language-review",
        type=Path,
        default=Path(__file__).with_name("language-decisions.json"),
        help="Language decisions bound to the exact source database checksum",
    )
    parser.add_argument(
        "--legacy-output",
        type=Path,
        help="Publii generated output; defaults to source sibling output directory",
    )
    parser.add_argument("--output", type=Path, default=ROOT / "migration-out")
    parser.add_argument(
        "--media-output", type=Path, default=ROOT / "apps/website/public/media"
    )
    parser.add_argument(
        "--iso-links",
        type=Path,
        help="Reviewed JSON mapping from ISO filename to external URL",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit nonzero while editorial conversion decisions remain",
    )
    args = parser.parse_args()
    try:
        links = json.loads(args.iso_links.read_text()) if args.iso_links else {}
        report = export(
            args.source,
            args.output,
            args.media_output,
            links,
            args.legacy_output,
            json.loads(args.language_review.read_text()),
        )
        print(
            json.dumps(
                {
                    "entries": len(report["entries"]),
                    "counts": report["counts"],
                    "needsReview": report["needsReview"],
                },
                sort_keys=True,
            )
        )
        return 2 if args.strict and report["needsReview"] else 0
    except (OSError, ValueError, sqlite3.Error) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
