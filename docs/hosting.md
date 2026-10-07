# Hosting

The project runs on [Zerops](https://zerops.io) in the `LAYERED` organisation, alongside lmaa.space, musiccloud.io, velvet.li and the Umami instance.

Nothing in this file is a secret. `zcli project env` prints the database password and the generated session secret in clear text, so no value from that output is ever copied into this repository.

**Nor is any Zerops identifier.** A service's id is the whole of the address Zerops exposes its build trigger at, `…/api/rest/public/service-stack/<id>/github-webhook`, and that endpoint answers a request carrying no signature: posting an empty body to it returns a validation error about the branch name rather than a refusal. Whoever knows the id can therefore reach the trigger. The ids are in the Zerops interface and in `zcli service list`, and they stay out of this repository.

## The project

| | |
| --- | --- |
| Name | `layered.work` |
| Organisation | `LAYERED` |
| Core package | LIGHT |
| Location | `eu-central`, which resolves to `prg1` |
| Created | 13 September 2026, from `zerops-project-import.yml` |

LIGHT gives 15 build hours, 5 GB of backup storage and 100 GB of egress per month. SERIOUS costs $10 per 30 days and raises those to 150 hours, 25 GB and 3 TB. The package moves up if the build minutes or the egress turn out to bind, and not before.

`sharedIpv4` is on, so the project domain carries an A record pointing at Zerops' shared IPv4 address as well as its AAAA records. A dedicated IPv4 costs $3 per 30 days and buys nothing this project needs.

## The services

| Hostname | Type | Containers |
| --- | --- | --- |
| `postgres` | `postgresql:single@18` | one, by definition |
| `assets` | `object-storage`, 5 GB, `public-read`, CDN on | not applicable |
| `backend` | `alpine/nodejs@22` | 1 |
| `website` | `alpine/nodejs@22` | 1 |
| `dashboard` | `alpine/nginx@1.22` | 1 |

One container each is the cheapest arrangement and right for a site with one author. The cost is a short gap during a deployment, because no second container takes over. Two containers double the CPU and the RAM in the bill.

All five were created with `startWithoutCode`. The three applications get theirs from the deploy workflow, which runs in GitHub Actions and pushes with an access token, building from the pipeline in `zerops.yml`.

The repository is public, which is what makes that free: GitHub bills Actions minutes for private repositories and not for public ones. Zerops can also build from a connected repository itself, without Actions, which is the fallback if that ever stops being true. Nothing in the tree depends on which of the two runs, because both execute the same `zerops.yml`.

## Addresses

Each application service also answers on a Zerops subdomain. They are enabled on all three, and the Zerops documentation calls them unsuitable for production.

| Service | Address |
| --- | --- |
| `website` | `https://website-2444-3000.prg1.zerops.app` |
| `dashboard` | `https://dashboard-2444.prg1.zerops.app` |
| `backend` | `https://backend-2444-3000.prg1.zerops.app` |

**The port is part of the name, and the subdomain has to be enabled after the first deploy.** `enableSubdomainAccess: true` in the import file runs before any service declares a port, and what it produces is a subdomain that resolves and routes nowhere: every request answers 502 with "Check if your application is running on a correct port", whilst the process log says it is listening. Running it again once the port exists fixes it.

```bash
zcli service enable-subdomain --projectId <project> --serviceId <service>
```

This cost an hour on 13 September 2026. The process was healthy the whole time and every layer looked right.

## The domain

`layered.work` is attached to the `website` service and live since 13 September 2026. DNS is at world4you, and these two records point the name at Zerops:

| Name | Type | Value |
| --- | --- | --- |
| `layered.work` | A | `93.185.106.128` |
| `layered.work` | AAAA | `2a00:1ed0:1100:0:0:160:0:2444` |

The A record is Zerops' shared IPv4, which lmaa.space and musiccloud.io answer on as well, so routing is by host name rather than by address. That is what `sharedIpv4: true` in the import file buys, against $3 per 30 days for a dedicated address.

`dashboard.layered.work` carries the same two records and is attached to the `dashboard` service.

Zerops issues the certificate through Let's Encrypt. One certificate covers `layered.work`, `dashboard.layered.work` and `new.layered.work`, and on 7 October 2026 it was valid to 20 December 2026. HTTP answers 301 to HTTPS on all three.

**The API has no public name, because nothing outside the project addresses it by one.** The site's server asks it at `http://backend:3000` inside the project. The dashboard's nginx passes `/api/` on to `http://backend.zerops:3000`, so a browser only ever talks to the host whose page it shows. A name for the API costs a DNS record and a certificate, and it is attached once a client outside the project needs one.

`new.layered.work` carries the same two records and answers on the `website` service. It is one of the preview hosts in `apps/website/src/site.ts`, so it shows the finished site whilst `layered.work` still shows the countdown, and the smoke test checks the site there.

The backend publishes its generated OpenAPI description at `/openapi.json`. The route, authentication and shared error contract are documented in [API](api.md).

Adding a name to a project makes Zerops re-issue that certificate, and for a minute or two whilst it does, the existing host answers with a self-signed one. Nothing is broken; it passes.

**A domain with a record pointing at something dead cannot get a certificate.** On 13 September the old host's A and AAAA records were still published alongside the new ones. Let's Encrypt validates over HTTP against whichever address it picks, so it kept hitting a host that answered 502 and 404, and no certificate was issued whilst the site was already down. Removing the two old records fixed it within minutes. The lesson for the remaining two hosts: one name points at one place, and the old record goes at the same moment the new one arrives, not before and not after.

Lower the time to live before the next such change. It stood at 3125 seconds, so a mistake took the better part of an hour to undo.

## Mail from this domain

Read out of DNS on 21 September 2026, rather than from what anybody remembers entering:

| Name | Type | Value |
| --- | --- | --- |
| `layered.work` | MX | `10 mail.layered.work` |
| `layered.work` | TXT | `v=spf1 mx include:spf.w4ymail.at include:spf.smtp2go.com -all` |
| `_dmarc.layered.work` | TXT | `v=DMARC1; p=none;` |
| `link.layered.work` | CNAME | `track.smtp2go.net` |
| `s758393._domainkey.layered.work` | CNAME | `dkim.smtp2go.net` |

The SPF record permits the domain's own mail host, world4you's senders and SMTP2GO's, and refuses everything else outright with `-all`. The CNAME is the link tracking SMTP2GO asks for, which is what shows the domain is set up there rather than only claimed.

**The DKIM selector carries an account-specific number**, `s758393`, and the record is a CNAME to SMTP2GO rather than the key itself, so the key can be rotated there without touching this zone. Resolving through it returns `v=DKIM1; k=rsa; p=…`. A selector like this cannot be guessed: it is in the SMTP2GO account under the sender domain, which is why it is written down here.

**DMARC carries no reporting address, and that is decided rather than missing.** `rua=` would bring one aggregate report per reporting receiver per day, as gzipped XML, which is a daily stream of mail nobody reads. phranck decided against it on 21 September 2026. The policy therefore stays at `p=none`: receivers act on neither a failed SPF nor a failed DKIM, and nothing observes what is being sent in this domain's name. Raising it to `quarantine` without reports would throw mail away unobserved, which is worse than the current state rather than better.

## What the start command may contain

**Nothing but the command.** Zerops hands the `start` line in `zerops.yml` to `exec`, not to a shell, so an environment assignment in front of the program is read as the name of the program:

```
━━━━  🙏 exec PORT=3000 node apps/website/dist/server/entry.mjs  ━━━━
i: line 1: exec: PORT=3000: not found
━━━━  ❌ exec … => 127 (exited with 127) ━━━━
```

It restarts in a loop from there. The deployment reports success throughout, because the code did reach the container; only the gateway has nothing to reach, and the site answers 502. Found on 13 September, six minutes of the site being down.

That bites hardest with `PORT`, because Zerops holds that key itself and refuses the whole file when it appears under `envVariables`, so the obvious place is closed too. The answer is to set the port where the application is configured. For the website that is `server.port` in `astro.config.mjs`, which the standalone server reads with no environment variable involved, and it has to match the port declared under `ports` in `zerops.yml`.

## What each host puts on a response

Three hosts, three different things serving them, so the headers are set three times and the values come from one place. `packages/policy` holds them; the backend and the site import it, and the dashboard's build generates its nginx configuration from it, because a configuration file looks like data and is therefore copied more readily than code.

| Host | What sets the headers |
| --- | --- |
| `layered.work` | Astro middleware, in `apps/website/src/middleware.ts` |
| `dashboard.layered.work` | nginx, through `siteConfigPath` pointing at a file the build wrote |
| the API | Hono middleware, in `apps/backend/src/http/headers.ts` |

All three send `Content-Security-Policy`, `Referrer-Policy`, `X-Content-Type-Options`, `X-Frame-Options` and `Permissions-Policy`, and all three deny framing.

**The Zerops edge already adds two of them.** Measured on 13 September 2026: every host answered with `X-Content-Type-Options: nosniff` and `Strict-Transport-Security: max-age=31536000; preload` before any of this existed. They are set by the application regardless, because a control that holds only because something upstream happens to do it is a control nobody wrote down.

**The site's policy permits inline by nonce, not by `unsafe-inline`.** The countdown carries its styles and two of its scripts inline, so each carries a nonce issued for that one response. Anything injected into the document afterwards has no nonce and does not run.

Styling is split, because a `<style>` element and `element.style.setProperty(…)` are the same directive to CSP and not the same risk. `style-src-elem` takes the nonce; `style-src-attr` permits attributes, which only a script can reach and no script runs without the nonce; `style-src` stays as the fallback for a browser that knows neither, carrying no nonce so that `'unsafe-inline'` still applies there.

**A page with a three-dimensional model gets one permission the rest of the site does not.** The viewer decodes compressed textures with an Emscripten build that constructs its functions from strings, in a worker built from a blob, which inherits the document's policy, so that page carries `'unsafe-eval'`. No build of that transcoder exists without it. The page decides this about itself whilst it renders, by asking its own body whether a `Model` is in it, and the middleware reads the answer when it writes the header. Every other response is unchanged, and a model exported without Basis-compressed textures would need none of it.

The viewer's own stylesheet is a `<style>` block inside its template, which this server never touches and therefore cannot give a nonce. It is permitted by its hash, computed from the installed package whilst assets are prepared, so a new release of the viewer cannot leave a stale value behind. Its two decoders are copied out of `three` into `public/draco/` and `public/basis/` and served from this origin, because otherwise the viewer fetches them from `gstatic.com`.

**The policy is not sent in development.** The dev server injects its own scripts and styles without nonces, so any policy loose enough for those has stopped saying anything, and one tight enough fills the console with violations about Vite. It is checked against the built output instead:

```bash
pnpm --filter "@layered/website..." build
WEBSITE_MODE=countdown PORT=4321 node apps/website/dist/server/entry.mjs
```

Loaded in a browser on 13 September 2026 that produced no violations, with the style block applied, both inline scripts run, the canvas sized and `--groove-drawn` set to `1px`.

**CORS on the API is the two interface origins, explicitly.** `SITE_ORIGIN` and `DASHBOARD_ORIGIN`, read from configuration and never from the request, with credentials permitted because the dashboard sends a cookie. That is why the list cannot be a wildcard, and why reflecting the request's own origin, which is the shortcut a wildcard tempts somebody into, would be the same as allowing everybody.

## A workspace package needs three paths in deployFiles

A service that imports one of this repository's own packages reaches it through a symlink in its own `node_modules`, pointing at `packages/<name>`. That path is not deployed unless it is named, and naming only part of it fails in a different way each time:

| What is missing | What happens |
| --- | --- |
| `packages/<name>/dist` | It was never built, unless the build command carries the trailing `...` that builds workspace dependencies as well |
| `packages/<name>/package.json` | Node cannot work out the entry point |
| `packages/<name>/node_modules` | The package's own dependencies are absent, because a package resolves those from beside itself rather than from whoever imported it |

The third cost a deployment on 13 September 2026. The container started and exited immediately with `Cannot find package 'zod' imported from /var/www/packages/schemas/dist/errors.js`. Nothing went down, because the readiness check kept it out of rotation, which is what the section below is for.

A package with no runtime dependency of its own needs only the first two, which is why `policy` and `passwords` are listed with two paths each and `schemas` with three.

**The same rule reaches an application's own `node_modules`.** Astro leaves any dependency it did not bundle to be resolved at run time, from beside the app rather than from the repository root. The site ran for weeks without that path because everything it used was bundled; adding Zod to it made the server exit on start with `Cannot find package 'zod'`, on 21 September 2026. The backend already carried `apps/backend/node_modules` for the same reason.

## The two checks, and which question each one asks

Zerops has both, they are configured in different sections, and giving one the other's job takes the site down.

| | `run.healthCheck` | `deploy.readinessCheck` |
| --- | --- | --- |
| When it runs | continuously, for the life of the container | only whilst a deployment is rolling out |
| What it decides | whether a running container stays in service | whether a new container may take over |
| What it may touch | the process alone | whatever the container needs to serve |

The [zerops.yml specification](https://docs.zerops.io/zerops-yaml/specification#readinesscheck-) says so directly: a health check runs continuously, and a readiness check runs only during a deployment, to decide when the application is ready for traffic.

**The health check must not reach the database.** It runs forever, and a failure takes the container out of service, so a dependency that is briefly slow would be reported as a dead process and every container would go with it. `/health` on both Node services answers from the process and touches nothing.

**The readiness check is where the real question belongs.** The backend's `/health/ready` asks whether the expected tables exist, whether the connected role may actually read and write them, and whether the applied migrations reach the one this build shipped. It answers 200 when all three hold and 503 naming the one that does not. A container that would answer every request and fail the ones that matter therefore never replaces the one already running.

**Neither check takes a `retryPeriod` or a `failureTimeout`.** The specification's own example gives both as plain integers, and so does the published JSON Schema, and zcli refuses the whole file: `cannot unmarshal !!int 60 into time.Duration`. The deployment fails before anything is replaced, so nothing goes down, but every service is rejected at once. Leave both out and take the defaults.

All three services have one, which is the part that is easy to get wrong: the health check watches what is already running, so a service without a readiness check puts a new container into rotation as soon as it starts. The website asks for its own `/health`, and the dashboard asks for `/api/health/ready` through nginx, so a shell with a broken backend proxy cannot replace a working dashboard.

## What the forwarded chain looks like

Measured against the deployed backend on 13 September 2026, by sending a request with a header of its own and reading the chain back out of a rate-limit log line, hashed:

| What the caller sends | What the service receives |
| --- | --- |
| nothing | `[<the caller>, <a Zerops hop>]` |
| `X-Forwarded-For: 1.2.3.4` | `[1.2.3.4, <the caller>, <a Zerops hop>]` |

Zerops appends the address it saw the connection come from, and then one more internal hop appends its own. **The caller is therefore two from the end, never the last and never the first.**

The last entry is the same Zerops hop for everybody, so reading it puts every caller into one bucket and turns a per-source limit into a global one. That is what the first version of the rate limiter did, and the chain it logs on every refusal is what made it visible within a minute of deploying.

The first entry is whatever the caller typed, so reading that is no limit at all.

A CDN in front would add one more entry and make the caller three from the end. The rate limiter logs the whole chain, hashed, on every refusal, so that change shows up rather than passing silently.

## The local database

`docker compose up -d` from the repository root, and that is the whole setup. `compose.yml` declares it and `scripts/local-database/` creates the roles when the volume is first made.

| | |
| --- | --- |
| Image | `postgres:18-alpine`, the version production runs |
| Address | `127.0.0.1:5434`, the loopback alone, because 5432 and 5433 belong to the sibling projects |
| Database | `layered` |
| Application role | `layered_app`, deliberately not a superuser, and the owner of the database, the schema, every table and every type |
| Administrative role | `layered`, for creating roles and looking around, and used by nothing that runs |

Copy `.env.example` to `.env.local`. The services read it themselves, so nothing has to be exported into a shell before `grat start` works. The backend does it through Node's `--env-file-if-exists`. The website does it with `process.loadEnvFile` at the top of `apps/website/astro.config.mjs`, because `astro dev` reads no file at the repository's root, and without `API_URL` every page answers 503.

**React is bundled into the website's built server and only there.** Zerops deploys `dist` without the app's dependency links, so `astro build` puts React inside the standalone server. The development server must not do the same: Vite's module runner would then load React's CommonJS entry itself and stop with "module is not defined". The small integration `bundleReactIntoBuild` in `astro.config.mjs` adds the line for builds alone, and `tools/bundle-react-into-build.test.mjs` holds it there. Neither password is a secret: the database listens on one laptop's loopback address and holds nothing that is not reproducible from the Publii export.

**The volume mounts `/var/lib/postgresql`, not the `data` directory inside it.** From version 18 the image puts its cluster in a version-named subdirectory so a later `pg_upgrade --link` does not cross a mount boundary, and it refuses to start when it finds a mount one level too deep.

Until 13 September 2026 the container on this machine came from a compose file in `/Users/phranck/Sites/layered.work`, which is the old project and no longer exists. The database could not be recreated from anything checked in, and it carried two abandoned schemas from earlier attempts. Both were dumped and dropped.

## Local media

Locally the backend reads and writes pictures in `media-local/` rather than in the bucket, and production always uses the bucket. Leave the four `S3_*` values in `.env.local` empty so that nothing on this machine reaches the production bucket. Set `MEDIA_LOCAL_DIR=media-local` instead, which is ignored by git.

A file's storage key is the key of its object in the bucket, and `media-local/` holds the same keys. Uploads land under `media-local/uploads/`. The old site's pictures have the `migration/` keys `scripts/publii/upload.mjs` gave them in the bucket, so the migration's copies are linked in once:

```bash
mkdir -p media-local
ln -s ../apps/website/public/media media-local/migration
```

The site addresses a file as its key behind `MEDIA_ORIGIN`, which is the bucket's root in production. Locally `MEDIA_ORIGIN` is unset, so the address is the bare key, and the website's development server answers it from `media-local/` through `apps/website/tools/local-media.mjs`. `pnpm --filter @layered/backend db:verify` asks the store for every key in the library and fails where one names no object.

Before a batch release, put the four bucket values in the ignored `.env.local` as `ZEROPS_S3_ENDPOINT`, `ZEROPS_S3_BUCKET`, `ZEROPS_S3_ACCESS_KEY_ID`, and `ZEROPS_S3_SECRET_ACCESS_KEY`, then run `pnpm --filter @layered/backend db:sync-media` from the local checkout. Only this command maps those values to `S3_*`; ordinary local backend runs continue to use `media-local/`. The command refuses a database outside localhost, reads the storage keys of every original and every generated size from the local database, and uploads only objects absent from the bucket. Before the first upload it checks every local file against the database. An original is checked against its size and SHA-256, and a generated size against its byte count, because `media_variants` records no checksum. Each uploaded object is then read back and checked again. Keep `DATABASE_URL` pointed at the local database.

An upload has three steps. The dashboard asks the API for one, sends the bytes to the address in the answer, and then says it is done. With a bucket that address is a presigned bucket URL, so the bytes never pass through the API. Locally it is the API's own `PUT /media/uploads/:token/content`, a route that only exists when no bucket is configured outside production. The API then decodes what arrived and keeps it only if it is the picture it was declared as.

## Schema changes

`apps/backend/drizzle/` holds `0000_initial_schema.sql` and every change made since. A schema change is generated and applied to the local database, never written by hand, and reaches production with the next push:

```sh
pnpm --filter @layered/backend db:generate --name=<what_changed>
pnpm --filter @layered/backend db:migrate
```

`db:generate` writes a new file describing the difference, and `db:migrate` applies it to the database `DATABASE_URL` names, which keeps its content.

`pnpm db:reset` is for a database that is to start over: it removes the container together with its volume, brings it back, applies every file in order and seeds the account, and the content is then `db:import` from the committed snapshot. The reset refuses to touch anything except the container `compose.yml` declares, on the port it declares, because a reset pointed at the wrong database is not a mistake anybody gets to undo.

**A file that has been applied anywhere is never edited again.** The deployment runs `node apps/backend/dist/db/migrate.js` before the service starts, and the runner records a hash of each file it applies. Rewriting `0000_initial_schema.sql` therefore produces a file the deployed database has no record of, whose statements describe a schema it already has, and the deployment fails at the first `CREATE TYPE`.

That happened on 23 September 2026. `entry_kind` gained a third value, the one file was regenerated as the note here used to instruct, and `deploy-backend` failed whilst the site went on serving its previous build. The answer was to put `0000_initial_schema.sql` back exactly as the deployed database had applied it and let `db:generate` write `0001_add_project_kind.sql` beside it, which is one line: `ALTER TYPE "public"."entry_kind" ADD VALUE 'project';`.

So the history starts here, earlier than #180 expected, and for a plainer reason than the one it named. Rewriting the first file only works whilst every database that has applied it can be thrown away at once, and the deployed one cannot: it is reachable only from inside the project network, because `zcli vpn up` needs a password only phranck can give. Replacing it is a push from the local database, which is not a step to put in front of every schema change.

## How another service reaches the database and the bucket

Zerops exposes a service's own variables to its siblings, prefixed by the hostname. Nothing is written down; `zerops.yml` references them.

| What | Reference |
| --- | --- |
| Database connection | `${postgres_connectionString}` |
| Bucket endpoint | `${assets_apiUrl}` |
| Bucket name | `${assets_bucketName}` |
| Bucket key | `${assets_accessKeyId}` |
| Bucket secret | `${assets_secretAccessKey}` |

`postgres` also exposes `superUser` and `superUserPassword`. The migration runner never uses them: it checks the connected role before the first migration and aborts when it is a superuser, when `DB_MIGRATION_ROLE` is missing, or when the connected role differs from that value.

**The role Zerops connects as is `db`**, read off the first migration that ran there rather than guessed, from the line `migrations applied as db`. It is not a superuser, which that same run proved by not being refused. Locally the equivalent is `layered_app`, created by `scripts/local-database/`.

## The local database is the master

Until the site is finished, production holds what the local database holds. Content and schema change locally, `db:migrate` runs locally, and the local state then replaces the Zerops database. A difference between the two is a fault on production, and the next push removes it.

`scripts/db-push` makes the replacement. It checks that both connections are the expected roles and neither is a superuser, refuses when production holds a table the local database lacks, restores a dump of the local database into production in one transaction, and compares the rows of every table afterwards. `--check` does everything up to the restore and writes nothing to production. It reads `ZEROPS_DB_URL` from `.env.local` and needs the Zerops VPN, which `zcli vpn up` opens and which asks for phranck's password.

```bash
zcli vpn up
scripts/db-push --check
scripts/db-push
```

A migration applied locally reaches production with the push, because the dump carries Drizzle's record of it.

## Backups

Zerops backs `postgres` up every day at 00:08 UTC: its `backupPeriod` reads `8 0 * * *`, asked of the Zerops API on 7 October 2026. No retention policy is set, so the [default](https://docs.zerops.io/features/backup) applies: at least seven daily, four weekly and three monthly copies, and at most 50. A backup is the way back when a push goes wrong or this machine is lost, not a source of content.

A backup is a ZIP holding one `pg_dump` file in the custom format per database. `db.dump` is the site, beside `postgres.dump` and `template1.dump`. Zerops decrypts it when it is downloaded. Two things differ from the Zerops documentation: it describes one dump per schema, and it shows a `zcli backup create` command that zcli 1.1.2 does not have.

### Getting a backup back

Followed on 7 October 2026 with the backup of that night, into a throwaway database on this machine.

1. Download it from the Zerops interface, under the `postgres` service's backups, or through the API: `POST /project/<project>/backup/download-url/<service>/<backup date>` answers with a link to the decrypted ZIP, and `GET /service-stack/<service>/backup` lists the backups with their dates.
2. Unzip it and keep `db.dump`.
3. Start an empty PostgreSQL 18 and create the role `db` with a login, and the database `db` owned by it. The dump assigns every object to that role.

   ```bash
   docker run -d --name layered-restore -e POSTGRES_PASSWORD=<password> -p 127.0.0.1:55432:5432 postgres:18-alpine
   psql "host=127.0.0.1 port=55432 user=postgres" -c "create role db login password '<password>'" -c "create database db owner db"
   ```

4. Restore it with the PostgreSQL 18 tools, which Homebrew's `libpq` supplies.

   ```bash
   pg_restore -h 127.0.0.1 -p 55432 -U postgres -d db --exit-on-error db.dump
   ```

5. Bring its schema to the current code as the role `db`.

   ```bash
   DATABASE_URL=postgres://db:<password>@127.0.0.1:55432/db DB_MIGRATION_ROLE=db pnpm --filter @layered/backend db:migrate
   ```

The container answered after 3 seconds, the restore of the 135,672 byte dump took 1 second, and the migration 1 second. `db:snapshot` written from the restored database matched what production served at `/content/snapshot` in every entry, topic, file, redirect and form. The container and the downloaded files were removed afterwards.

To put a backup back into production, restore it into the local container in place of the local database and push that with `scripts/db-push`, so production is still written from local.

### The bucket

Zerops does not back up [object storage](https://docs.zerops.io/guides/object-storage-integration). This machine holds every object the bucket serves: the migrated files and their sizes in `apps/website/public/media/`, which the migration pipeline staged and git ignores, every upload in `media-local/uploads/`, and the sizes the backend generated for an upload in `media-local/variants/`. A lost bucket is filled again from here: `scripts/publii/upload.mjs` uploads the migrated files and their sizes, `db:sync-media` every original and every size in the library, and `db:verify-bucket` names whatever is still missing.

## Secrets and environment

[Secrets and environment](secrets.md) lists every variable the three services read, the repository secrets the deploy workflow needs, and what happens when one is missing.

## What the smoke test asks

What the smoke test checks is written in the deploy workflow, so it is visible in a diff and versioned. It asks the real hosts, `layered.work` and `dashboard.layered.work`, and the backend's Zerops subdomain, because the API has no public name. The pages, the feeds and the sitemap of the finished site are checked on `new.layered.work`, which shows them before the launch as well.
