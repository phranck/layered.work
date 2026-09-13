import type { APIRoute } from "astro";
import { SITE_ORIGIN } from "../site.js";

const ONE_HOUR_SECONDS = 3_600;

/**
 * What a crawler is told before it reads anything else.
 *
 * The sitemap is named with its full address, which the specification asks for
 * and several crawlers insist on.
 *
 * Answered whilst the site is still held back as well, because a crawler that
 * is refused this file falls back to guessing.
 */
export const GET: APIRoute = () =>
  new Response(["User-agent: *", "Allow: /", "", `Sitemap: ${SITE_ORIGIN}/sitemap.xml`, ""].join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": `public, max-age=${ONE_HOUR_SECONDS}`,
    },
  });
