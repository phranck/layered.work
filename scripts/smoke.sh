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
check "api liveness"         200 "$API_URL/health"
check "api readiness"        200 "$API_URL/health/db"
check "dashboard shell"      200 "$DASHBOARD_URL/"

# The feeds, the sitemap, the 404 page, security.txt and the response headers
# are checked here as soon as something serves them. Each is named in its own
# issue, and a check added before then would fail every run and teach everyone
# to ignore this script.

if [ "$failures" -gt 0 ]; then
  echo
  echo "$failures check(s) failed"
  exit 1
fi
echo
echo "all checks passed"
