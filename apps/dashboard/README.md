# Editorial dashboard

Vite builds the React application to `dist/`. React Router data routes share the sidebar's area registry; unknown paths show a not-found screen. Domain editors remain separate issues.

The sidebar uses shared Sidebar, Section, Row and Logo compounds and the prototype's workbench tokens. TanStack Query reads the signed-in identity and authenticated database counts. Unavailable storage domains have no badge; failures retain the API message and request ID instead of becoming zeroes.

## Development and verification

The dashboard is registered in `grat.config` on port 4502. Inspect local service state with `grat status`. Its API defaults to `http://localhost:4002` during development. Set the public `API_ORIGIN` environment variable to override the origin. Production uses the origin supplied in `zerops.yml`; the same resolved value is compiled into the browser bundle and nginx policy.

```sh
pnpm --filter @layered/dashboard typecheck
pnpm --filter @layered/dashboard test
pnpm --filter '@layered/dashboard...' build
```

Frontend tests use a memory router and mocked API responses. The deployment test writes shared assets and nginx configuration into its own temporary directory. Neither suite accesses a database.

nginx serves the generated application and falls back to `index.html` for client routes. Missing application bundles return 404. Fonts, the original logo and brand masks are copied from the shared UI assets; complete runtime dependency licences are retained in `DEPENDENCY_LICENSES.txt`.
