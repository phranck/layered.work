# Hosting

The project runs on [Zerops](https://zerops.io) in the `LAYERED` organisation, alongside lmaa.space, musiccloud.io, velvet.li and the Umami instance.

Nothing in this file is a secret. `zcli project env` prints the database password and the generated session secret in clear text, so no value from that output is ever copied into this repository.

## The project

| | |
| --- | --- |
| Name | `layered.work` |
| Id | `6CcLPes1S02Ry7fSp6PDlw` |
| Organisation | `LAYERED`, id `wJ3cRBNaQvm9LISkfdcH2A` |
| Core package | LIGHT |
| Location | `eu-central`, which resolves to `prg1` |
| Created | 13 September 2026, from `zerops-project-import.yml` |

LIGHT gives 15 build hours, 5 GB of backup storage and 100 GB of egress per month. SERIOUS costs $10 per 30 days and raises those to 150 hours, 25 GB and 3 TB. The package moves up if the build minutes or the egress turn out to bind, and not before.

`sharedIpv4` is on, so the project domain carries an A record pointing at Zerops' shared IPv4 address as well as its AAAA records. A dedicated IPv4 costs $3 per 30 days and buys nothing this project needs.

## The services

| Hostname | Id | Type | Containers |
| --- | --- | --- | --- |
| `postgres` | `NHDB6g0xQROZZ0jWpWLAgQ` | `postgresql:single@18` | one, by definition |
| `assets` | `ikkCgA69RhKX81PqljCH6Q` | `object-storage`, 5 GB, `public-read`, CDN on | not applicable |
| `backend` | `cljrA4w8QyaBbxtY1wJDlg` | `alpine/nodejs@22` | 1 |
| `website` | `g19Ma4n9SNyHDjE6ehd6mw` | `alpine/nodejs@22` | 1 |
| `dashboard` | `U18wZgxpQ7CbW1LBjI1mCQ` | `alpine/nginx@1.22` | 1 |

One container each is the cheapest arrangement and right for a site with one author. The cost is a short gap during a deployment, because no second container takes over. Two containers double the CPU and the RAM in the bill.

All five were created with `startWithoutCode`, so they hold no application yet. They get one from the deploy workflow, which runs in GitHub Actions and pushes with an access token. The repository stays private, and `buildFromGit` is not used.

## Addresses

Until DNS points at the project, everything is reached through the Zerops subdomains. They are enabled on the three application services and the documentation calls them unsuitable for production, which is exactly what they are for here.

| Service | Address |
| --- | --- |
| `website` | `https://website-2444.prg1.zerops.app` |
| `dashboard` | `https://dashboard-2444.prg1.zerops.app` |
| `backend` | `https://backend-2444.prg1.zerops.app` |

The real hosts are `layered.work`, `dashboard.layered.work` and `api.layered.work`. Zerops manages domains and certificates outside the import file, so they are attached in the Zerops interface once the DNS records are in place at world4you. The exact records go here when they are known.

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
| `ZEROPS_TOKEN` | secret | A Zerops personal access token. **Not set yet.** |
| `SECURITY_TXT_SIGNING_KEY` | secret | The signing subkey. **Not set yet.** |
| `SECURITY_TXT_SIGNING_PASSPHRASE` | secret | **Not set yet.** |
| `SITE_URL`, `API_URL`, `DASHBOARD_URL` | variables | What the smoke test checks. The Zerops subdomains for now. |
| `DEPLOY_ENABLED` | variable | **Not set.** While it is absent no deploy job runs, so the workflow is complete and inert. |
