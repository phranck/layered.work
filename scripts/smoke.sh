#!/usr/bin/env bash
# Checks the things that break silently, against the deployed hosts, and reports
# the figures rather than asserting that something is configured.
#
# Fails the workflow on the first thing that is wrong, naming it.
set -euo pipefail

SITE_URL="${SITE_URL:?SITE_URL is not set}"
API_URL="${API_URL:?API_URL is not set}"
DASHBOARD_URL="${DASHBOARD_URL:?DASHBOARD_URL is not set}"

failures=0

check() { # description, expected status, url
  local what="$1" expected="$2" url="$3" status
  status=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$url" || echo 000)
  if [ "$status" = "$expected" ]; then
    printf '  ok    %-42s %s\n' "$what" "$status"
  else
    printf '  FAIL  %-42s %s, wanted %s\n' "$what" "$status" "$expected"
    failures=$((failures + 1))
  fi
}

header() { # host, header name
  local url="$1" name="$2" value
  value=$(curl -sSI --max-time 20 "$url" | tr -d '\r' | awk -F': ' -v h="$name" 'tolower($1)==tolower(h){print $2}')
  if [ -n "$value" ]; then
    printf '  ok    %-42s %s\n' "$name on ${url#https://}" "${value:0:60}"
  else
    printf '  FAIL  %-42s absent\n' "$name on ${url#https://}"
    failures=$((failures + 1))
  fi
}

echo "Reachability"
check "site home"            200 "$SITE_URL/"
check "site 404"             404 "$SITE_URL/definitely-not-a-page-$RANDOM"
check "rss feed"             200 "$SITE_URL/feed.xml"
check "json feed"            200 "$SITE_URL/feed.json"
check "sitemap"              200 "$SITE_URL/sitemap.xml"
check "api readiness"        200 "$API_URL/health/db"
check "dashboard shell"      200 "$DASHBOARD_URL/"

echo "security.txt"
for host in "$SITE_URL" "$API_URL" "$DASHBOARD_URL"; do
  check "security.txt on ${host#https://}" 200 "$host/.well-known/security.txt"
done

echo "Response headers"
for host in "$SITE_URL" "$DASHBOARD_URL"; do
  header "$host" "content-security-policy"
  header "$host" "referrer-policy"
  header "$host" "x-content-type-options"
done

if [ "$failures" -gt 0 ]; then
  echo
  echo "$failures check(s) failed"
  exit 1
fi
echo
echo "all checks passed"
