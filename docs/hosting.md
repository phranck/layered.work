# Hosting

The project runs on [Zerops](https://zerops.io) in the `LAYERED` organisation, alongside lmaa.space, musiccloud.io, velvet.li and the Umami instance.

Nothing in this file is a secret. `zcli project env` prints the database password and the generated session secret in clear text, so no value from that output is ever copied into this repository.

## The project

| | |
| --- | --- |
| Name | `layered.work` |
| Id | `a-zerops-project` |
| Organisation | `LAYERED`, id `a-zerops-organisation` |
| Core package | LIGHT |
| Location | `eu-central`, which resolves to `prg1` |
| Created | 13 September 2026, from `zerops-project-import.yml` |

LIGHT gives 15 build hours, 5 GB of backup storage and 100 GB of egress per month. SERIOUS costs $10 per 30 days and raises those to 150 hours, 25 GB and 3 TB. The package moves up if the build minutes or the egress turn out to bind, and not before.

`sharedIpv4` is on, so the project domain carries an A record pointing at Zerops' shared IPv4 address as well as its AAAA records. A dedicated IPv4 costs $3 per 30 days and buys nothing this project needs.

## The services

| Hostname | Id | Type | Containers |
| --- | --- | --- | --- |
| `postgres` | `a-zerops-service` | `postgresql:single@18` | one, by definition |
| `assets` | `a-zerops-service` | `object-storage`, 5 GB, `public-read`, CDN on | not applicable |
| `backend` | `a-zerops-service` | `alpine/nodejs@22` | 1 |
| `website` | `a-zerops-service` | `alpine/nodejs@22` | 1 |
| `dashboard` | `a-zerops-service` | `alpine/nginx@1.22` | 1 |

One container each is the cheapest arrangement and right for a site with one author. The cost is a short gap during a deployment, because no second container takes over. Two containers double the CPU and the RAM in the bill.

All five were created with `startWithoutCode`, so they hold no application yet. They get one from the deploy workflow, which runs in GitHub Actions and pushes with an access token. The repository stays private, and `buildFromGit` is not used.

## Addresses

Until DNS points at the project, everything is reached through the Zerops subdomains. They are enabled on the three application services and the documentation calls them unsuitable for production, which is exactly what they are for here.

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

`layered.work` is attached to the `website` service and live since 13 September 2026. DNS is at world4you, and the zone holds exactly these two records for it:

| Name | Type | Value |
| --- | --- | --- |
| `layered.work` | A | `93.185.106.128` |
| `layered.work` | AAAA | `2a00:1ed0:1100:0:0:160:0:2444` |

The A record is Zerops' shared IPv4, which lmaa.space and musiccloud.io answer on as well, so routing is by host name rather than by address. That is what `sharedIpv4: true` in the import file buys, against $3 per 30 days for a dedicated address.

Zerops issued the certificate through Let's Encrypt, valid to 12 December 2026, covering `layered.work` alone. HTTP answers 301 to HTTPS.

`dashboard.layered.work` carries the same two records and is attached to the `dashboard` service. Zerops issued one certificate covering both names, so the site and the dashboard share it. `api.layered.work` has no record yet and is reached through its Zerops subdomain.

Adding a name to a project makes Zerops re-issue that certificate, and for a minute or two whilst it does, the existing host answers with a self-signed one. Nothing is broken; it passes.

**A domain with a record pointing at something dead cannot get a certificate.** On 13 September the old host's A and AAAA records were still published alongside the new ones. Let's Encrypt validates over HTTP against whichever address it picks, so it kept hitting a host that answered 502 and 404, and no certificate was issued whilst the site was already down. Removing the two old records fixed it within minutes. The lesson for the remaining two hosts: one name points at one place, and the old record goes at the same moment the new one arrives, not before and not after.

Lower the time to live before the next such change. It stood at 3125 seconds, so a mistake took the better part of an hour to undo.

## What the start command may contain

**Nothing but the command.** Zerops hands the `start` line in `zerops.yml` to `exec`, not to a shell, so an environment assignment in front of the program is read as the name of the program:

```
━━━━  🙏 exec PORT=3000 node apps/website/dist/server/entry.mjs  ━━━━
i: line 1: exec: PORT=3000: not found
━━━━  ❌ exec … => 127 (exited with 127) ━━━━
```

It restarts in a loop from there. The deployment reports success throughout, because the code did reach the container; only the gateway has nothing to reach, and the site answers 502. Found on 13 September, six minutes of the site being down.

That bites hardest with `PORT`, because Zerops holds that key itself and refuses the whole file when it appears under `envVariables`, so the obvious place is closed too. The answer is to set the port where the application is configured. For the website that is `server.port` in `astro.config.mjs`, which the standalone server reads with no environment variable involved, and it has to match the port declared under `ports` in `zerops.yml`.

**Give every application service a health check.** Zerops asks for it before sending traffic to a new container, so a deployment that fails to start never replaces the one that is running. Without it, a broken start takes the site down, which is exactly what happened above. Liveness only: a check that reaches a database reports a slow dependency as a dead process.

## The local database

`docker compose up -d` from the repository root, and that is the whole setup. `compose.yml` declares it and `scripts/local-database/` creates the roles when the volume is first made.

| | |
| --- | --- |
| Image | `postgres:18-alpine`, the version production runs |
| Address | `127.0.0.1:5434`, the loopback alone, because 5432 and 5433 belong to the sibling projects |
| Database | `layered` |
| Application role | `layered_app`, deliberately not a superuser, and the owner of the database, the schema, every table and every type |
| Administrative role | `layered`, for creating roles and looking around, and used by nothing that runs |

Copy `.env.example` to `.env.local`. The services read it themselves through Node's `--env-file-if-exists`, so nothing has to be exported into a shell before `grat start` works. Neither password is a secret: the database listens on one laptop's loopback address and holds nothing that is not reproducible from the Publii export.

**The volume mounts `/var/lib/postgresql`, not the `data` directory inside it.** From version 18 the image puts its cluster in a version-named subdirectory so a later `pg_upgrade --link` does not cross a mount boundary, and it refuses to start when it finds a mount one level too deep.

Until 13 September 2026 the container on this machine came from a compose file in `/Users/phranck/Sites/layered.work`, which is the old project and no longer exists. The database could not be recreated from anything checked in, and it carried two abandoned schemas from earlier attempts. Both were dumped and dropped.

## How another service reaches the database and the bucket

Zerops exposes a service's own variables to its siblings, prefixed by the hostname. Nothing is written down; `zerops.yml` references them.

| What | Reference |
| --- | --- |
| Database connection | `${postgres_connectionString}` |
| Bucket endpoint | `${assets_apiUrl}` |
| Bucket name | `${assets_bucketName}` |
| Bucket key | `${assets_accessKeyId}` |
| Bucket secret | `${assets_secretAccessKey}` |

`postgres` also exposes `superUser` and `superUserPassword`. The migration runner never uses them: it checks the connected role against the expected non-superuser name and aborts when it differs.

## Backups

Zerops backs the database up daily between 00:00 and 01:00 UTC, keeping at least seven daily, four weekly and three monthly copies. Zerops makes and stores the backup; restoring is ours to carry out with the service's own tools over the Zerops VPN. The procedure goes here once it has been followed once, per its issue.

The object storage is not covered by that backup.

## What GitHub holds

Repository secrets and variables the deploy workflow reads.

| Name | Kind | What it is |
| --- | --- | --- |
| `ZEROPS_BACKEND_SERVICE_ID` | secret | The service id from the table above |
| `ZEROPS_WEBSITE_SERVICE_ID` | secret | " |
| `ZEROPS_DASHBOARD_SERVICE_ID` | secret | " |
| `ZEROPS_TOKEN` | secret | A Zerops personal access token. Set, and deploying since 13 September 2026. |

There are no repository variables, as in every sibling project. What the smoke test checks is written in the deploy workflow, so it is visible in a diff and versioned. It asks the real hosts, `layered.work` and `dashboard.layered.work`, and the backend's Zerops subdomain, which has no name of its own yet.

`security.txt` is deferred. Its two signing secrets are not set and the deploy workflow does not generate the file, so nothing depends on them. Its own issue puts both back when it is worked.
