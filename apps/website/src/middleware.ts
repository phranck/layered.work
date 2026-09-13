import { defineMiddleware } from "astro:middleware";
import { countdownPage } from "./countdown/page.js";
import { hasOpened, isPreviewHost, websiteMode } from "./site.js";

/**
 * What still answers on the public host whilst the site is held back.
 *
 * The sharing image, the wordmark and the typefaces are all files under
 * `public/`, which are recognised by having an extension rather than by being
 * listed. These three are routes, so they have to be named.
 *
 * `/health` matters most of the three. Zerops asks for it before it sends
 * traffic to a new container, so holding it back would keep every deployment
 * out of service until the launch and then let them all in at once.
 */
const OPEN_BEFORE_LAUNCH = new Set(["/health", "/robots.txt", "/sitemap.xml"]);

/** The document changes every second, so it is barely worth keeping. */
const COUNTDOWN_MAX_AGE_SECONDS = 300;

/**
 * Headers every response from this site carries.
 *
 * Written in one place so the next route added is not the one that quietly
 * omits the last of them.
 */
const SAFETY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
};

/**
 * Decides, for every request, whether the countdown answers or the site does.
 *
 * The whole arrangement exists so that nobody has to deploy anything at the
 * launch moment. The finished site is built and running days beforehand; at
 * 21:21 it simply starts answering, because this runs per request and asks the
 * clock each time.
 *
 * Three things decide it, in order:
 *
 * 1. `WEBSITE_MODE`, when it is set to something other than `auto`. That is the
 *    way back if the site opens and something is badly wrong.
 * 2. The clock. Past the launch, everything answers normally and this file has
 *    nothing left to do.
 * 3. The host. Before the launch the finished site answers on the Zerops
 *    subdomains and on localhost, so it can be looked at, and the public domain
 *    shows the countdown. Anything unrecognised counts as the public domain,
 *    which is the way round that fails safely.
 *
 * Held back, only three things answer: the countdown at the root, the two
 * routes machines read, and the files under `public/`. Every other address is a
 * 404, the same as today. Serving the countdown under every name instead would
 * offer a search engine the same page a hundred times over, and would let
 * anyone read an unfinished page by guessing its address.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const mode = websiteMode();
  const path = context.url.pathname;

  const showSite =
    mode === "site" ||
    (mode !== "countdown" && (hasOpened() || isPreviewHost(context.request.headers.get("host"))));

  if (showSite) {
    const response = await next();
    for (const [name, value] of Object.entries(SAFETY_HEADERS)) {
      response.headers.set(name, value);
    }
    return response;
  }

  if (path === "/") {
    return new Response(countdownPage(), {
      status: 200,
      headers: {
        ...SAFETY_HEADERS,
        "content-type": "text/html; charset=utf-8",
        "cache-control": `public, max-age=${COUNTDOWN_MAX_AGE_SECONDS}`,
      },
    });
  }

  // A file under public/, or one of the two routes machines read. Astro serves
  // the first and renders the second, and answers 404 itself when there is no
  // such file, which is the right answer either way.
  if (OPEN_BEFORE_LAUNCH.has(path) || path.slice(path.lastIndexOf("/")).includes(".")) {
    const response = await next();
    for (const [name, value] of Object.entries(SAFETY_HEADERS)) {
      response.headers.set(name, value);
    }
    return response;
  }

  return new Response("Not found", {
    status: 404,
    headers: {
      ...SAFETY_HEADERS,
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0",
    },
  });
});
