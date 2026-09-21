import type { APIRoute } from "astro";
import { jsonFeed } from "../content/feeds.js";
import { contentResponse } from "../content/response.js";
export const GET: APIRoute = () =>
  contentResponse("application/feed+json; charset=utf-8", (repository) =>
    JSON.stringify(jsonFeed(repository)),
  );
