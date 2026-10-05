import { randomUUID } from "node:crypto";
import {
  type PublicSearchQuery,
  type PublicSearchResults,
  publicSearchResults,
  readApiError,
} from "@layered/schemas";
import { loadContent } from "../content/load.js";
import type { ContentRepository } from "../content/repository.js";

class SearchError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly errorId: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** A file-only preview searches its snapshot; configured sites always ask PostgreSQL. */
export async function loadSearch(
  query: PublicSearchQuery,
  repository?: ContentRepository,
): Promise<PublicSearchResults> {
  const base = process.env.API_URL;
  if (!base) {
    const content = repository ?? (await loadContent());
    const matching = new Set(
      content
        .searchIndex(query.language)
        .filter((hit) => hit.text.includes(query.q.toLocaleLowerCase(query.language)))
        .map((hit) => hit.path),
    );
    const all = content.publicEntries(query.language).filter((entry) => matching.has(entry.path));
    return {
      entries: all.slice((query.page - 1) * query.limit, query.page * query.limit).map((hit) => ({
        path: hit.path,
        title: hit.title,
        kind: hit.kind,
        language: hit.language,
      })),
      total: all.length,
    };
  }
  const url = new URL("/content/search", base);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const body = await response.json();
  if (!response.ok) {
    const failure = readApiError(body);
    throw new SearchError(
      failure?.code ?? "WEBSITE_SEARCH_UNAVAILABLE",
      failure?.message ?? "Search is unavailable.",
      failure?.id ?? randomUUID(),
      response.status,
    );
  }
  return publicSearchResults.parse(body);
}

/** Preserve safe upstream identifiers and log no query or connection values. */
export function searchFailure(error: unknown) {
  const failure =
    error instanceof SearchError
      ? { code: error.code, message: error.message, errorId: error.errorId, status: error.status }
      : {
          code: "WEBSITE_SEARCH_UNAVAILABLE",
          message: "Search is unavailable.",
          errorId: randomUUID(),
          status: 503,
        };
  console.error(
    JSON.stringify({
      ...failure,
      requestId: failure.errorId,
      operation: "public_search",
      route: "/content/search",
      result: "unavailable",
      cause: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  return failure;
}
