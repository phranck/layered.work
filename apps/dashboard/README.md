# Editorial dashboard

Vite builds the React application to `dist/`. React Router data routes share the sidebar's area registry; unknown paths show a not-found screen. Domain editors remain separate issues.

The sidebar uses shared Sidebar, Section, Row and Logo compounds and the prototype's workbench tokens. TanStack Query reads the signed-in identity and authenticated database counts. Unavailable storage domains have no badge, and a failed count shows an error rather than a zero.

The sidebar keeps its width and the order of its groups between visits, in local storage under `layered:dashboard:sidebar-width` and `layered:dashboard:sidebar-order`. A group is moved by dragging its title, or from the keyboard with the arrow keys on its grip. The order is stored as group ids, so a group added later appears at the end and a removed one is ignored.

## The bar

A bar runs across the top of the content, right of the sidebar, and stays in place whilst the screen below it scrolls (`AppBar` in the UI package). Its height is `--app-bar-height`, a control with `--workbench-gutter` above and below it, and the sidebar's mark is centred on the same line. That gutter is the one spacing of the frame: the padding all round the bar, the sidebar's padding, the content area's padding, and the gaps between the parts of a screen. A screen puts things into it with `HeaderStart`, `HeaderCenter` and `HeaderEnd` from `src/app-bar-slots.tsx`, which render into the bar through portals and so read the screen's own state. The start holds the way back or the group the screen belongs to, the centre what just happened, and the end the screen's actions.

## Entry lists

Posts, pages and projects are one screen with a different kind. It reads `GET /entries?kind=…`, which returns one row per translation, newest first. The search field and the state and language filters narrow that list in the browser, and the figures above it are counted from the rows the table shows. A row opens the entry at `/<area>/<translation id>`.

Every list of records in the dashboard is drawn by `Table` (`src/table.tsx`), which carries this list's shape: topics, forms, mail templates, submissions, access tokens, named values, social media accounts, both navigations, the home page's blocks and a picture's sizes. Every row is one line, and a value that would stand under a title has a column of its own. A column's kind sets its width and alignment, a row that opens something is the target as a whole by pointer and by keyboard, and the search field in a card's header walks into the rows with the arrow keys. A table ordered by hand has a grip at the start of each row, which is dragged or moved with the arrow keys. A switch or a button in a row acts on its own and does not open the row. A state is a badge in the tone of what it means, and a card without rows says so in the same way everywhere.

## Entry editor

An open entry is written in CodeMirror 6 (`src/content-editor.tsx`), which parses with the content language's own Lezer extension, so the editor's tree is the server's tree. The toolbar inserts Markdown, and it inserts every component of the register (`src/editor-toolbar.ts`). Every tool is an icon whose tooltip and accessible label name what it inserts, and a register component without an icon fails the type check.

The surface colours what is written from the same tree (`src/content-highlight.ts`), with the workbench's `--md-*` scheme: component names, argument names, strings, values and the language's punctuation each have their own colour, Markdown is coloured as Markdown, and a component the parser could not read is underlined. Completion (`src/content-completion.ts`) reads the register as well. At the start of a line it offers the components that may stand there, which inside a `Table` are its parts. Inside the brackets it offers the parameters not yet written, and after a colon it offers the values of a closed set. A table's columns are offered the fields its rows carry, and its rows the fields its columns show. A chosen component arrives as a snippet whose open places Tab moves between.

A table's rows follow its columns as they are written (`src/table-sync.ts`). Adding a column gives every row its field, after the field of the column before it. Removing a column takes its field out of every row, unless another column still shows it. Changing a column's field renames it in every row, with the values kept, including while the new name is typed letter by letter. The rows change in the same transaction as the edit that caused them, so one undo takes back both.

The entry's state, Save and Publish stand at the end of the bar, and the way back at its start with the entry's title after it. Unsaved changes show in the warning tone. On a window wide enough for the panel to stand beside the text, the editor fills the height below the bar: the writing surface ends one padding step above the window's edge and its text scrolls inside it, and the panel starts directly under the bar and scrolls inside itself. The panel holds the state, the language, the linked translation, the reading width and the topics. A project's panel also holds its specification, the pairs of a label and a value its page shows under the picture, and a pair missing either half cannot be saved. `GET /entries/:id` opens a translation and `PUT /entries/:id` saves it, and each save is written to the audit log. A draft saves itself two seconds after typing stops. A change the save would remove again, such as a space at the end of the title, does not count as unsaved. A public or hidden entry is saved by hand, because a save there changes what readers see. Leaving with unsaved changes asks first, both inside the dashboard and when the tab closes. The Preview button under the state opens the entry as the editor holds it, unsaved changes included, in a new window at the site's `/preview/<token>/`. The window opens on the click itself, because Safari blocks one opened after a request returns. `docs/content-and-addresses.md` describes the link.

## Search

Command-K on an Apple platform and Control-K elsewhere takes the reader to the search for the screen they are on. On an entry list it focuses the list's own field, which matches titles and topic names. The arrow keys move into the rows, and Escape gives the focus back. On a screen without a list it opens a dialog that asks `GET /search?q=…` for entries by title and topic and for media by slug and alt text. The shortcut does nothing whilst another text field has focus.

Command-S on an Apple platform and Control-S elsewhere saves wherever a screen has a Save button: the entry editor, the block panel, each settings card and the account dialog (`src/save-shortcut.tsx`). It runs exactly what the button runs and does nothing while the button is disabled. A dialog over a screen is the one saved. The shortcut never opens the browser's own Save Page dialog inside the dashboard, also where nothing can be saved.

## Home page

The Blocks area arranges the home page. The table of blocks and the settings of the open one stand side by side in the same `Editor` the entry editor uses. A row shows the block's type and a summary read from its settings, so the summary changes when a setting does, and a click on the row opens its settings. A block is moved by its grip, switched off without losing its settings, added from the types at the foot of the card, and removed after a question. The hero opens the page, so it cannot be moved, removed or added a second time, and a lock stands where its remove button would be.

The panel draws its fields from the block's declaration in `@layered/schemas` (`HOME_BLOCKS`), so a setting added there appears here with no other edit (`src/home-block-settings.tsx`). A text is written in both languages. Left empty, the site shows the text the field offers as its placeholder. A draft is checked against the same declaration the API checks, and a refused value names its setting. Every author sees the blocks, and only the owner can change them.

## Settings

The System group's three areas are the three groups of the site's settings, each a card with its own save. A settings card stands alone on its screen, so it stops at the form measure (`--form-measure`) rather than stretching across the window. Settings holds the site's title and footer line in both languages, its default language, the fallback picture for social cards and the watermark. The watermark is the site's wordmark unless a picture from the library is chosen, and changing it derives every watermarked picture again. SMTP2GO holds the sender address and name, shows whether `SMTP2GO_API_KEY` reached the API, and sends a test message to the signed-in owner's own address, reporting SMTP2GO's answer. Umami states the instance and holds the website ID. Every author can read them, and only the owner can change them. A draft is checked against the same schema the API uses, so a refused field says why. The key itself is a secret variable on the backend service and never passes through the dashboard.

## Interface language

Every string the interface shows comes from the catalogue in `src/dashboard-i18n.ts`, in German and in English. The English catalogue is typed from the German one, so `pnpm --filter @layered/dashboard typecheck` fails when a key exists in one language only. A signed-in author sees the language their account names. The sign-in screen follows the browser, because no account is known yet. A failure the API returns is shown as the dashboard's own sentence for its error code, followed by the request ID, because the API's message is English and written for any caller.

## Bilingual texts

A text the site shows in both languages is edited one language at a time. Every card or dialog that holds such texts has a switch in its header, and its fields show the chosen language only. What was typed in the other language stays in the draft, so switching back shows it unchanged, and a save sends both. The switch starts on the interface language, and each card keeps its own choice. A mail template's preview and test message go out in the language the switch shows. The choice is kept in `src/text-language.tsx`, and the switch and the fields that read it are drawn in `src/translated.tsx`.

## Development and verification

The dashboard is registered in `grat.config` on port 4502. Inspect local service state with `grat status`. Browser requests always use the same-origin `/api/` prefix. Vite forwards it to `http://localhost:4002` during development; nginx forwards it to `http://backend:3000` over the Zerops private network in production. `API_ORIGIN` selects that upstream and is never a browser URL. nginx preserves the incoming edge forwarding chain so the existing per-client sign-in limiter still identifies the original caller. Calling the public Zerops API from this proxy would add extra hops and must not replace the private upstream.

The session cookie remains HttpOnly, Secure in production, host-only and SameSite=Lax. The proxy leaves cookie attributes and backend error bodies unchanged. Transport failures return a safe JSON error with a request ID. Protected routes check the session and account profile before rendering and on navigation; sign-in restores a validated internal destination. The account dialog edits the profile, chooses an existing portrait from the media library, applies the saved interface language immediately and provides sign-out. The button at the right end of the sidebar's account row signs out as well, through the same action.

```sh
pnpm --filter @layered/dashboard typecheck
pnpm --filter @layered/dashboard test
pnpm --filter '@layered/dashboard...' build
```

Frontend tests use a memory router and mocked API responses. The deployment test writes shared assets and nginx configuration into its own temporary directory. Neither suite accesses a database.

nginx serves the generated application and falls back to `index.html` for client routes. Missing application bundles return 404. Fonts, the original logo and brand masks are copied from the shared UI assets; complete runtime dependency licences are retained in `DEPENDENCY_LICENSES.txt`.
