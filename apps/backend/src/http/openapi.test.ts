import { validate } from "@scalar/openapi-parser";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { responds } from "./api-metadata.js";
import { app } from "./app.js";
import { generateOpenApi } from "./openapi.js";

describe("generated OpenAPI description", () => {
  it("includes every Hono route and validates as OpenAPI 3.1", async () => {
    const document = generateOpenApi(app.routes);
    const paths = document.paths as Record<string, Record<string, unknown>>;
    const registered = new Set(
      app.routes
        .filter((route) => route.method !== "ALL")
        .map(
          (route) =>
            `${route.method.toLowerCase()} ${route.path.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, "{$1}")}`,
        ),
    );
    const described = new Set(
      Object.entries(paths).flatMap(([path, methods]) =>
        Object.keys(methods).map((method) => `${method} ${path}`),
      ),
    );
    expect(described).toEqual(registered);
    expect(paths["/entries/{id}"]?.put).toMatchObject({
      "x-required-scopes": ["content:write"],
      "x-conditional-scopes": ["content:publish"],
    });
    expect(paths["/entries/{id}/restore"]?.post).toMatchObject({
      "x-required-scopes": ["content:write", "content:publish"],
    });
    expect(paths["/forms/{slug}/submissions"]?.post).toMatchObject({ security: [] });
    expect(paths["/forms"]?.get).toMatchObject({ security: [{ cookieAuth: [] }] });
    expect(paths["/media/uploads/{token}/content"]?.put).toMatchObject({
      requestBody: { content: { "image/png": { schema: { type: "string", format: "binary" } } } },
    });
    const checked = await validate(JSON.stringify(document));
    expect(checked.errors).toEqual([]);
    expect(checked.valid).toBe(true);
  });

  it("automatically discovers a new route and refuses one without a response contract", () => {
    const extra = new Hono();
    extra.get("/new", responds(z.object({ ready: z.boolean() })), (c) => c.json({ data: { ready: true } }));
    expect(
      (generateOpenApi([...app.routes, ...extra.routes]).paths as Record<string, unknown>)["/new"],
    ).toBeDefined();
    extra.get("/undocumented", (c) => c.json({ data: null }));
    expect(() => generateOpenApi([...app.routes, ...extra.routes])).toThrow("GET /undocumented");
  });

  it("serves the same document at the public API path", async () => {
    const response = await app.request("/openapi.json");
    expect(response.status).toBe(200);
    expect((await response.json()) as object).toEqual(generateOpenApi(app.routes));
  });
});
