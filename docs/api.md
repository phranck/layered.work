# API

The backend serves an OpenAPI 3.1 document at `GET /openapi.json`. Use the backend origin, currently `https://backend-2444-3000.prg1.zerops.app`, or the dashboard's `/api/` proxy for browser access. The document is public and lists every registered Hono route. Request and response shapes come from the Zod schemas in `@layered/schemas`; adding a route without a response schema fails the OpenAPI gate.

The document names cookie and bearer authentication separately. `x-required-scopes` lists the scopes a bearer token always needs; `x-conditional-scopes` names extra scopes needed for particular request states, such as publishing an entry. Browser session routes use a cookie. A personal access token uses `Authorization: Bearer <token>` and can be issued and revoked only from a browser session.

## Error contract

Most JSON successes have a `data` property. Failures use one shared shape:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "The request is not valid.",
    "id": "request-id"
  }
}
```

`code` is stable for callers; `message` is safe to display but may change. `id` is also returned as `X-Request-Id` and identifies the corresponding server log entry. The codes are `invalid_request` (400), `unauthenticated` (401), `forbidden` (403), `not_found` (404), `conflict` (409), `payload_too_large` (413), `rate_limited` (429), and `internal` (500). A `429` response also carries `Retry-After`. Internal causes and credentials are never included in the response.

The health endpoints, public content snapshot and search, preview snapshot, CSV export and binary media response have their documented raw formats instead of the `data` envelope. A rejected public form may add `fieldErrors` beside the common `error` object so the site can mark individual fields.

## Public search

`GET /content/search?q=running&language=en&page=1&limit=6` is unauthenticated and returns `{ entries, total }`. Each hit contains only `path`, `title`, `kind` and `language`. PostgreSQL uses the translation's English or German configuration with `websearch_to_tsquery`, weighting titles ahead of summaries, topic names and body text. Queries are bounded to 120 characters, pages to 9999 and page sizes to 100.

Only current paths of public, untrashed translations can match. An author may explicitly list an untranslated entry in the other language, following the site's existing publication rule. Hidden, draft and unreachable content is excluded inside SQL. The website's `/search.json` and `/de/search.json` routes proxy this operation, preserving its failure status, safe message and request id. File-only static previews retain their exported public index.
