# Editorial dashboard

Vite builds the React application to `dist/`. React Router data routes share the sidebar's area registry; unknown paths show a not-found screen. Domain editors remain separate issues.

The sidebar uses shared Sidebar, Section, Row and Logo compounds and the prototype's workbench tokens. TanStack Query reads the signed-in identity and authenticated database counts. Unavailable storage domains have no badge, and a failed count shows an error rather than a zero.

The sidebar keeps its width and the order of its groups between visits, in local storage under `layered:dashboard:sidebar-width` and `layered:dashboard:sidebar-order`. A group is moved by dragging its title, or from the keyboard with the arrow keys on its grip. The order is stored as group ids, so a group added later appears at the end and a removed one is ignored.

## Entry lists

Posts, pages and projects are one screen with a different kind. It reads `GET /entries?kind=…`, which returns one row per translation, newest first. The search field and the state and language filters narrow that list in the browser, and the figures above it are counted from the rows the table shows. A row opens the entry at `/<area>/<translation id>`. That address shows the entry's title until the editor exists.

## Search

Command-K on an Apple platform and Control-K elsewhere takes the reader to the search for the screen they are on. On an entry list it focuses the list's own field, which matches titles and topic names. The arrow keys move into the rows, and Escape gives the focus back. On a screen without a list it opens a dialog that asks `GET /search?q=…` for entries by title and topic and for media by slug and alt text. The shortcut does nothing whilst another text field has focus.

## Interface language

Every string the interface shows comes from the catalogue in `src/dashboard-i18n.ts`, in German and in English. The English catalogue is typed from the German one, so `pnpm --filter @layered/dashboard typecheck` fails when a key exists in one language only. A signed-in author sees the language their account names. The sign-in screen follows the browser, because no account is known yet. A failure the API returns is shown as the dashboard's own sentence for its error code, followed by the request ID, because the API's message is English and written for any caller.

## Development and verification

The dashboard is registered in `grat.config` on port 4502. Inspect local service state with `grat status`. Browser requests always use the same-origin `/api/` prefix. Vite forwards it to `http://localhost:4002` during development; nginx forwards it to `http://backend:3000` over the Zerops private network in production. `API_ORIGIN` selects that upstream and is never a browser URL. nginx preserves the incoming edge forwarding chain so the existing per-client sign-in limiter still identifies the original caller. Calling the public Zerops API from this proxy would add extra hops and must not replace the private upstream.

The session cookie remains HttpOnly, Secure in production, host-only and SameSite=Lax. The proxy leaves cookie attributes and backend error bodies unchanged. Transport failures return a safe JSON error with a request ID. Protected routes check the session and account profile before rendering and on navigation; sign-in restores a validated internal destination. The account dialog edits the profile, chooses an existing portrait from the media library, applies the saved interface language immediately and provides sign-out.

```sh
pnpm --filter @layered/dashboard typecheck
pnpm --filter @layered/dashboard test
pnpm --filter '@layered/dashboard...' build
```

Frontend tests use a memory router and mocked API responses. The deployment test writes shared assets and nginx configuration into its own temporary directory. Neither suite accesses a database.

nginx serves the generated application and falls back to `index.html` for client routes. Missing application bundles return 404. Fonts, the original logo and brand masks are copied from the shared UI assets; complete runtime dependency licences are retained in `DEPENDENCY_LICENSES.txt`.
