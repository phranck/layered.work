"""Isolated migration fixtures. Never opens the user's Publii database."""

import hashlib
import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("migrate.py")


class MigrationTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="layered-publii-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "input"
        self.source.mkdir()
        self.media = self.source / "media"
        (self.media / "posts/1").mkdir(parents=True)
        (self.media / "posts/2").mkdir(parents=True)
        (self.media / "files").mkdir()
        (self.media / "posts/1/photo.png").write_bytes(b"fixture-image-one")
        (self.media / "posts/2/photo.png").write_bytes(b"fixture-image-two")
        (self.media / "files/example.glb").write_bytes(b"fixture-model")
        (self.media / "files/excluded.iso").write_bytes(b"fixture-iso")
        self.db = self.source / "db.sqlite"
        with sqlite3.connect(self.db) as db:
            db.executescript("""
                CREATE TABLE posts(id INTEGER PRIMARY KEY,title TEXT,authors TEXT,slug TEXT,text TEXT,featured_image_id INTEGER,created_at INTEGER,modified_at INTEGER,status TEXT,template TEXT);
                CREATE TABLE tags(id INTEGER PRIMARY KEY,name TEXT,slug TEXT,description TEXT,additional_data TEXT);
                CREATE TABLE posts_tags(tag_id INTEGER,post_id INTEGER);
                CREATE TABLE posts_images(id INTEGER PRIMARY KEY,post_id INTEGER,url TEXT,title TEXT,caption TEXT,additional_data TEXT);
                CREATE TABLE posts_additional_data(id INTEGER,post_id INTEGER,key TEXT,value TEXT);
                CREATE TABLE authors(id INTEGER,name TEXT);
                INSERT INTO tags VALUES(1,'Topic','topic','','');
                INSERT INTO posts_tags VALUES(1,1);
                INSERT INTO posts_images VALUES(1,1,'photo.png','','','{"alt":"Original alt"}');
            """)
            self.raw = json.dumps(
                [
                    {
                        "type": "publii-paragraph",
                        "content": "First <strong>paragraph</strong>.",
                        "config": {},
                    },
                    {
                        "type": "publii-code",
                        "content": 'let value = "<html>"',
                        "config": {"language": "swift"},
                    },
                    {
                        "type": "publii-html",
                        "content": '<div><model-viewer src="/media/files/example.glb" alt="Original model"></model-viewer><button>Zoom</button></div>',
                        "config": {},
                    },
                    {
                        "type": "publii-image",
                        "content": {
                            "image": "#DOMAIN_NAME#photo.png",
                            "alt": "Picture",
                            "caption": "Caption",
                        },
                        "config": {},
                    },
                    {
                        "type": "publii-paragraph",
                        "content": "Last paragraph survives.",
                        "config": {},
                    },
                ]
            )
            rows = [
                (
                    1,
                    "English",
                    "1",
                    "original",
                    self.raw,
                    1,
                    1000,
                    2000,
                    "published",
                    "",
                ),
                (
                    2,
                    "Deutsch",
                    "1",
                    "deutsch",
                    '<lang href="/original">English</lang>\n\nDie Welt und der Himmel sind nicht das Ende.',
                    None,
                    3000,
                    4000,
                    "published,hidden,excluded_homepage",
                    "",
                ),
                (
                    3,
                    "Draft",
                    "1",
                    "draft",
                    "Unpublished text",
                    None,
                    5000,
                    6000,
                    "draft,is-page",
                    "",
                ),
                (
                    4,
                    "Trash",
                    "1",
                    "trash",
                    "Trashed text",
                    None,
                    7000,
                    8000,
                    "published,trashed",
                    "",
                ),
                (
                    5,
                    "Public German",
                    "1",
                    "de-public",
                    "Die Welt und der Himmel sind nicht das Ende.",
                    None,
                    9000,
                    10000,
                    "published",
                    "",
                ),
            ]
            db.executemany("INSERT INTO posts VALUES(?,?,?,?,?,?,?,?,?,?)", rows)
        self.before = hashlib.sha256(self.db.read_bytes()).hexdigest()

    def run_migration(self, name="out", extra=()):
        output = self.root / name
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--source",
                str(self.source),
                "--output",
                str(output),
                "--media-output",
                str(self.root / "staged"),
                *extra,
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        return output, json.loads((output / "site.json").read_text())

    def test_full_export_paths_visibility_and_dates(self):
        output, site = self.run_migration()
        entries = {e["id"]: e for e in site["entries"]}
        self.assertEqual(len(entries), 5)
        self.assertEqual(entries[1]["path"], "/original/")
        self.assertEqual(entries[2]["path"], "/de/deutsch/")
        self.assertEqual(entries[2]["visibility"], "hidden")
        self.assertEqual(entries[3]["visibility"], "draft")
        self.assertEqual(entries[4]["visibility"], "trashed")
        self.assertEqual(entries[1]["publishedAt"], "1970-01-01T00:00:01Z")
        self.assertEqual(entries[2]["translationPath"], "/original/")
        self.assertEqual(
            site["redirects"],
            [
                {"source": "/deutsch/", "target": "/de/deutsch/"},
                {"source": "/de-public/", "target": "/de/de-public/"},
            ],
        )
        self.assertEqual(
            json.loads((output / "raw/entries/1.json").read_text())["text"], self.raw
        )
        self.assertIn("Last paragraph survives.", entries[1]["body"])
        self.assertIn('Model("example", alt: "Original model")', entries[1]["body"])
        self.assertIn('let value = "<html>"', entries[1]["body"])
        self.assertNotIn("<model-viewer", entries[1]["body"])
        self.assertEqual(hashlib.sha256(self.db.read_bytes()).hexdigest(), self.before)

    def test_inventory_collision_and_iso_exclusion(self):
        output, site = self.run_migration()
        names = [m["slug"] for m in site["media"]]
        self.assertEqual(len(names), len(set(names)))
        self.assertEqual(len(site["media"]), 3)
        self.assertIn("photo-1", names)
        self.assertIn("photo-2", names)
        for media in site["media"]:
            self.assertEqual(
                hashlib.sha256(
                    (self.root / "staged" / Path(media["src"]).name).read_bytes()
                ).hexdigest(),
                media["sha256"],
            )
        skipped = json.loads((output / "media-report.json").read_text())["skipped"]
        self.assertEqual(skipped[0]["source"], "files/excluded.iso")
        self.assertFalse(
            any(p.suffix == ".iso" for p in (self.root / "staged").iterdir())
        )

    def test_output_is_identical_on_repeat(self):
        first, _ = self.run_migration("first")
        second, _ = self.run_migration("second")
        a = {
            str(p.relative_to(first)): p.read_bytes()
            for p in first.rglob("*")
            if p.is_file()
        }
        b = {
            str(p.relative_to(second)): p.read_bytes()
            for p in second.rglob("*")
            if p.is_file()
        }
        self.assertEqual(a, b)

    def test_unknown_html_is_preserved_and_review_blocks_strict_mode(self):
        raw = '<form action="https://example.test/form"><input name="email"><p>Original consent</p></form>'
        with sqlite3.connect(self.db) as db:
            db.execute(
                "UPDATE posts SET text=? WHERE id=1",
                (json.dumps([{"type": "publii-html", "content": raw}]),),
            )
        output, site = self.run_migration()
        self.assertIn("Original consent", site["entries"][0]["body"])
        self.assertNotIn("<form", site["entries"][0]["body"])
        self.assertIn(
            raw,
            json.loads((output / "raw/entries/1.json").read_text())["text"].replace(
                '\\"', '"'
            ),
        )
        report = json.loads((output / "conversion-report.json").read_text())
        self.assertTrue(report["needsReview"])
        strict = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--source",
                str(self.source),
                "--output",
                str(self.root / "strict"),
                "--media-output",
                str(self.root / "staged"),
                "--strict",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertNotEqual(strict.returncode, 0)

    def test_markdown_embed_converts_to_link_without_touching_code(self):
        raw = 'Before\n\n<iframe src="https://www.youtube.com/embed/example" title="Original video"></iframe>\n\n```html\n<iframe src="example"></iframe>\n```'
        with sqlite3.connect(self.db) as db:
            db.execute("UPDATE posts SET text=? WHERE id=1", (raw,))
        _, site = self.run_migration()
        body = site["entries"][0]["body"]
        self.assertIn("[Original video](https://www.youtube.com/embed/example)", body)
        self.assertIn('```html\n<iframe src="example"></iframe>\n```', body)
        self.assertEqual(body.count("<iframe"), 1)

    def test_plain_html_body_preserves_headings_paragraphs_and_table(self):
        raw = "<h2>Heading</h2><p>First <strong>bold</strong>.</p><table><tr><th>Name</th><th>Value</th></tr><tr><td>Item</td><td>42</td></tr></table><p>Last paragraph.</p>"
        with sqlite3.connect(self.db) as db:
            db.execute("UPDATE posts SET text=? WHERE id=1", (raw,))
        _, site = self.run_migration()
        body = site["entries"][0]["body"]
        self.assertIn("## Heading", body)
        self.assertIn("First **bold**.", body)
        self.assertIn("| Item | 42 |", body)
        self.assertTrue(body.endswith("Last paragraph."))
        self.assertNotIn("<table", body)

    def test_mermaid_labels_convert_legacy_bold_markup_to_markdown_strings(self):
        diagram = 'flowchart LR\n  USBInput("**USB Input**") --> USBDAC("**USB DAC**")'
        raw = json.dumps(
            [{"type": "publii-html", "content": f'<pre class="mermaid">{diagram}</pre>'}]
        )
        with sqlite3.connect(self.db) as db:
            db.execute("UPDATE posts SET text=? WHERE id=1", (raw,))

        output, site = self.run_migration()

        body = site["entries"][0]["body"]
        self.assertIn('USBInput("`**USB Input**`")', body)
        self.assertIn('USBDAC("`**USB DAC**`")', body)
        self.assertNotIn('USBInput("**USB Input**")', body)
        self.assertEqual(
            json.loads((output / "raw/entries/1.json").read_text())["text"], raw
        )

    def test_published_paths_come_from_legacy_output(self):
        legacy = self.source.parent / "output/projects/original"
        legacy.mkdir(parents=True)
        (legacy / "index.html").write_text(
            '<link rel="canonical" href="https://layered.work/projects/original/">'
        )
        _, site = self.run_migration()
        entries = {entry["id"]: entry for entry in site["entries"]}
        self.assertEqual(entries[1]["path"], "/projects/original/")
        self.assertEqual(entries[2]["translationPath"], "/projects/original/")

    def test_internal_file_markers_resolve_both_pdf_downloads(self):
        for name in ("Cheat-Sheet_nano.pdf", "Cheat-Sheet_vi.pdf"):
            (self.media / "files" / name).write_bytes(b"isolated test PDF")
        raw = json.dumps(
            [
                {
                    "type": "publii-paragraph",
                    "content": '<a href="#INTERNAL_LINK#/file/media/files/Cheat-Sheet_nano.pdf">nano PDF</a> and <a href="#INTERNAL_LINK#/file/media/files/Cheat-Sheet_vi.pdf">vi PDF</a>',
                }
            ]
        )
        with sqlite3.connect(self.db) as db:
            db.execute("UPDATE posts SET text=? WHERE id=1", (raw,))
        _, site = self.run_migration()
        body = site["entries"][0]["body"]
        self.assertIn("[nano PDF](/media/cheat-sheet-nano.pdf)", body)
        self.assertIn("[vi PDF](/media/cheat-sheet-vi.pdf)", body)
        self.assertNotIn("#INTERNAL_LINK#", body)

    def test_reviewed_languages_are_bound_to_source_checksum(self):
        review_file = self.root / "review.json"
        review_file.write_text(
            json.dumps(
                {
                    "databaseSha256": self.before,
                    "reviewedAt": "2026-09-20",
                    "entries": [{"id": 1, "language": "en", "basis": "content"}],
                }
            )
        )
        output, _ = self.run_migration(extra=("--language-review", str(review_file)))
        review = json.loads((output / "language-review.json").read_text())
        self.assertEqual(review[0]["reviewStatus"], "confirmed")
        with sqlite3.connect(self.db) as db:
            db.execute("UPDATE posts SET title='Changed content' WHERE id=1")
        output, _ = self.run_migration(
            "changed", extra=("--language-review", str(review_file))
        )
        review = json.loads((output / "language-review.json").read_text())
        self.assertEqual(review[0]["reviewStatus"], "pending")

    def test_refuses_output_inside_source(self):
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--source",
                str(self.source),
                "--output",
                str(self.source / "bad"),
                "--media-output",
                str(self.root / "staged"),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.source / "bad").exists())


if __name__ == "__main__":
    unittest.main()
