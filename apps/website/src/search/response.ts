import { randomUUID } from "node:crypto";
import { publicSearchQuery } from "@layered/schemas";
import type { Language } from "../content/repository.js";
import { loadSearch, searchFailure } from "./query.js";

/** Same-origin transport for the overlay, preserving API failures. */
export async function searchResponse(language: Language, url: URL): Promise<Response> {
  const parsed = publicSearchQuery.safeParse({
    q: url.searchParams.get("q"),
    language,
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success)
    return Response.json(
      { error: { code: "invalid_request", message: "The search is not valid.", id: randomUUID() } },
      { status: 400 },
    );
  try {
    return Response.json(await loadSearch(parsed.data), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const failure = searchFailure(error);
    return Response.json(
      { error: { code: failure.code, message: failure.message, id: failure.errorId } },
      { status: failure.status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
