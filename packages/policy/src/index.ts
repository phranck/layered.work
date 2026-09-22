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
 * Where the site's pictures, videos and models are served from.
 *
 * The object storage holds them and answers on Zerops' CDN, so a page on
 * layered.work loads them from another origin and the policy has to say so.
 * The bucket name is not part of this: a host is enough for the browser, and
 * naming only the host keeps an identifier out of a public repository.
 *
 * It appears in three directives because three kinds of element fetch from it.
 * An `img` needs `img-src`, a `video` needs `media-src`, and the model viewer
 * fetches its GLB with a request, which is `connect-src`.
 */
export const MEDIA_ORIGIN = "https://storage.cdn.zerops.app";

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
 * The dashboard reaches its API through the same-origin nginx proxy. An
 * explicit API origin remains available for interfaces without that proxy;
 * omitting it permits only this host and the analytics instance.
 */
export function dashboardPolicy(apiOrigin?: string): string {
  return contentSecurityPolicy({
    "default-src": ["'none'"],
    "script-src": ["'self'"],
    "style-src": ["'self'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(apiOrigin ? [apiOrigin] : []), ANALYTICS_ORIGIN],
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
    // `wasm-unsafe-eval` because the geometry arrives Draco-compressed and the
    // decoder is WebAssembly, which counts as evaluated script. It permits
    // compiling a module and nothing else: `eval` of a string stays refused,
    // which is what the plain `unsafe-eval` would have opened.
    "script-src": ["'self'", "'wasm-unsafe-eval'", `'nonce-${nonce}'`, ANALYTICS_ORIGIN],
    ...styleSources(nonce),
    "img-src": ["'self'", "data:", "blob:", MEDIA_ORIGIN],
    "media-src": ["'self'", MEDIA_ORIGIN],
    "font-src": ["'self'"],
    // `blob:` because a glTF file carries its textures inside it, and the
    // loader hands each one to the page as a blob and then fetches it back. One
    // refusal per texture, and the model renders empty. A blob address can only
    // name something this page itself made.
    "connect-src": ["'self'", "blob:", ANALYTICS_ORIGIN, MEDIA_ORIGIN],
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

/**
 * How far from the end of a forwarded chain the caller is.
 *
 * Not a count of proxies to believe in: a figure read off the deployed service.
 * Measured on 13 September 2026 by sending a spoofed header and reading the
 * chain back out of the log, Zerops appends the address it saw the connection
 * come from and one more internal hop appends its own, so whatever a caller
 * prepends, they are two from the end.
 *
 * A CDN in front would add one more entry and make this three. Whoever changes
 * the infrastructure changes this number, and the rate limiters that read it
 * log the chain on a refusal so that the change is visible rather than silent.
 */
const CLIENT_FROM_END = 2;

/** What a source is called when the chain says nothing. */
const UNKNOWN_SOURCE = "unknown";

/**
 * The address to hold responsible for a request, from its forwarded chain.
 *
 * **A forwarded header is attacker input.** Anybody can send
 * `X-Forwarded-For: 1.2.3.4`, so reading the first entry means a per-source
 * limit is per-whatever-the-caller-typed, which is no limit at all. Reading the
 * last entry instead puts everybody into one bucket, because that entry is the
 * same Zerops hop for every caller, which turns a per-source limit into a
 * global one.
 *
 * Both applications count against this, which is why it lives here rather than
 * in either of them: the site's password gate and the API's sign-in limit must
 * not disagree about who is asking.
 *
 * @param forwardedFor - The `X-Forwarded-For` header as it arrived, or null.
 * @returns The address, or `unknown` when nothing said. `unknown` is one bucket
 *   shared by everything that arrives without a chain, which is the safe
 *   direction: it limits more, not less.
 */
export function callerAddress(forwardedFor: string | null | undefined): string {
  const chain = (forwardedFor ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return chain[chain.length - CLIENT_FROM_END] ?? UNKNOWN_SOURCE;
}
