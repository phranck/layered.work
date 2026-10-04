import { openApiDocument } from "@layered/schemas";

/** The agent-facing server reads the API's own contract rather than keeping a copy. */
export const OPENAPI_PATH = "/openapi.json";

/** Available to MCP tooling without importing the backend or opening the database. */
export async function readApiDescription(apiOrigin: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher(new URL(OPENAPI_PATH, apiOrigin));
  if (!response.ok) throw new Error(`The API description returned HTTP ${response.status}.`);
  return openApiDocument.parse(await response.json());
}
