# Dashboard API surface

The dashboard stores and retrieves data through the backend API. Its browser transport is `/api`, forwarded to the backend by Vite locally and nginx in production. The generated [OpenAPI document](api.md) describes the request schemas, responses and authentication. The table below covers every operation in `DashboardApi`, the CSV download link rendered by the submissions screen, and the image requests used by the account and settings screens.

Browser sessions use a cookie. Personal access tokens use `Authorization: Bearer <value>`. Tokens have explicit content read, content write, content publish and media write scopes. They cannot establish a browser session or obtain additional scopes through these operations.

## Operations

| Client operation | HTTP route | Token access |
| --- | --- | --- |
| `fetchSession` | GET /auth/me | Browser session |
| `fetchDashboardCounts` | GET /dashboard/counts | Browser session |
| `fetchForms` | GET /forms | Browser session |
| `fetchForm` | GET /forms/:id | Browser session |
| `createForm` | POST /forms | Browser session |
| `saveForm` | PUT /forms/:id | Browser session |
| `fetchFormSubmissions` | GET /forms/:id/submissions | Browser session |
| `setFormSubmissionStatus` | PATCH /forms/:id/submissions/:submissionId | Browser session |
| `deleteFormSubmission` | DELETE /forms/:id/submissions/:submissionId | Browser session |
| `fetchAccount` | GET /account | Browser session |
| `fetchMedia` | GET /media?search=:search&kind=:kind&page=:page&unused=:unused&order=:order | media:write |
| `fetchMediaDetail` | GET /media/:id | media:write |
| `saveMediaMetadata` | PUT /media/:id | media:write |
| `deleteMedia` | DELETE /media/:id | media:write |
| `fetchEntries` | GET /entries?kind=:kind | content:read |
| `createEntry` | POST /entries | content:write |
| `fetchEntry` | GET /entries/:id | content:read |
| `saveEntry` | PUT /entries/:id | content:write; content:publish when state is public |
| `createPreview` | POST /entries/:id/previews | content:write |
| `fetchTrashImpact` | GET /entries/:id/trash-impact | content:read |
| `setTrashed` | POST /entries/:id/trash or POST /entries/:id/restore | content:write; content:publish for restore |
| `emptyTrash` | DELETE /entries/trash?kind=:kind | content:write |
| `createTranslation` | POST /entries/:id/translation | content:write |
| `fetchTopics` | GET /topics | content:read |
| `createTopic` | POST /topics | content:write |
| `saveTopic` | PUT /topics/:id | content:write |
| `mergeTopic` | POST /topics/:id/merge | content:write |
| `deleteTopic` | DELETE /topics/:id | content:write |
| `search` | GET /search?q=:query | Browser session |
| `fetchSettings` | GET /settings | Browser session |
| `fetchSocialAccounts` | GET /social-accounts | Browser session |
| `saveSocialAccount` | POST /social-accounts or PUT /social-accounts/:id | Owner browser session |
| `deleteSocialAccount` | DELETE /social-accounts/:id | Owner browser session |
| `reorderSocialAccounts` | PATCH /social-accounts/order | Owner browser session |
| `fetchFooterNavigations` | GET /footer-navigation or /main-navigation | Browser session |
| `createFooterNavigation` | POST /footer-navigation or /main-navigation | Owner browser session |
| `saveFooterNavigation` | PUT /footer-navigation/:id or /main-navigation/:id | Owner browser session |
| `deleteFooterNavigation` | DELETE /footer-navigation/:id or /main-navigation/:id | Owner browser session |
| `reorderFooterNavigations` | PATCH /footer-navigation/order or /main-navigation/order | Owner browser session |
| `fetchHomeBlocks` | GET /home-blocks | Browser session |
| `addHomeBlock` | POST /home-blocks | Owner browser session |
| `saveHomeBlock` | PUT /home-blocks/:id | Owner browser session |
| `reorderHomeBlocks` | PATCH /home-blocks/order | Owner browser session |
| `deleteHomeBlock` | DELETE /home-blocks/:id | Owner browser session |
| `saveSettings` | PUT /settings/site, /settings/mail, /settings/analytics, /settings/postListing or /settings/projectListing | Owner browser session |
| `sendTestMail` | POST /settings/mail/test | Owner browser session |
| `fetchAccessTokens` | GET /access-tokens | Browser session |
| `issueAccessToken` | POST /access-tokens | Browser session |
| `revokeAccessToken` | DELETE /access-tokens/:id | Browser session |
| `fetchMailTemplates` | GET /mail-templates | Browser session |
| `saveMailTemplate` | PUT /mail-templates/:kind | Owner browser session |
| `previewMailTemplate` | POST /mail-templates/:kind/preview | Browser session |
| `testMailTemplate` | POST /mail-templates/:kind/test | Owner browser session |
| `updateAccount` | PATCH /account | Browser session |
| `uploadMedia` | POST /media/uploads, PUT the returned upload URL, POST /media/uploads/complete | media:write |
| `signIn` | POST /auth/sign-in | Credentials establish a browser session |
| `signOut` | POST /auth/sign-out | Clears a browser session |
| CSV export link | GET /forms/:id/submissions/export | Browser session |
| Portrait, media picker and settings images | GET /account/media/:id/content | Browser session |

The upload URL is either an API route (`PUT /media/uploads/:token/content`, used locally) or a presigned object storage URL. The storage URL authorizes only the upload that the API issued. The browser sends no session cookie to object storage. Completion and verification remain API operations.

## Session-bound operations

Account profile, session management and token issuance or revocation require the account's browser session. An editorial token is not authority to change its owner's identity or issue another credential.

The navigation methods retain their existing names and accept an optional `placement` of `main` or `footer`; omitting it selects the footer routes.

Site configuration, main/footer-navigation editing, social-account editing, home page block editing, mail configuration and outbound test mail are owner workflows. The current token scopes grant content editing and uploading rather than owner administration. Mail-template reading and previews remain in that session-bound mail workflow.

Forms and visitor submissions remain session-bound because the editorial scopes do not grant access to visitors' personal data or form administration. Dashboard counts and dashboard-wide search remain session-bound aggregations; scoped agents can read entries and topics through their corresponding endpoints. The shared media library and picker use the media:write scope. The protected image content route remains session-bound. These restrictions are enforced by the API, not by hiding dashboard controls.

## Browser boundary gate

The Vite configuration includes `dashboardApiBoundary`. It examines all resolved browser modules, including transitive dependencies, and rejects backend modules, Node built-ins and database packages such as `postgres`, `pg` and `drizzle-orm`. It also rejects PostgreSQL connection URLs in emitted chunks and text assets. Error messages name the import or artifact without printing a connection string.

The normal dashboard build runs this gate, so both pull-request CI and the deployment gate exercise it. Build tests inject a database import and a connection URL and require rejection. A same-origin API fixture must build successfully. Another test compares the table's client operations with the TypeScript `DashboardApi` interface, so adding a client method requires updating this document.
