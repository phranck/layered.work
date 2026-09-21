import { randomUUID } from "node:crypto";
import { loadContent } from "./load.js";
import type { ContentRepository } from "./repository.js";

/** Machine-readable routes keep operational failures distinct from empty content. */
export async function contentResponse(
  type: string,
  render: (repository: ContentRepository) => string,
): Promise<Response> {
  try {
    return new Response(render(await loadContent()), {
      headers: { "Content-Type": type, "Cache-Control": "public, max-age=300" },
    });
  } catch (error) {
    const errorId = randomUUID();
    console.error(
      JSON.stringify({
        code: "WEBSITE_CONTENT_UNAVAILABLE",
        errorId,
        operation: "render_content_feed",
        status: 503,
        result: "unavailable",
        cause: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    return Response.json(
      { code: "WEBSITE_CONTENT_UNAVAILABLE", message: "The content could not be loaded.", errorId },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
