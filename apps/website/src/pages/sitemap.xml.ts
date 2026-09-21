import type { APIRoute } from "astro";
import { xml } from "../content/feeds.js";
import { topicPath } from "../content/repository.js";
import { contentResponse } from "../content/response.js";
import { SITE_ORIGIN } from "../site.js";

const sitemap = (paths: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...new Set(paths)].map((path) => `<url><loc>${xml(new URL(path, SITE_ORIGIN).href)}</loc></url>`).join("")}</urlset>`;
/** Only published paths enter the index; the countdown exposes the root alone. */
export const GET: APIRoute = ({ locals }) =>
  !locals.siteVisible
    ? new Response(sitemap(["/"]), { headers: { "Content-Type": "application/xml; charset=utf-8" } })
    : contentResponse("application/xml; charset=utf-8", (repository) =>
        sitemap([
          "/",
          "/de/",
          ...(["en", "de"] as const).flatMap((language) => [
            ...repository.publicEntries(language).map((entry) => entry.path),
            ...repository.topics(language).map((topic) => topicPath(language, topic.slug)),
          ]),
        ]),
      );
