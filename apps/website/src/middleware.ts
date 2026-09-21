import { defineMiddleware } from "astro:middleware";
import { randomBytes } from "node:crypto";
import { NO_FRAMING, SHARED_HEADERS, sitePolicy } from "@layered/policy";
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
 * The values come from `@layered/policy` rather than from here, because the
 * API and the dashboard send the same three and a copy in each of the three
 * places is a copy that drifts.
 */
const SAFETY_HEADERS: Record<string, string> = { ...SHARED_HEADERS, ...NO_FRAMING };

/**
 * A value that names this response's own inline elements, and nothing else.
 *
 * 16 bytes from the system's random source, which is 128 bits. The property it
 * needs is that it cannot be predicted before the response is written: anything
 * injected into the document afterwards has to carry it to run, and cannot.
 *
 * Issued here rather than in the page, so that the header and the document are
 * written from the same value by construction.
 */
function issueNonce(): string {
  return randomBytes(16).toString("base64");
}

/**
 * Puts the shared headers and this response's policy on it.
 *
 * @param response - What the route produced.
 * @param nonce - The one issued for this response.
 */
function withSafety(response: Response, nonce: string): Response {
  for (const [name, value] of Object.entries(SAFETY_HEADERS)) {
    response.headers.set(name, value);
  }
  if (ENFORCE_POLICY) {
    response.headers.set("content-security-policy", sitePolicy(nonce));
  }
  return response;
}

/**
 * Whether the content policy is sent at all.
 *
 * **Not in development.** The dev server injects its own scripts and styles
 * into every page without a nonce, so a policy loose enough to let those
 * through has stopped saying anything, and one tight enough to be worth having
 * breaks the tooling. Either way the console fills with violations that are
 * about Vite rather than about this site, which is the state in which a real
 * violation goes unread.
 *
 * The policy is therefore checked against the built output, which is what
 * ships, by running it and loading the page:
 *
 * ```bash
 * pnpm --filter "@layered/website..." build
 * WEBSITE_MODE=countdown PORT=4321 node apps/website/dist/server/entry.mjs
 * ```
 *
 * A condition on the environment rather than on whether something happens to be
 * present, so production cannot end up in the lenient branch by accident.
 */
const ENFORCE_POLICY = import.meta.env.PROD;

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

  const nonce = issueNonce();
  // Read by a page that renders inline, so it does not have to be passed down
  // through every component that might.
  context.locals.nonce = nonce;
  context.locals.siteVisible = showSite;

  if (showSite) {
    return withSafety(await next(), nonce);
  }

  if (path === "/") {
    return withSafety(
      new Response(countdownPage(nonce), {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": `public, max-age=${COUNTDOWN_MAX_AGE_SECONDS}`,
        },
      }),
      nonce,
    );
  }

  // A file under public/, or one of the two routes machines read. Astro serves
  // the first and renders the second, and answers 404 itself when there is no
  // such file, which is the right answer either way.
  const isFeed = path === "/feed.xml" || path === "/feed.json";
  if (OPEN_BEFORE_LAUNCH.has(path) || (!isFeed && path.slice(path.lastIndexOf("/")).includes("."))) {
    return withSafety(await next(), nonce);
  }

  return withSafety(
    new Response("Not found", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=0",
      },
    }),
    nonce,
  );
});
