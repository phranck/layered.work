import type { APIRoute } from "astro";
import { contentResponse } from "../../content/response.js";

/** The German search index. The English one is `/search-index.json`. */
export const GET: APIRoute = () =>
  contentResponse("application/json; charset=utf-8", (repository) =>
    JSON.stringify(repository.searchIndex("de")),
  );
