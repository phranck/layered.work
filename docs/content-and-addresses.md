# What the website reads, and which addresses it answers

The content was migrated from the old Publii site by the pipeline in `scripts/publii/`. It reads a Publii database that lives on one machine, and the pipeline itself is in this repository, because it is the only reproducible description of how the old site became this one. What belongs here besides it is the shape of the snapshot the website parses, and the addresses the site has to keep answering, because its route implements them.

## Where an article's text lives

**The database decides what an article says.** The dashboard edits it, and the site asks the backend for it on every render. Two files hold an earlier copy of the same text, and neither can write it back:

| Source | What it is | What it may still do |
| --- | --- | --- |
| The database | The content, edited in the dashboard | Everything |
| `apps/website/content/site.json` | What the site reads from the local database, written by `db:snapshot` | The site reads it only when the backend is unreachable or holds no entries. `db:import` loads it into an empty database |
| `migration-out/site.json` | The pipeline's output, drafts included, on the machine that ran it | `db:import --drafts-from` takes the drafts from it, and only into an empty database |

`db:import` refuses a database that already holds entries, because the snapshot would overwrite everything written in the dashboard since and the run would still look successful. Nothing writes the committed snapshot from the pipeline's output, because a rerun would undo the corrections made since the cutover, such as #202 and #205.

The file is written from the local database, because that is the one production is overwritten from (`docs/hosting.md`), and never by hand:

```bash
pnpm --filter @layered/backend db:snapshot
```

It writes `readPublicSnapshot`, the same function the backend answers `/content/snapshot` with, so the fallback says what the site says. Run it after changing content locally and before the local database is pushed to Zerops. It refuses a database holding no entries, which would leave the site nothing to fall back to. It was last written on 7 October 2026.

## The content snapshot

The snapshot contains arrays named `entries`, `topics`, `media`, `redirects`, and `gone`. `gone` lists the addresses that answer 410, because their entry is in the trash or was deleted from it. Beside them, `listings` holds how the overviews of posts and projects are set up in the dashboard: entries per page, columns, a headline and an introduction per language, and the preview length. A snapshot without it, such as the migration output, uses the defaults. The snapshot also carries the forms its entries embed, the home page's blocks, the navigations and the site's frame.

Entries expose `id`, `title`, `slug`, `path`, `language`, `visibility`, `kind`, `createdAt`, `publishedAt`, `updatedAt`, `summary`, `body`, `topics`, `featuredImage`, `socialImage`, `translationPath`, `featured`, `onHomePage`, `readingWidth`, `showInOtherLanguage`, and `specs`. `showInOtherLanguage` lists a public entry in the other language's listings, feeds and search as well, marked with its language, whilst that language has no published version of it. `specs` holds a project's specification pairs, each a `label` and a `value`, in the order the band under the project's picture shows them. Dates are ISO strings or null. `createdAt` and `updatedAt` belong to the entry, so both languages of one carry the same two. Image and translation references are nullable. `body` is complete Markdown with content components, rather than the prototype's truncated paragraphs.

Visibility is `public`, `hidden`, `draft`, or `trashed`. All 21 records remain in the aggregate so the report can account for them; route and listing policies exclude drafts and trash, and exclude hidden entries from public listings. An `excluded_homepage` flag yields `onHomePage: false`.

The source's `is-page` remains in the raw export. The actual portfolio entries `next-soundbox`, `gimli`, `pandadock`, and `touch-magic`, plus the project drafts `cube`, `next-megapixel`, and `ono`, normalize to `kind: project`. This follows the portfolio selection in `prototype/shared/proto.js`. The `projects` overview remains a page and its body remains available.

Existing English paths come from the generated Publii output and remain unchanged, including `/projects/next-soundbox/`, `/projects/pandadock/`, and `/projects/touch-magic/`. When an entry has never been generated, its draft path defaults to `/<slug>/`. German paths become `/de/<slug>/`. All four previously published German paths, including `/projects/gimli/` and the hidden translation entries, receive redirects. The bare `/gimli/` alias also redirects. The original `<lang>` elements become `translationPath`, with their presentation removed from the body. New-entry language prefix rules belong to the publishing system and do not rewrite these legacy English paths. The editor changes the last segment of an address and nothing before it, so a legacy English entry keeps its bare path and a project keeps `/projects/`. The address it leaves stays in `paths` as a former one and redirects with 308.

The slugs `posts`, `pages` and `projects` belong to the site, at the root and under `/en/` and `/de/` (`RESERVED_SLUGS` in `packages/schemas/src/settings.ts`). No entry can take one of those addresses, and deleting an entry never marks one as gone. Publii's `/projects/` was a page holding the text above the projects. The import writes such a page as the introduction of that overview rather than as a page, and leaves an introduction alone once one has been written in the dashboard. On this site the text reads "Random selection of some of my projects. The topics range from woodworking and 3D printing to some electronics."

Topics expose `id` and, under `translations`, a `slug` and a `name` in each language that has one, `null` in the other. Media expose `slug`, `src`, `mime`, `filename`, `source`, `bytes`, and `sha256`, where `src` is the file's storage key behind a slash and `source` the key itself. Images also carry their dimensions, a `srcSet` of storage keys, a `focalPoint`, a WebP data-URL `placeholder`, and under `translations` the alt text and caption in each language. Missing alt text is reported rather than invented.

Media slugs come from filenames. Collisions receive the owning entry ID or containing directory, then a stable path hash if necessary. Every source file except the two ISOs is copied byte-for-byte and verified. The two NeXTSTEP images those ISOs held are 740 MB that exist elsewhere, so the two posts offering them link to the Internet Archive item `NeXTSTEP33CISC` instead. The pipeline carries that mapping from ISO filename to external address and applies it without being asked, because a run that misses it writes dead download links and says so only in its own report. Responsive variants are generated separately with the Sharp version already supplied by Astro; originals are never resized or replaced. Existing Publii responsive images and thumbnails are preserved but do not spawn further variants.

## Addresses and redirects

The list of addresses the old site answered comes from what it actually served, not from the database. Two sources produce it, because neither is complete on its own.

The generated Publii output in `~/Documents/Publii/sites/layeredwork/output` is what the site published on its final day, and `legacy-addresses.json` inventories its 42 HTML addresses. `node apps/website/tools/render-preview.mjs --legacy-output <that directory>` requests every one of them against the production build and fails when any ends anywhere other than 200.

That output cannot contain an address the site stopped generating earlier, and such an address is still written down in bookmarks and in other people's posts. The Internet Archive holds the record of those, and six of them answered 200 whilst the current output has no page for them. They live in `apps/website/src/content/legacy-redirects.json`, each with its target, its reason and the date it was last observed answering. The route reads that file and so does the preview renderer, so neither can drift from the other. Adding an address means adding it there and nowhere else.

| Address | Answer | Reason |
| --- | --- | --- |
| Every English entry, at the path it had | 200 | The English paths are unchanged, which is the whole point of the scheme. |
| `/projects/gimli/`, `/gimli/`, `/website-design-die-zweite/`, `/nextstep-on-rpi5-de/`, `/ki-bedienungsanleitung/` | 308 to `/de/<slug>/` | The four German entries move under the language prefix. The two publicly listed ones were linked, and the two hidden ones stay reachable the same way. |
| `/tags/` | 308 to `/topics/` | The section is called Topics now. |
| `/tags/<slug>/` | 308 to `/topics/<slug>/` | Same subject, new prefix, for every topic the snapshot still carries. A topic renamed or merged since then is reached in one step at its current address. |
| `/topics/<former>/`, `/de/topics/<former>/` | 308 to the topic's current address | An English address a topic gave up when its address was changed or when it was merged into another. The dashboard keeps it in `former_topic_slugs`, and the snapshot turns it into a redirect. |
| `/authors/frank-gregor/` | 308 to `/` | There is one author and the new site has no author page, so the home page is the nearest real answer. |
| `/page/<number>/` | 308 to the posts listing page holding the same posts | Publii paginated the home page's post list at these addresses, eight posts to a page, so the posts listing is where they belong. It shows as many to a page as its settings in the dashboard say, twelve by default, so the number is converted with that page size rather than kept: at twelve, `/page/2/` lands on `/posts/`. Pagination moved from the path into the query, where the listing reads it. |
| `/media/files/claude-fonts-preview.html` | 308 to the staged media address | The file survives the migration under its media slug. |
| `/feed.xml`, `/feed.json`, `/sitemap.xml`, `/robots.txt` | 200 | These keep their addresses exactly. |
| The six addresses in `legacy-redirects.json` | 308 | Observed in the Internet Archive, absent from the final output. Each row carries its own reason. |
| Every address of an entry in the dashboard's trash, or deleted from it for good | 410 | The entry was here and is gone, which tells a search engine to drop the address rather than retry it. The page offers the home page and the search. An address of an entry deleted for good stays in `gone_paths`, and one given to a new entry later belongs to that entry. |
| `/404.html` | 404 | Publii served its error page at a real address. Nothing links to it and a redirect would only disguise the status. |

Two things are deliberately outside this list. Static assets such as the favicons, the web manifest and the images under `/media/` are not page addresses and are not crawled by the check. The old site had no search page: its search ran in the browser on the pages themselves, so there is no address to preserve.

The trashed entry `happy-birthday` needs no redirect. Publii does not generate a trashed entry, so `/happy-birthday/` is absent from the final output, and the Internet Archive has no record of that address at all. It never answered, so nothing points at it.

Verified on 2 October 2026: the preview renderer checked 42 legacy addresses and the six archived ones, and reported 36 redirect targets returning 200, four private entries returning 404 and no other status. Rendering from the database's snapshot gives the same 36 redirect targets.

## Previews

`/preview/<token>/` shows one entry as the editor held it when its Preview button was pressed, unsaved changes included, in whatever state the entry is. The dashboard sends the editor's title, summary, text and reading width to `POST /entries/:id/previews`, which keeps them in `entry_previews` for an hour and answers with the address. The site asks `GET /previews/<token>` for the entry and renders it with `EntryArticle`, the same component the published page renders.

The token names one preview and is signed with a key derived from `SESSION_SECRET` for this purpose alone. A forged, altered or expired token gets the same 404 page. A preview answers before the launch as well. It is sent with `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store` and `Referrer-Policy: no-referrer`, because its address carries the token, and it never appears in the snapshot, the sitemap, a feed or a listing.

## Getting the content into a database

`db:import` writes the committed snapshot into the database `DATABASE_URL` names, which has to be empty. It writes the entries, the topics, the library with every picture's sizes, the overviews' settings, the forms and the addresses that answer 410. A form arrives keeping its submissions in the dashboard and sending no mail, because the snapshot does not say where its mail went. The sizes are measured from the files in `MEDIA_LOCAL_DIR`, at their storage keys. Navigations, home page blocks and the site's frame are set in the dashboard and are not imported. Imported into an empty database on 7 October 2026 and written out again, the committed snapshot came back the same apart from the generated ids and the home page's blocks.

That snapshot holds no drafts, because it sits in this public repository, so the drafts come from the migration output on the machine that produced it. Only entries that are drafts and absent from the committed file are taken from there, so every editorial correction made since stands.

```bash
pnpm --filter @layered/backend db:import --drafts-from ../../migration-out/site.json
```

Publii copied some files into several post directories, and the migration gave each copy its own slug. The database holds a file once, by checksum. The import therefore keeps the first slug and rewrites every body that names another copy to name the kept one, so no picture goes missing when the site reads from the database. The size copies Publii made of every picture stay out of the library, because this site generates its own.

## Proving nothing was lost

The local checks compare the old site with the new one, and both read everything rather than a sample. Neither writes anything or sends a request off the machine. The bucket check below additionally asks Zerops object storage about every key in the local database's library.

```bash
pnpm --filter @layered/backend db:verify --snapshot-out /tmp/database-snapshot.json
pnpm --filter "@layered/website..." build
WEBSITE_CONTENT_FILE=/tmp/database-snapshot.json node apps/website/tools/verify-migration.mjs --media-paths-out /tmp/rendered-media.json
pnpm --filter @layered/backend db:verify-bucket --media-paths /tmp/rendered-media.json
```

`db:verify` reads the Publii database at `~/Documents/Publii/sites/layeredwork/input` and the database `DATABASE_URL` names. It compares the counts, and for every regular entry its address, state, title, date and topics. The former `/projects/` page became the project listing's introduction, so that introduction is checked separately rather than counted as an entry. The command also writes what the site would read from that database. `verify-migration.mjs` renders every public and hidden entry plus the former overview page from that file through the production build, compares their text with the old pages, and checks internal links and rendered media against local source bytes and the snapshot's checksums. Both exit with a non-zero status when something differs that is not an explained text difference.

`db:verify-bucket` runs the same comparison with the dedicated `ZEROPS_S3_*` credentials in the ignored `.env.local`. It requires `DATABASE_URL` to name the local database and checks every library storage key in the Zerops bucket. With `--media-paths`, it also checks every distinct storage key named by rendered pages, including legacy download links outside the media library. The render check writes those paths only after it finds no broken page or file. In a separate worktree, set `MEDIA_LOCAL_DIR` to the absolute path of the primary checkout's `media-local/` before the render check.

### The counts

Measured on 4 October 2026 against the local database and the Zerops bucket.

| What | Publii | Database |
| --- | ---: | ---: |
| Entries, public | 14 | 14 |
| Overview introductions | 1 | 1 |
| Entries, hidden | 2 | 2 |
| Entries, draft | 3 | 3 |
| Entries in the trash | 1 | 0 |
| Topics | 23 | 23 |
| Topic assignments | 30 | 30 |
| Media, distinct contents | 205 | 77 |

The entry in the trash, `happy-birthday`, stays out by decision. Publii's media directory holds 228 files. Two are the NeXTSTEP disk images, which are linked to the Internet Archive instead, and 21 duplicate a file already counted, which leaves 205 distinct files. 125 of them are the size copies Publii made of every picture, in a `responsive` directory beside each one or as a gallery thumbnail. This site generates its own variants, so the import leaves the copies out of the library, and they would otherwise show every picture several times over. Publii's bodies name them in their `srcset`, which is why the check identifies them by where they lie rather than by whether a body names them. Three further files are not in the database, and no post names any of them: the two `svg-map.svg` files of Publii's share and follow plugins, and `website/LAYERED-Logo-Transparent.svg`, the old site's logo.

All 19 regular migrated translations have the state, title, date and topics they had in Publii, at the address the rules above give them. The twentieth non-trashed source page is `/projects/`; its text is the project listing introduction and is checked in the rendered-page comparison.

### The text of every entry

The 16 entries a reader can open and the former `/projects/` page, compared word by word with the old page. Every internal link in them resolves, and no page shows a placeholder for a missing file. The render check examined 72 media references against local source bytes and snapshot checksums where the library has one. They resolve to 68 distinct storage keys, including three legacy downloads absent from the library. The bucket check found all 68 rendered objects and every one of the local library's 78 storage keys.

| Entry | Words before | Words after | What differs |
| --- | ---: | ---: | --- |
| `/projects/next-soundbox/` | 902 | 717 | The old page printed the Mermaid source of the signal chain as text, which is the picture `schematic-7` now. It printed the parts table as raw Markdown, so its bars and link syntax are gone and the part numbers remain as link text. The model's description is new text. |
| `/projects/` | 18 | 18 | The address is the projects overview, and the page's two sentences are its introduction. |
| `/swift-dont-use-nested-ternary-operators/` | 587 | 587 | Nothing. |
| `/de/gimli/` | 372 | 372 | Nothing. |
| `/next-mini-replica-interest/` | 376 | 281 | The interest form is not on the page. The site renders no forms yet. |
| `/projects/pandadock/` | 1054 | 1011 | The old page printed both tables as raw Markdown, which are tables now. The embedded YouTube video is a link carrying the video's title. |
| `/mastodon-a-new-love/` | 437 | 437 | Nothing. |
| `/projects/touch-magic/` | 428 | 444 | The model's description is new text. |
| `/de/website-design-die-zweite/` | 783 | 793 | The embedded font overview is a link carrying its title, and the model's description is new text. |
| `/de/nextstep-on-rpi5-de/` | 1656 | 1661 | The link to the English version is the language switch. The copy command names the disk image's real file name, corrected after the migration. The embedded video is a link carrying its title. |
| `/nextstep-on-rpi5-en/` | 1672 | 1677 | The same three differences as its German counterpart. |
| `/rpi5-with-external-leds/` | 719 | 722 | The embedded YouTube video is a link carrying the video's title. |
| `/de/ki-bedienungsanleitung/` | 488 | 485 | The link to the English version is the language switch. |
| `/ai-operating-guide/` | 530 | 527 | The link to the German version is the language switch. |
| `/nextstep-naming/` | 271 | 272 | A table cell held a line break, which a Markdown table cannot, so the two names in it are separated by a slash. |
| `/editor-cheat-sheets/` | 383 | 403 | The old tables had no header row. A Markdown table needs one, so each of the ten carries `Action` and `Keys`. |
| `/swiftui-platform-viewmodifier/` | 514 | 514 | Nothing. |

The comparison reads curled and straight quotation marks as the same character. Publii curled the straight marks its authors typed when it rendered a page, so the difference belongs to the old renderer and not to what was written. A code block's language label and line numbers are not counted either, because the author did not write them.
