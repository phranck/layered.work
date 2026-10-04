import assert from "node:assert/strict";
import { test } from "node:test";
import { OPENAPI_PATH, readApiDescription } from "./index.js";

test("MCP reads the API's published contract from its origin", async () => {
  let requested = "";
  const document = { openapi: "3.1.0", info: { title: "API", version: "1" }, paths: {} };
  const fetcher: typeof fetch = async (input) => {
    requested = String(input);
    return Response.json(document);
  };
  assert.equal(OPENAPI_PATH, "/openapi.json");
  assert.deepEqual(await readApiDescription("https://api.example.test/base/", fetcher), document);
  assert.equal(requested, "https://api.example.test/openapi.json");
});

test("MCP reports an unavailable contract", async () => {
  const fetcher: typeof fetch = async () => new Response(null, { status: 503 });
  await assert.rejects(readApiDescription("https://api.example.test", fetcher), /HTTP 503/);
});
