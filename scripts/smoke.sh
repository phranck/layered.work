#!/usr/bin/env bash
# Checks the things that break silently, against the deployed hosts, and reports
# the figures rather than asserting that something is configured.
#
# Every check runs, and a failure names what failed and what came back. The
# workflow fails at the end when anything did.
set -euo pipefail

SITE_URL="${SITE_URL:?SITE_URL is not set}"
API_URL="${API_URL:?API_URL is not set}"
DASHBOARD_URL="${DASHBOARD_URL:?DASHBOARD_URL is not set}"
# Where the finished site answers whatever the date: the public name shows the
# countdown until the launch, and this host shows the site before it as well.
PREVIEW_URL="${PREVIEW_URL:?PREVIEW_URL is not set}"

# How long one request may take, in seconds.
TIMEOUT=20

failures=0

pass() { # description, what came back
  printf '  ok    %-44s %s\n' "$1" "$2"
}

fail() { # description, what came back
  printf '  FAIL  %-44s %s\n' "$1" "$2"
  failures=$((failures + 1))
}

fetch() { # url; the body, or nothing when the request fails
  curl -sS --max-time "$TIMEOUT" "$1" || true
}

check() { # description, expected status, url
  local what="$1" expected="$2" url="$3" status
  status=$(curl -sS -o /dev/null -w '%{http_code}' --max-time "$TIMEOUT" "$url" || echo 000)
  if [ "$status" = "$expected" ]; then pass "$what" "$status"; else fail "$what" "$status, wanted $expected"; fi
}

header() { # url, header name
  local url="$1" name="$2" value
  # A header sent twice, once by the application and once by the edge, is
  # reported with both values on one line rather than hidden behind the first.
  value=$(curl -sSI --max-time "$TIMEOUT" "$url" | tr -d '\r' |
    awk -F': ' -v h="$name" 'tolower($1)==tolower(h){found = found (found ? " | " : "") $2} END{print found}')
  if [ -n "$value" ]; then pass "$name on ${url#https://}" "${value:0:60}"; else fail "$name on ${url#https://}" "absent"; fi
}

contains() { # description, text to find, url
  if fetch "$3" | grep -qF "$2"; then pass "$1" "contains $2"; else fail "$1" "does not contain $2"; fi
}

parses() { # description, json or xml, url
  local what="$1" kind="$2" body
  body=$(fetch "$3")
  if [ "$kind" = json ]; then
    jq -e . >/dev/null 2>&1 <<<"$body" && pass "$what" "parses as JSON" && return
    fail "$what" "does not parse as JSON"
  else
    python3 -c 'import sys, xml.etree.ElementTree as tree; tree.fromstring(sys.stdin.read())' 2>/dev/null <<<"$body" &&
      pass "$what" "parses as XML" && return
    fail "$what" "does not parse as XML"
  fi
}

echo "Reachability"
check "site home"               200 "$SITE_URL/"
check "api liveness"            200 "$API_URL/health"
check "api readiness"           200 "$API_URL/health/ready"
check "dashboard shell"         200 "$DASHBOARD_URL/"
contains "dashboard shell"      '<div id="root"' "$DASHBOARD_URL/"
check "dashboard API readiness" 200 "$DASHBOARD_URL/api/health/ready"
check "dashboard session probe" 200 "$DASHBOARD_URL/api/auth/me"
check "robots.txt"              200 "$SITE_URL/robots.txt"
check "sitemap.xml"             200 "$SITE_URL/sitemap.xml"
check "sharing image"           200 "$SITE_URL/og.png"

echo
echo "The finished site, on ${PREVIEW_URL#https://}"
# Which entries and topics exist is read from what the site itself is built
# from, so nothing here names an address that a later edit could take away.
snapshot=$(fetch "$API_URL/content/snapshot")
entry=$(jq -r 'first(.entries[] | select(.visibility == "public") | .path) // empty' <<<"$snapshot" 2>/dev/null || true)
hidden=$(jq -r 'first(.entries[] | select(.visibility == "hidden") | .path) // empty' <<<"$snapshot" 2>/dev/null || true)
topic=$(jq -r 'first(.topics[] | .translations.en.slug // empty) // empty' <<<"$snapshot" 2>/dev/null || true)

# A title is matched as the page writes it, with its markup characters escaped.
if jq -r '.entries[] | select(.visibility == "public" and .title != "") | .title | @html' <<<"$snapshot" 2>/dev/null |
  grep -qFf - <(fetch "$PREVIEW_URL/"); then
  pass "home page" "shows an entry title"
else
  fail "home page" "shows no entry title"
fi

if [ -n "$entry" ]; then check "an entry page" 200 "$PREVIEW_URL$entry"; else fail "an entry page" "no public entry in the snapshot"; fi
if [ -n "$topic" ]; then check "a topic page" 200 "$PREVIEW_URL/topics/$topic/"; else fail "a topic page" "no topic in the snapshot"; fi
check "an address that does not exist"  404 "$PREVIEW_URL/smoke-check-missing/"
parses "RSS feed"         xml  "$PREVIEW_URL/feed.xml"
parses "German RSS feed"  xml  "$PREVIEW_URL/de/feed.xml"
parses "JSON feed"        json "$PREVIEW_URL/feed.json"
parses "sitemap"          xml  "$PREVIEW_URL/sitemap.xml"

if [ -z "$hidden" ]; then
  pass "hidden entry absent from the sitemap" "no hidden entry to check"
elif fetch "$PREVIEW_URL/sitemap.xml" | grep -qF "${hidden}</loc>"; then
  fail "hidden entry absent from the sitemap" "lists $hidden"
else
  pass "hidden entry absent from the sitemap" "$hidden not listed"
fi

echo
echo "Response headers"
# Read back from the deployed hosts rather than from the configuration, because
# three different things set them and only one of the three is this repository's
# code running in a way a test could reach.
for host in "$SITE_URL/" "$DASHBOARD_URL/" "$API_URL/health"; do
  for name in Content-Security-Policy Referrer-Policy X-Content-Type-Options X-Frame-Options; do
    header "$host" "$name"
  done
done

# security.txt is checked here as soon as something serves it. It has its own
# issue, and a check added before then would fail every run and teach everyone
# to ignore this script.

if [ "$failures" -gt 0 ]; then
  echo
  echo "$failures check(s) failed"
  exit 1
fi
echo
echo "all checks passed"
