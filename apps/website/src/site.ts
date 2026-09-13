/**
 * What the site says about itself, and when it opens.
 *
 * Kept apart from the server because two things read it. The page is one. The
 * other is `tools/make-og.sh`, which renders the sharing image offline and puts
 * the same two lines under the wordmark, and which imports this module from the
 * build. Nothing here starts a server or touches the network, so importing it
 * costs nothing.
 */

/**
 * When the site opens.
 *
 * Written with its offset rather than as a bare local time, because a countdown
 * whose target depends on the reader's own clock counts to a different moment
 * for every reader. Bregenz is UTC+2 in September.
 */
export const LAUNCH = "2026-09-21T21:21:00+02:00";

/**
 * The zone the site keeps time in.
 *
 * `Europe/Vienna` is the zone identifier covering the whole of Austria,
 * Vorarlberg included. It names the rules rather than the city, so it is right
 * here even though Bregenz is nowhere near Vienna.
 */
const SITE_TIMEZONE = "Europe/Vienna";

/**
 * The launch, written the way a reader reads it.
 *
 * Derived from `LAUNCH` rather than typed out beside it. The date has moved
 * several times whilst this page was being built, and it is now read by the
 * clock, by the sentence above it, by the description a search engine shows, by
 * the structured data and by the sharing image. One of those would eventually
 * be the one that kept the old date.
 *
 * Two formatters rather than one, because a single one joins the halves with
 * the word `at` and this page joins them with a comma.
 */
export const LAUNCH_TEXT = ((): string => {
  const moment = new Date(LAUNCH);
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: SITE_TIMEZONE,
  }).format(moment);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: SITE_TIMEZONE,
  }).format(moment);
  return `${day}, ${time}`;
})();

/**
 * Where this site answers.
 *
 * Stated once and used for the canonical link, every sharing tag, the robots
 * file and the sitemap, so all the absolute addresses the page publishes are
 * the same address.
 */
export const SITE_ORIGIN = "https://layered.work";

/**
 * The page colour, in the two forms the site needs.
 *
 * The stylesheet takes the oklch, which is how this palette is written. The
 * browser chrome takes `theme-color`, which reads sRGB only, so the hex beside
 * it is that same colour read back off a painted pixel. Change one and change
 * the other.
 */
export const PAGE_COLOR = "oklch(0.205 0.008 250)";
export const PAGE_COLOR_SRGB = "#14171b";

/**
 * Hosts on which the finished site answers before the launch.
 *
 * Everything not named here is held back until the moment, which is the way
 * round that fails safely: a host nobody anticipated shows the countdown rather
 * than an unfinished site. The public domain is deliberately absent.
 *
 * Matched on the name alone, so a port does not have to be listed. The entries
 * are suffixes, so every Zerops subdomain of the project is covered by one
 * line, and a host is only a match when the character before the suffix is a
 * dot or there is nothing before it at all. Without that, `notlayered.work`
 * would match a suffix of `layered.work`.
 */
export const PREVIEW_HOSTS = [".zerops.app", "localhost", "127.0.0.1"];

/**
 * Whether a host is one of those the finished site answers on before the
 * launch.
 *
 * @param host - The `Host` header as it arrived, with its port if it had one.
 * @returns True when the site may be shown there ahead of the moment.
 */
export function isPreviewHost(host: string | null): boolean {
  if (!host) return false;
  const name = host.split(":")[0]?.toLowerCase() ?? "";
  return PREVIEW_HOSTS.some(
    (suffix) => name === suffix || name.endsWith(suffix.startsWith(".") ? suffix : `.${suffix}`),
  );
}

/**
 * What to serve, when the clock is not to decide it.
 *
 * `auto`, which is the default and what production runs, asks the clock and the
 * host. The other two settle it outright: `countdown` is the way back if the
 * site goes live and something is badly wrong, without moving the date and
 * without a deployment, and `site` is how the finished site is worked on
 * locally whilst the launch is still ahead.
 */
export type WebsiteMode = "auto" | "site" | "countdown";

/**
 * Reads that setting.
 *
 * Anything unrecognised is `auto` rather than an error, because a typo in an
 * environment variable should not take the site down.
 */
export function websiteMode(): WebsiteMode {
  const given = process.env.WEBSITE_MODE;
  return given === "site" || given === "countdown" ? given : "auto";
}

/**
 * Whether the site has opened.
 *
 * Asked on every request, never once at start-up. A container that began before
 * the launch would otherwise go on serving the countdown for the rest of its
 * life, which is the one way this arrangement fails completely and silently.
 *
 * @param now - The moment to judge, which the caller passes so a test can name
 *   one rather than wait for it.
 */
export function hasOpened(now: number = Date.now()): boolean {
  return now >= Date.parse(LAUNCH);
}

/**
 * What the site is about, in one phrase.
 *
 * It opens the first line on the page, it follows the name in the title, and it
 * opens the sharing text, so it is written here once rather than three times.
 */
export const TAGLINE = "Enclosures, circuit boards and software";

/**
 * The line above the date, on the page and in the sharing image alike.
 *
 * Named on its own because the description of the sharing image quotes it, and
 * a description quoting words the picture does not carry is worse than one that
 * says less.
 */
const LEAD = "The new site arrives on";

/** Every line the page shows, in the order it shows them. */
export const COPY = {
  eyebrow: "Bregenz, Austria",
  lead: LEAD,
  date: LAUNCH_TEXT,
  tagline: TAGLINE,
  body: [`${TAGLINE}, made layer by layer.`, "The posts and projects are moving into a new home."],
  units: ["Days", "Hours", "Minutes", "Seconds"],
  open: "It is time.",
  contact: "Until then, I'm reachable at",
  logoLabel: "layered.work",
  author: "phranck",
  shareAlt: `The layered.work wordmark on a dark field of fine lines, with a line beneath it reading "${LEAD} ${LAUNCH_TEXT}".`,
} as const;

/**
 * The sentence given to a search engine and to anything that unfurls a link.
 *
 * Built from the same lines the page shows, so what a reader finds in a result
 * list is what they then read on the page.
 */
export const DESCRIPTION = `${COPY.body[0]} ${COPY.lead} ${COPY.date}.`;

/**
 * Who gets the byline when a link to this site is shared on Mastodon.
 *
 * One handle, not two. The old build carried this twice, for the author and
 * for the site's own account, and a reader of the tag takes the first and
 * ignores the rest. This page speaks in the first person and its structured
 * data names the same author, so it is the person rather than the account.
 */
export const FEDIVERSE_CREATOR = "@phranck@oldbytes.space";

/**
 * Where the visitor count goes.
 *
 * The instance is the one running beside this project on Zerops, never the
 * hosted service. The old site sent to both at once, which is two sets of
 * numbers for one site, and only this one is kept.
 *
 * The identifier is the site's own, carried over from the old build, so the
 * history either side of the rebuild is one line rather than two.
 *
 * Umami sets no cookie and stores nothing that identifies a reader, so nothing
 * here waits on a consent banner.
 */
export const UMAMI_SCRIPT = "https://umami.layered.work/script.js";
export const UMAMI_WEBSITE_ID = "3e266ac6-8103-4bef-bedb-7d127ed75cc4";

/** The sharing image, wanted by the tags on the page and by the file that makes it. */
export const SHARE_IMAGE = "/og.png";
export const SHARE_IMAGE_WIDTH = 1200;
export const SHARE_IMAGE_HEIGHT = 630;
