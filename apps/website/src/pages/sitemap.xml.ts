import type { APIRoute } from "astro";
import { sitemap, sitemapPaths } from "../content/feeds.js";
import { contentResponse } from "../content/response.js";

/** Only published paths enter the index; the countdown exposes the root alone. */
export const GET: APIRoute = ({ locals }) =>
  !locals.siteVisible
    ? new Response(sitemap(["/"]), { headers: { "Content-Type": "application/xml; charset=utf-8" } })
    : contentResponse("application/xml; charset=utf-8", (repository) =>
        sitemap(sitemapPaths(repository), repository),
      );
