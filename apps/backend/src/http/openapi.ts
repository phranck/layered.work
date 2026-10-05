import { apiErrorSchema, ErrorCode } from "@layered/schemas";
import type { Hono } from "hono";
import { type ZodType, z } from "zod";
import { SESSION_COOKIE } from "../auth/cookie.js";
import { type ApiMetadata, metadataOf } from "./api-metadata.js";
import { statusFor } from "./response.js";

type Route = Hono["routes"][number];
type Json = Record<string, unknown>;
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

const errorResponse = {
  description: "The shared API error contract. The id also appears in X-Request-Id and server logs.",
  content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } },
};

function jsonSchema(schema: ZodType, io: "input" | "output"): Json {
  const converted = z.toJSONSchema(schema, { target: "draft-2020-12", io });
  const { $schema: _dialect, ...body } = converted;
  return body;
}

function pathMatches(pattern: string, path: string): boolean {
  if (pattern === "*") return true;
  if (!pattern.endsWith("/*")) return pattern === path;
  const prefix = pattern.slice(0, -2);
  return path === prefix || path.startsWith(`${prefix}/`);
}

function parameters(schema: ZodType, location: "path" | "query"): Json[] {
  const converted = jsonSchema(schema, "input");
  const properties = converted.properties as Record<string, Json> | undefined;
  if (!properties) throw new Error(`A ${location} validator must describe an object.`);
  const required = new Set((converted.required as string[] | undefined) ?? []);
  return Object.entries(properties).map(([name, field]) => ({
    name,
    in: location,
    required: location === "path" || required.has(name),
    schema: field,
  }));
}

function operation(method: string, path: string, entries: ApiMetadata[]): Json {
  const response = entries.find((entry) => entry.kind === "response");
  if (!response || response.kind !== "response")
    throw new Error(`${method} ${path} has no response schema. Add responds() next to its handler.`);
  const validations = entries.filter((entry) => entry.kind === "validation");
  const param = validations.find((entry) => entry.kind === "validation" && entry.target === "param");
  const query = validations.find((entry) => entry.kind === "validation" && entry.target === "query");
  const body = validations.find((entry) => entry.kind === "validation" && entry.target === "json");
  const rawBody = entries.find((entry) => entry.kind === "request-body");
  const pathParams = [...path.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g)].map((match) => match[1]);
  const operationParams = [
    ...(param?.kind === "validation" ? parameters(param.schema, "path") : []),
    ...(query?.kind === "validation" ? parameters(query.schema, "query") : []),
  ];
  for (const name of pathParams)
    if (!operationParams.some((value) => value.in === "path" && value.name === name))
      throw new Error(`${method} ${path} has no validator for path parameter ${name}.`);

  const successSchema = jsonSchema(response.schema, "output");
  const success = {
    description: "Successful response.",
    content: {
      [response.mediaType]: {
        schema: response.envelope
          ? { type: "object", properties: { data: successSchema }, required: ["data"] }
          : successSchema,
      },
    },
  };
  const responses: Record<string, unknown> = {};
  for (const code of Object.values(ErrorCode)) responses[String(statusFor(code))] = errorResponse;
  responses[String(response.status)] = success;
  if (response.additionalStatus) responses[String(response.additionalStatus)] = success;

  const security = entries.filter((entry) => entry.kind === "security");
  const requiredScopes = [
    ...security.flatMap((entry) =>
      entry.kind === "security" && entry.mode === "scope" ? [entry.scope] : [],
    ),
    ...entries.flatMap((entry) => (entry.kind === "required-scope" ? [entry.scope] : [])),
  ];
  const session = security.some((entry) => entry.kind === "security" && entry.mode === "session");
  const optionalSession = security.some(
    (entry) => entry.kind === "security" && entry.mode === "optional-session",
  );
  const owner = security.some((entry) => entry.kind === "security" && entry.mode === "owner");
  const conditionalScopes = entries.flatMap((entry) =>
    entry.kind === "conditional-scope" ? [entry.scope] : [],
  );
  const result: Json = {
    operationId: `${method.toLowerCase()}_${path.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}`,
    responses,
    ...(operationParams.length ? { parameters: operationParams } : {}),
    ...(body?.kind === "validation"
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: jsonSchema(body.schema, "input") } },
          },
        }
      : {}),
    ...(rawBody?.kind === "request-body"
      ? {
          requestBody: {
            required: true,
            content: Object.fromEntries(
              rawBody.mediaTypes.map((mediaType) => [
                mediaType,
                { schema: jsonSchema(rawBody.schema, "input") },
              ]),
            ),
          },
        }
      : {}),
    ...(requiredScopes.length
      ? { security: [{ bearerAuth: [] }, { cookieAuth: [] }], "x-required-scopes": requiredScopes }
      : session
        ? { security: [{ cookieAuth: [] }] }
        : optionalSession
          ? { security: [{}, { cookieAuth: [] }] }
          : { security: [] }),
    ...(owner ? { "x-owner-only": true } : {}),
    ...(conditionalScopes.length ? { "x-conditional-scopes": conditionalScopes } : {}),
  };
  return result;
}

/** Every registered route is discovered from Hono, including routes added later. */
export function generateOpenApi(routes: readonly Route[]): Json {
  const paths: Record<string, Record<string, Json>> = {};
  const seen = new Set<string>();
  for (let index = 0; index < routes.length; index += 1) {
    const route = routes[index];
    if (!route || !METHODS.has(route.method)) continue;
    const key = `${route.method} ${route.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const entries: ApiMetadata[] = [];
    for (const [candidateIndex, candidate] of routes.entries()) {
      if (
        (candidate.method === "ALL" && candidateIndex < index && pathMatches(candidate.path, route.path)) ||
        (candidate.method === route.method && candidate.path === route.path)
      ) {
        const item = metadataOf(candidate.handler);
        if (item) entries.push(item);
      }
    }
    const path = route.path.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, "{$1}");
    const operations = paths[path] ?? {};
    operations[route.method.toLowerCase()] = operation(route.method, route.path, entries);
    paths[path] = operations;
  }
  return {
    openapi: "3.1.0",
    info: { title: "layered.work API", version: "1.0.0" },
    servers: [{ url: "/" }],
    paths,
    components: {
      schemas: { ApiError: jsonSchema(apiErrorSchema, "output") },
      securitySchemes: {
        cookieAuth: { type: "apiKey", in: "cookie", name: SESSION_COOKIE },
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "Personal access token" },
      },
    },
  };
}
