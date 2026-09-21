# Publii migration

The local migration prepares the website preview from the original Publii database and media. It does not write to Publii, the application database, S3, or production. GitHub issues #96–#101 remain the release checklist; local preparation does not satisfy remote import/upload or cutover acceptance.

## Run

Use Node 22, Python 3.11 or newer, and the repository's installed dependencies. The content package must be built so the migration uses its actual validator:

```sh
pnpm --filter @layered/content build
node scripts/publii/run.mjs
```

The defaults are:

- Source: `~/Documents/Publii/sites/layeredwork/input`, opened with SQLite URI `mode=ro` and `query_only`.
- Export: `migration-out/`.
- Local originals and generated variants: `apps/website/public/media/`.

Both output directories are ignored by Git. The website reads the export only when `WEBSITE_CONTENT_FILE` names the absolute path to `migration-out/site.json`. The raw export is not a public website asset.

All paths can be overridden. Output paths inside the source, and output paths containing the source, are rejected:

```sh
node scripts/publii/run.mjs \
  --source /path/to/a/publii/input-copy \
  --output /path/to/private/export \
  --media-output /path/to/local/site/public/media
```

The stages can also run separately:

```sh
python3 scripts/publii/migrate.py
node scripts/publii/media.mjs
node scripts/publii/validate.mjs
```

`--strict` on the combined command or validator returns a nonzero exit status when an editorial conversion decision or language review remains. All content validation errors always fail the validator. A successful preview run with `needsReview: true` is not a completed production migration.

## Portable files

| File | Contents |
| --- | --- |
| `raw/entries/<id>.json` | Every original column, including the exact full `text` value, status flags, template, original dates, topics, featured image row and additional data. Includes the trashed entry. |
| `raw/*.json` | Original authors, topic assignments, image rows and additional data. |
| `source.json` | Database SHA-256 and table counts. The checksum is checked again after export. |
| `topics.json` | Complete topic rows. |
| `media-inventory.json` | Source filename, relative path, byte count, SHA-256 and deterministic slug; the ISO files are inventoried too. |
| `language-review.json` | Detected language, evidence words, title, opening sample and review state for every entry. Review decisions are retained only for an identical database checksum. Empty drafts explicitly record a title-based assumption. |
| `conversion-report.json` | Every entry, source/converted length, components, explicit conversion decisions and results from the real content validator. |
| `media-report.json` | Local checksum verification, excluded files, absent alt text, generated variants and placeholders. Remote upload remains explicitly unperformed. |
| `site.json` | Normalized entries, topics, media and redirects consumed by the website. |

No timestamps of the migration run are written. Unchanged inputs produce identical exports and staged media. Original publication and modification times keep their subsecond precision. `legacy-addresses.json` inventories all generated Publii HTML paths and their canonical URLs; `--legacy-output` can point to a separate output copy.

## Website contract

`site.json` contains arrays named `entries`, `topics`, `media`, and `redirects`.

Entries expose `id`, `title`, `slug`, `path`, `language`, `visibility`, `kind`, `publishedAt`, `updatedAt`, `summary`, `body`, `topics`, `featuredImage`, `translationPath`, `featured`, `onHomePage`, `readingWidth`, and `template`. Dates are ISO strings or null. Image and translation references are nullable. `body` is complete Markdown with content components, rather than the prototype's truncated paragraphs.

Visibility is `public`, `hidden`, `draft`, or `trashed`. All 21 records remain in the aggregate so the report can account for them; route and listing policies exclude drafts and trash, and exclude hidden entries from public listings. An `excluded_homepage` flag yields `onHomePage: false`.

The source's `is-page` remains in the raw export. The actual portfolio entries `next-soundbox`, `gimli`, `pandadock`, and `touch-magic`, plus the project drafts `cube`, `next-megapixel`, and `ono`, normalize to `kind: project`. This follows the portfolio selection in `prototype/shared/proto.js`. The `projects` overview remains a page and its body remains available.

Existing English paths come from the generated Publii output and remain unchanged, including `/projects/next-soundbox/`, `/projects/pandadock/`, and `/projects/touch-magic/`. When an entry has never been generated, its draft path defaults to `/<slug>/`. German paths become `/de/<slug>/`. All four previously published German paths, including `/projects/gimli/` and the hidden translation entries, receive redirects. The bare `/gimli/` alias also redirects. The original `<lang>` elements become `translationPath`, with their presentation removed from the body. New-entry language prefix rules belong to the publishing system and do not rewrite these legacy English paths.

Topics expose `id`, `slug`, and `name`. Media expose `slug`, `src`, `mime`, `filename`, `source`, `bytes`, and `sha256`; images also receive dimensions, responsive `srcSet`, and a WebP data-URL placeholder when variants are generated. Existing alt text is preserved. Missing alt text is reported rather than invented.

Media slugs come from filenames. Collisions receive the owning entry ID or containing directory, then a stable path hash if necessary. Every source file except the two ISOs is copied byte-for-byte and verified. Responsive variants are generated separately with the Sharp version already supplied by Astro; originals are never resized or replaced. Existing Publii responsive images and thumbnails are preserved but do not spawn further variants.

## Addresses and redirects

The list of addresses the old site answered comes from what it actually served, not from the database. Two sources produce it, because neither is complete on its own.

The generated Publii output in `~/Documents/Publii/sites/layeredwork/output` is what the site published on its final day, and `legacy-addresses.json` inventories its 42 HTML addresses. `node apps/website/tools/render-preview.mjs --legacy-output <that directory>` requests every one of them against the production build and fails when any ends anywhere other than 200.

That output cannot contain an address the site stopped generating earlier, and such an address is still written down in bookmarks and in other people's posts. The Internet Archive holds the record of those, and six of them answered 200 whilst the current output has no page for them. They live in `apps/website/src/content/legacy-redirects.json`, each with its target, its reason and the date it was last observed answering. The route reads that file and so does the preview renderer, so neither can drift from the other. Adding an address means adding it there and nowhere else.

| Address | Answer | Reason |
| --- | --- | --- |
| Every English entry, at the path it had | 200 | The English paths are unchanged, which is the whole point of the scheme. |
| `/projects/gimli/`, `/gimli/`, `/website-design-die-zweite/`, `/nextstep-on-rpi5-de/`, `/ki-bedienungsanleitung/` | 308 to `/de/<slug>/` | The four German entries move under the language prefix. The two publicly listed ones were linked, and the two hidden ones stay reachable the same way. |
| `/tags/` | 308 to `/topics/` | The section is called Topics now. |
| `/tags/<slug>/` | 308 to `/topics/<slug>/` | Same subject, new prefix, for every topic the snapshot still carries. |
| `/authors/frank-gregor/` | 308 to `/` | There is one author and the new site has no author page, so the home page is the nearest real answer. |
| `/page/<number>/` | 308 to `/archive/?page=<number>` | Pagination moved from the path into the query, where the archive reads it. |
| `/media/files/claude-fonts-preview.html` | 308 to the staged media address | The file survives the migration under its media slug. |
| `/feed.xml`, `/feed.json`, `/sitemap.xml`, `/robots.txt` | 200 | These keep their addresses exactly. |
| The six addresses in `legacy-redirects.json` | 308 | Observed in the Internet Archive, absent from the final output. Each row carries its own reason. |
| `/404.html` | 404 | Publii served its error page at a real address. Nothing links to it and a redirect would only disguise the status. |

Two things are deliberately outside this list. Static assets such as the favicons, the web manifest and the images under `/media/` are not page addresses and are not crawled by the check. The old site had no search page: its search ran in the browser on the pages themselves, so there is no address to preserve.

The trashed entry `happy-birthday` needs no redirect. Publii does not generate a trashed entry, so `/happy-birthday/` is absent from the final output, and the Internet Archive has no record of that address at all. It never answered, so nothing points at it.

Verified on 21 September 2026: the preview renderer checked 42 legacy addresses and the six archived ones, and reported 36 redirect targets returning 200, four private entries returning 404 and no other status.

## The upload

The pipeline itself never talks to the network, which is why the upload is its own command:

```sh
node scripts/publii/upload.mjs --dry-run
node scripts/publii/upload.mjs
```

It needs `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`. Missing any of them, it writes nothing and says which one. The values belong to the `assets` object storage of the `layered.work` project on Zerops; `zcli project env` prints the endpoint and the bucket name but masks the secret, so that one is read from the Zerops interface.

Every object is written below the `migration/` prefix, so the whole set can be listed, counted and removed again without touching what the dashboard uploads later. After each write the object is read back and compared with its source by byte count and by SHA-256, because a successful `PUT` says the request was accepted rather than what is stored under that key. The run finishes by listing the prefix and recording what the bucket actually holds, in `migration-out/upload-report.json`.

**Only what a page names is uploaded.** Measured on 21 September 2026: 76 originals at 124.2 MB and 206 generated variants at 17.4 MB go up, and 89.7 MB stays behind. That is 27.1 MB of Publii's own responsive copies and 17.9 MB of its gallery thumbnails, both superseded by the variants generated here, plus 44.0 MB in the file manager that no entry and no generated page ever referenced, of which 42.1 MB is a single unused video. Each of those is listed in the report with its reason, because a file left out silently looks exactly like a file that failed. They remain in the Publii archive and in the local staging directory.

## Language review

`scripts/publii/language-decisions.json` records the reviewed language of all 21 source entries and the exact database SHA-256. German IDs are 16, 22, 23, and 29. Empty drafts 9, 11, and 12 use their English titles as an explicitly recorded assumption; trashed entry 31 is marked as skipped for publication. A changed source database invalidates this review and returns the entries to pending. A subsequent reviewed map can be supplied through `--language-review`.

## Conversion decisions

The converter handles JSON blocks and Markdown without truncation. Paragraphs, headings, code, quotes, lists, images and galleries retain their content. The three model-viewer containers become one `Model` component each, preserving the GLB reference and alternative text. Card grids become `Grid`/`Card`, keyboard cheat sheets become tables, and HTML-wrapped Markdown tables become Markdown tables. The Mermaid source remains a fenced `mermaid` block; diagram rendering is a separate renderer capability.

Embedded YouTube players become links carrying the original title and URL. The font preview points to its staged original HTML file. These changes are recorded per entry. The complete original HTML always remains in the private raw export.

The NeXT mini interest form retains its explanatory copy in the preview. Its submit interaction, inputs and scripts require the forms work package. No form endpoint is invented and no non-working local submit button is created.

The two ISO files are excluded. Until an independently verified external replacement is supplied, the affected posts keep their original absolute legacy addresses and the report remains unresolved. Those legacy addresses are not a cutover solution. Supply reviewed replacements as a JSON filename-to-URL mapping:

```sh
node scripts/publii/run.mjs --iso-links /path/to/reviewed-iso-links.json
```

Publii `#INTERNAL_LINK#/file` markers in PDF download links are resolved to the staged media addresses. Both Markdown ISO links are rewritten, while shell examples naming the downloaded files remain unchanged. Unknown custom HTML or block shapes are explicitly marked for review; they never silently count as a clean conversion.

## Verification

The fixtures create their own SQLite database, media files and output directories under a unique temporary directory. They never open the user's Publii database or application persistence:

```sh
pnpm test:migration
```

That is both suites, the Node one and the Python one, and `pnpm test` runs it after the workspaces. Before 21 September 2026 neither ran anywhere except by hand, so a broken converter would have been reported by nothing.

Tests cover the full raw body, visibility, original paths and dates, translation links, collision handling, ISO exclusion, original checksums, deterministic reruns, unsupported forms, Markdown embeds outside code fences, source-directory protection, published nested paths from the actual legacy output, both PDF file markers, source-bound language review, responsive sizes, placeholders, corrupted originals and real content validation.

Before cutover, run against the final stable source copy, review languages and all remaining conversion decisions, perform the separately authorized database/S3 import, verify uploaded checksums and variants, and complete the address inventory against the live site. The local pipeline provides the artifacts for those steps; it does not claim to have performed them.

## Local website review

The website now renders the exported content through the shared content-language renderer. It includes language-aware entry pages, configurable ordered home blocks, projects/posts/topic/archive collections, GET-based search and pagination, persistent grid/list choice, feeds and a sitemap. Hidden entries answer at their own addresses but do not enter collections or feeds. Drafts, trash and protected entries fail closed.

Set `WEBSITE_CONTENT_FILE` to the absolute private snapshot filename when running the website. There is no implicit empty-content fallback. A missing or invalid snapshot returns 503 with an error identifier. This is a migration-preview source, not yet the final database-backed publishing path. Dashboard navigation, home-block and reading-width editors are not wired to it. Password entry for protected content remains a separate unfinished acceptance criterion.

The production build can also be rendered without starting a server:

```sh
WEBSITE_CONTENT_FILE=/absolute/migration-out/site.json \
  pnpm preview:website --out /absolute/empty/website-preview
```

The script builds the website together with every workspace package it depends on, then renders. The website resolves `@layered/ui` and its siblings through their built `dist` output, so a render started without that build silently publishes the previous version of a shared component whilst the source already carries the new one.

The output is suitable for the existing design-proposal server, using `/website-preview/`. The exporter refuses to overwrite an existing destination. It does not copy the private snapshot or raw exports. Arbitrary searches require the SSR server; the static preview includes representative real search responses. Static hosting cannot reproduce the actual 404/redirect status or response headers, which the tool checks directly on Astro's production response instead.

Verified on 20 September 2026: 95 routes, 42 historical HTML addresses, 30 redirects ending successfully, 104 preserved heading anchors, four private-entry 404s, 45 collections without hidden entries, and both feeds blocked before launch. The legacy `/tags/<slug>/` addresses redirect to `/topics/<slug>/`; `/tags/` redirects to `/topics/`; `/authors/frank-gregor/` redirects to `/`; `/page/<number>/` redirects to `/archive/?page=<number>`; the old font-preview file address redirects to its inventoried media path. German redirects are listed in `site.json`; English project addresses retain `/projects/<slug>/`.

Chrome measured the header, main and footer at the same 1180px width on a 1440px viewport. No horizontal overflow occurred at 390px or 1440px. The 3D model loaded and measured 653.13 by 408.20px, matching its 16:10 ratio. Grid/list selection survived reload. With Fast 4G and 4x CPU throttling, the static production homepage recorded LCP 820ms, two long animation frames and zero JavaScript bytes; the tested article recorded LCP 608ms, one long animation frame and 2,156 JavaScript bytes. These figures exclude live SSR latency and do not claim to satisfy the final deployed performance gate. The model viewer is loaded only when a model approaches the viewport; its separate bundle is approximately 1MB.

Following the local review, project and post pages use the full inner page width, including their article headings. Chrome verified both page types at 1092px on a 1440px viewport and 350px on a 390px viewport, with no horizontal overflow. This supersedes the narrower reading measure used for the model measurement above.

The model viewer uses Google's `@google/model-viewer` under Apache-2.0. The original license is copied to `/model-viewer-license.txt` by asset preparation.
