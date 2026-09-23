# What the website reads, and which addresses it answers

The content itself is migrated from the old Publii site by a pipeline that stays on one machine and is not part of this repository. What belongs here is the shape that pipeline produces, because the website parses it, and the addresses the site has to keep answering, because its route implements them.

## The content snapshot

The snapshot contains arrays named `entries`, `topics`, `media`, and `redirects`.

Entries expose `id`, `title`, `slug`, `path`, `language`, `visibility`, `kind`, `publishedAt`, `updatedAt`, `summary`, `body`, `topics`, `featuredImage`, `translationPath`, `featured`, `onHomePage`, `readingWidth`, and `template`. Dates are ISO strings or null. Image and translation references are nullable. `body` is complete Markdown with content components, rather than the prototype's truncated paragraphs.

Visibility is `public`, `hidden`, `draft`, or `trashed`. All 21 records remain in the aggregate so the report can account for them; route and listing policies exclude drafts and trash, and exclude hidden entries from public listings. An `excluded_homepage` flag yields `onHomePage: false`.

The source's `is-page` remains in the raw export. The actual portfolio entries `next-soundbox`, `gimli`, `pandadock`, and `touch-magic`, plus the project drafts `cube`, `next-megapixel`, and `ono`, normalize to `kind: project`. This follows the portfolio selection in `prototype/shared/proto.js`. The `projects` overview remains a page and its body remains available.

Existing English paths come from the generated Publii output and remain unchanged, including `/projects/next-soundbox/`, `/projects/pandadock/`, and `/projects/touch-magic/`. When an entry has never been generated, its draft path defaults to `/<slug>/`. German paths become `/de/<slug>/`. All four previously published German paths, including `/projects/gimli/` and the hidden translation entries, receive redirects. The bare `/gimli/` alias also redirects. The original `<lang>` elements become `translationPath`, with their presentation removed from the body. New-entry language prefix rules belong to the publishing system and do not rewrite these legacy English paths.

Topics expose `id`, `slug`, and `name`. Media expose `slug`, `src`, `mime`, `filename`, `source`, `bytes`, and `sha256`; images also receive dimensions, responsive `srcSet`, and a WebP data-URL placeholder when variants are generated. Existing alt text is preserved. Missing alt text is reported rather than invented.

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
| `/tags/<slug>/` | 308 to `/topics/<slug>/` | Same subject, new prefix, for every topic the snapshot still carries. |
| `/authors/frank-gregor/` | 308 to `/` | There is one author and the new site has no author page, so the home page is the nearest real answer. |
| `/page/<number>/` | 308 to `/posts/?page=<number>` | Publii paginated the home page's post list at these addresses, so the posts listing is where they belong. Pagination moved from the path into the query, where the listing reads it. |
| `/media/files/claude-fonts-preview.html` | 308 to the staged media address | The file survives the migration under its media slug. |
| `/feed.xml`, `/feed.json`, `/sitemap.xml`, `/robots.txt` | 200 | These keep their addresses exactly. |
| The six addresses in `legacy-redirects.json` | 308 | Observed in the Internet Archive, absent from the final output. Each row carries its own reason. |
| `/404.html` | 404 | Publii served its error page at a real address. Nothing links to it and a redirect would only disguise the status. |

Two things are deliberately outside this list. Static assets such as the favicons, the web manifest and the images under `/media/` are not page addresses and are not crawled by the check. The old site had no search page: its search ran in the browser on the pages themselves, so there is no address to preserve.

The trashed entry `happy-birthday` needs no redirect. Publii does not generate a trashed entry, so `/happy-birthday/` is absent from the final output, and the Internet Archive has no record of that address at all. It never answered, so nothing points at it.

Verified on 21 September 2026: the preview renderer checked 42 legacy addresses and the six archived ones, and reported 36 redirect targets returning 200, four private entries returning 404 and no other status.
