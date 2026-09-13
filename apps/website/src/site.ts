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

/** The sharing image, wanted by the tags on the page and by the file that makes it. */
export const SHARE_IMAGE = "/og.png";
export const SHARE_IMAGE_WIDTH = 1200;
export const SHARE_IMAGE_HEIGHT = 630;
