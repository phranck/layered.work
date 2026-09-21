import type { APIRoute } from "astro";
import { contentResponse } from "../content/response.js";

/**
 * The English search index, read by the header's overlay.
 *
 * One route per language rather than one carrying both, so a reader downloads
 * the bodies of the language they are reading and not twice that.
 */
export const GET: APIRoute = () =>
  contentResponse("application/json; charset=utf-8", (repository) =>
    JSON.stringify(repository.searchIndex("en")),
  );
