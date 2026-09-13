> **Superseded on 13 September 2026 by #31.** Kept for the one thing it records that is still worth knowing: the earlier attempt at this project deferred the content policy because the site inlined scripts and nobody had inventoried them. This one does not defer it. The inline elements are inventoried, each carries a nonce issued per response, and the policy was checked against the built page in a browser before it shipped. What each of the three hosts now sends is in `docs/hosting.md`.

# Security Headers

The backend and Astro frontend apply the shared defense-in-depth headers from
`packages/shared/src/security-headers.ts` in application middleware:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `Permissions-Policy` denying unused browser sensors and payment APIs

No Zerops or edge-only header is currently required. If a future edge layer terminates requests
before they reach the application servers, mirror these headers at that layer.

Content Security Policy is intentionally deferred. The public Astro frontend currently uses inline
scripts for site interactions and serialized search data, so CSP should be introduced only after
those script requirements are inventoried and nonce or hash handling is designed.
