# Editorial dashboard

Vite builds the React application to `dist/`. React Router data routes share the sidebar's area registry; unknown paths show a not-found screen. Domain editors remain separate issues.

The sidebar uses shared Sidebar, Section, Row and Logo compounds and the prototype's workbench tokens. TanStack Query reads the signed-in identity and authenticated database counts. Unavailable storage domains have no badge, and a failed count shows an error rather than a zero.

The sidebar keeps its width and the order of its groups between visits, in local storage under `layered:dashboard:sidebar-width` and `layered:dashboard:sidebar-order`. A group is moved by dragging its title, or from the keyboard with the arrow keys on its grip. The order is stored as group ids, so a group added later appears at the end and a removed one is ignored.

## Entry lists

Posts, pages and projects are one screen with a different kind. It reads `GET /entries?kind=…`, which returns one row per translation, newest first. The search field and the state and language filters narrow that list in the browser, and the figures above it are counted from the rows the table shows. A row opens the entry at `/<area>/<translation id>`.

## Entry editor

An open entry is written in CodeMirror 6 (`src/content-editor.tsx`), which parses with the content language's own Lezer extension, so the editor's tree is the server's tree. The toolbar inserts Markdown, and it inserts every component of the register (`src/editor-toolbar.ts`). Every tool is an icon whose tooltip and accessible label name what it inserts, and a register component without an icon fails the type check.

The surface colours what is written from the same tree (`src/content-highlight.ts`), with the workbench's `--md-*` scheme: component names, argument names, strings, values and the language's punctuation each have their own colour, Markdown is coloured as Markdown, and a component the parser could not read is underlined. Completion (`src/content-completion.ts`) reads the register as well. At the start of a line it offers the components that may stand there, which inside a `Table` are its parts. Inside the brackets it offers the parameters not yet written, and after a colon it offers the values of a closed set. A table's columns are offered the fields its rows carry, and its rows the fields its columns show. A chosen component arrives as a snippet whose open places Tab moves between.

A table's rows follow its columns as they are written (`src/table-sync.ts`). Adding a column gives every row its field, after the field of the column before it. Removing a column takes its field out of every row, unless another column still shows it. Changing a column's field renames it in every row, with the values kept, including while the new name is typed letter by letter. The rows change in the same transaction as the edit that caused them, so one undo takes back both. The panel beside the text holds the state, the language, the reading width, the linked translation and the topics, and it stays in view whilst the text scrolls. `GET /entries/:id` opens a translation and `PUT /entries/:id` saves it, and each save is written to the audit log. A draft saves itself two seconds after typing stops. A public or hidden entry is saved by hand, because a save there changes what readers see. Leaving with unsaved changes asks first, both inside the dashboard and when the tab closes. The Preview button under the state opens the entry as the editor holds it, unsaved changes included, in a new window at the site's `/preview/<token>/`. The window opens on the click itself, because Safari blocks one opened after a request returns. `docs/content-and-addresses.md` describes the link.

## Search

Command-K on an Apple platform and Control-K elsewhere takes the reader to the search for the screen they are on. On an entry list it focuses the list's own field, which matches titles and topic names. The arrow keys move into the rows, and Escape gives the focus back. On a screen without a list it opens a dialog that asks `GET /search?q=…` for entries by title and topic and for media by slug and alt text. The shortcut does nothing whilst another text field has focus.

Command-S on an Apple platform and Control-S elsewhere saves wherever a screen has a Save button: the entry editor, each settings card and the account dialog (`src/save-shortcut.tsx`). It runs exactly what the button runs and does nothing while the button is disabled. A dialog over a screen is the one saved. The shortcut never opens the browser's own Save Page dialog inside the dashboard, also where nothing can be saved.

## Settings

The System group's three areas are the three groups of the site's settings, each a card with its own save. Settings holds the site's title and footer line in both languages, its default language and the fallback picture for social cards. SMTP2GO holds the sender address and name, shows whether `SMTP2GO_API_KEY` reached the API, and sends a test message to the signed-in owner's own address, reporting SMTP2GO's answer. Umami states the instance and holds the website ID. Every author can read them, and only the owner can change them. A draft is checked against the same schema the API uses, so a refused field says why. The key itself is a secret variable on the backend service and never passes through the dashboard.

## Interface language

Every string the interface shows comes from the catalogue in `src/dashboard-i18n.ts`, in German and in English. The English catalogue is typed from the German one, so `pnpm --filter @layered/dashboard typecheck` fails when a key exists in one language only. A signed-in author sees the language their account names. The sign-in screen follows the browser, because no account is known yet. A failure the API returns is shown as the dashboard's own sentence for its error code, followed by the request ID, because the API's message is English and written for any caller.

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
