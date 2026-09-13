import type { APIRoute } from "astro";
import { SITE_ORIGIN } from "../site.js";

const ONE_HOUR_SECONDS = 3_600;

/**
 * The addresses this site has.
 *
 * One for now, and it grows from the entries once they are in the database.
 *
 * It carries no `lastmod`. The honest value would change on every deployment
 * and mean nothing, and a date that does not match the document is worse than
 * no date at all.
 */
export const GET: APIRoute = () =>
  new Response(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      "  <url>",
      `    <loc>${SITE_ORIGIN}/</loc>`,
      "  </url>",
      "</urlset>",
      "",
    ].join("\n"),
    {
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": `public, max-age=${ONE_HOUR_SECONDS}`,
      },
    },
  );
