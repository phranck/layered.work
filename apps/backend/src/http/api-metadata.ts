import type { TokenScope } from "@layered/schemas";
import type { MiddlewareHandler } from "hono";
import type { ZodType } from "zod";

export type ApiMetadata =
  | { kind: "validation"; target: string; schema: ZodType }
  | { kind: "security"; mode: "scope"; scope: TokenScope }
  | { kind: "security"; mode: "session" | "optional-session" | "owner" }
  | {
      kind: "response";
      schema: ZodType;
      status: number;
      mediaType: string;
      envelope: boolean;
      additionalStatus?: number;
    }
  | { kind: "conditional-scope"; scope: TokenScope }
  | { kind: "required-scope"; scope: TokenScope }
  | { kind: "request-body"; mediaTypes: readonly string[]; schema: ZodType };

const metadata = new WeakMap<object, ApiMetadata>();

export function describeMiddleware<T extends MiddlewareHandler>(handler: T, value: ApiMetadata): T {
  metadata.set(handler, value);
  return handler;
}

export function metadataOf(handler: object): ApiMetadata | undefined {
  return metadata.get(handler);
}

/** A route's success shape is declared next to its handler and used by the API description. */
export function responds(
  schema: ZodType,
  options: {
    status?: number;
    mediaType?: string;
    envelope?: boolean;
    additionalStatus?: number;
  } = {},
): MiddlewareHandler {
  return describeMiddleware(async (_c, next) => next(), {
    kind: "response",
    schema,
    status: options.status ?? 200,
    mediaType: options.mediaType ?? "application/json",
    envelope: options.envelope ?? true,
    additionalStatus: options.additionalStatus,
  });
}

/** For byte streams whose size and MIME type are checked outside JSON validation. */
export function acceptsRaw(schema: ZodType, mediaTypes: readonly string[]): MiddlewareHandler {
  return describeMiddleware(async (_c, next) => next(), { kind: "request-body", schema, mediaTypes });
}
