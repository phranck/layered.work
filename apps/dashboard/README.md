# Editorial dashboard

Vite builds the React application to `dist/`. React Router data routes share the sidebar's area registry; unknown paths show a not-found screen. Domain editors remain separate issues.

The sidebar uses shared Sidebar, Section, Row and Logo compounds and the prototype's workbench tokens. TanStack Query reads the signed-in identity and authenticated database counts. Unavailable storage domains have no badge; failures retain the API message and request ID instead of becoming zeroes.

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
