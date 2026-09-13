/**
 * What each of the three hosts puts on a response.
 *
 * **Headers are set per host, not per application.** A framework plugin
 * protects what that framework serves and nothing else, and this project serves
 * three hosts from three different things: Hono, Astro, and nginx over a folder
 * of files. Anything written once for "the app" would cover one of them.
 *
 * They live in one package because three of the values are the same everywhere
 * and a copy in three places drifts. The nginx configuration is generated from
 * here by the dashboard's build rather than written by hand, so it cannot
 * disagree either.
 *
 * **The platform already sends two of these.** The Zerops edge adds
 * `X-Content-Type-Options` and `Strict-Transport-Security` to everything,
 * measured on 13 September 2026. They are set here regardless, because a
 * control that holds only because something upstream happens to do it is a
 * control nobody wrote down, and it disappears the day the edge changes.
 */

/**
 * The three that are the same wherever a response comes from.
 *
 * `nosniff` stops a browser deciding for itself that something is a script.
 * `strict-origin-when-cross-origin` sends the full address to this site and
 * only the origin to anywhere else, so a path never leaks in a referrer.
 * The permissions list turns off what nothing here uses; each entry is a thing
 * a page cannot then ask for even if something injected into it tries.
 */
export const SHARED_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": [
    "accelerometer=()",
    "browsing-topics=()",
    "camera=()",
    "display-capture=()",
    "geolocation=()",
    "gyroscope=()",
    "interest-cohort=()",
    "magnetometer=()",
    "microphone=()",
    "payment=()",
    "usb=()",
  ].join(", "),
});

/**
 * Nothing on any of these hosts is meant to be framed.
 *
 * `frame-ancestors` in the policy is what a current browser obeys;
 * `X-Frame-Options` is the older header, kept because it costs one line and is
 * what an older one reads. They say the same thing, which is why they are
 * written together rather than in two places.
 */
export const NO_FRAMING: Readonly<Record<string, string>> = Object.freeze({
  "X-Frame-Options": "DENY",
});

/** The Umami instance, which is the only third party any page talks to. */
export const ANALYTICS_ORIGIN = "https://umami.layered.work";

/**
 * Builds a policy from its directives.
 *
 * @param directives - Each name with the sources it permits. An empty list
 *   writes the directive with no sources, which is how `frame-ancestors 'none'`
 *   would be written if `'none'` were not clearer.
 */
export function contentSecurityPolicy(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([name, sources]) => (sources.length ? `${name} ${sources.join(" ")}` : name))
    .join("; ");
}

/**
 * The API's policy.
 *
 * It returns JSON and renders nothing, so everything is denied and nothing has
 * to be permitted. A policy on a JSON response looks pointless until something
 * serves an error page, or a browser is pointed at an endpoint directly, and
 * then it is the only thing that decides what that document may do.
 */
export const API_POLICY = contentSecurityPolicy({
  "default-src": ["'none'"],
  "frame-ancestors": ["'none'"],
  "base-uri": ["'none'"],
  "form-action": ["'none'"],
});

/**
 * The dashboard's policy.
 *
 * An authenticated interface, so framing is denied outright: a page that can be
 * put in a frame can be clicked through by the page around it.
 *
 * `connect-src` reaches the API, which is a different host under the same
 * domain, and the analytics instance. `'self'` covers the built assets, which
 * nginx serves from the same origin.
 */
export function dashboardPolicy(apiOrigin: string): string {
  return contentSecurityPolicy({
    "default-src": ["'none'"],
    "script-src": ["'self'"],
    "style-src": ["'self'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", apiOrigin, ANALYTICS_ORIGIN],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
  });
}

/**
 * The site's policy.
 *
 * The one page that exists today carries its styles and two of its scripts
 * inline, because it is one document and a second request for a stylesheet
 * would arrive after the first paint. Inline is therefore permitted by nonce
 * rather than by `'unsafe-inline'`: a nonce is issued per response and names
 * exactly the elements this server put there, so anything injected into the
 * document afterwards has no nonce and does not run.
 *
 * @param nonce - Freshly generated for this one response, and written on every
 *   inline element the page carries.
 */
export function sitePolicy(nonce: string): string {
  return contentSecurityPolicy({
    "default-src": ["'none'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, ANALYTICS_ORIGIN],
    ...styleSources(nonce),
    "img-src": ["'self'", "data:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ANALYTICS_ORIGIN],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
  });
}

/**
 * Styling, split into the two things it actually is.
 *
 * A `<style>` element and `element.style.setProperty(…)` are both "inline
 * style" to one directive and are not the same risk at all. The first is a
 * block of CSS this server wrote, and a nonce names it exactly. The second is a
 * running script changing a property, which is what the countdown does sixty
 * times a second to keep a one-pixel line on a whole device pixel, and no nonce
 * can describe it.
 *
 * So they are separated. `style-src-elem` takes the nonce and nothing else,
 * which is the half that matters: a `<style>` block injected into the document
 * has no nonce and does not apply. `style-src-attr` permits inline attributes,
 * which is only reachable at all by a script, and no script runs here without
 * the nonce either.
 *
 * `style-src` remains as the fallback for a browser that does not know the
 * other two. It carries no nonce, because a directive with one ignores
 * `'unsafe-inline'` entirely and such a browser would then block the
 * attributes it was meant to permit.
 *
 * @param nonce - The one this response was issued.
 */
function styleSources(nonce: string): Record<string, string[]> {
  return {
    "style-src": ["'self'", "'unsafe-inline'"],
    "style-src-elem": ["'self'", `'nonce-${nonce}'`],
    "style-src-attr": ["'unsafe-inline'"],
  };
}
