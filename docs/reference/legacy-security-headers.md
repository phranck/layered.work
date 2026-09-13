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
