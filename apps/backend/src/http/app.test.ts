import { ErrorCode, readApiError } from "@layered/schemas";
import { describe, expect, it, vi } from "vitest";
import { MAX_BODY_BYTES } from "../config.js";
import { DELIBERATE_MESSAGE, registerProbeRoutes } from "../test-support/probe-routes.js";
import { app } from "./app.js";
import { REQUEST_ID_HEADER } from "./request-id.js";
import { INTERNAL_MESSAGE } from "./response.js";

/**
 * The contract every route inherits, exercised through the real application
 * rather than through a stripped-down copy of it.
 *
 * Hono answers `app.request()` without a socket, so these run the whole
 * middleware chain, the validator, the error handler and the response builder,
 * which is what makes them worth having: a test against a second app assembled
 * for the test proves that the second app works.
 */

/** Told when the validated route's handler runs, so a test can assert that it did not. */
const handler = vi.fn();

registerProbeRoutes(app, handler);

/** Reads the failure out of a response, asserting that it is one. */
async function failureOf(response: Response) {
  const failure = readApiError(await response.json());
  expect(failure, "the response was not in the error shape").not.toBeNull();
  return failure as NonNullable<ReturnType<typeof readApiError>>;
}

describe("the request id", () => {
  it("is on every response and can be quoted", async () => {
    const response = await app.request("/health");
    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("differs between two requests", async () => {
    const [first, second] = await Promise.all([app.request("/health"), app.request("/health")]);
    expect(first.headers.get(REQUEST_ID_HEADER)).not.toBe(second.headers.get(REQUEST_ID_HEADER));
  });

  it("is ours, not the caller's", async () => {
    // An inbound value can repeat, so two failures would share an id and
    // neither could be found. It is also whatever somebody chose to send.
    const response = await app.request("/health", {
      headers: { [REQUEST_ID_HEADER]: "chosen-by-the-caller" },
    });
    expect(response.headers.get(REQUEST_ID_HEADER)).not.toBe("chosen-by-the-caller");
  });

  it("is the same value in the header and in the failure", async () => {
    const response = await app.request("/nothing-here");
    const failure = await failureOf(response);
    expect(failure.id).toBe(response.headers.get(REQUEST_ID_HEADER));
  });
});

describe("an address that is not there", () => {
  it("answers 404 in the same shape as everything else", async () => {
    const response = await app.request("/nothing-here");
    expect(response.status).toBe(404);
    expect((await failureOf(response)).code).toBe(ErrorCode.NotFound);
  });
});

describe("a request that does not fit its schema", () => {
  it("is refused with a code, and the handler never runs", async () => {
    handler.mockClear();
    const response = await app.request("/test/validated", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });

    expect(response.status).toBe(400);
    expect((await failureOf(response)).code).toBe(ErrorCode.InvalidRequest);
    expect(handler).not.toHaveBeenCalled();
  });

  it("is refused for a property nobody declared", async () => {
    handler.mockClear();
    const response = await app.request("/test/validated", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Fine", isAdmin: true }),
    });

    expect(response.status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });

  it("says nothing about what the schema wanted", async () => {
    const response = await app.request("/test/validated", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: 42 }),
    });

    const text = JSON.stringify(await response.json());
    expect(text).not.toMatch(/zod/i);
    expect(text).not.toMatch(/expected/i);
    expect(text).not.toMatch(/title/);
  });

  it("lets a request that does fit through", async () => {
    handler.mockClear();
    const response = await app.request("/test/validated", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Fine" }),
    });

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe("a body larger than this API accepts", () => {
  it("is refused before it is read", async () => {
    const response = await app.request("/test/validated", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "x".repeat(MAX_BODY_BYTES + 1) }),
    });

    expect(response.status).toBe(413);
    expect((await failureOf(response)).code).toBe(ErrorCode.PayloadTooLarge);
  });
});

describe("something thrown by a handler", () => {
  it("keeps its code and its message when it was written to be read", async () => {
    const response = await app.request("/test/throws-deliberately");
    expect(response.status).toBe(409);

    const failure = await failureOf(response);
    expect(failure.code).toBe(ErrorCode.Conflict);
    expect(failure.message).toBe(DELIBERATE_MESSAGE);
  });

  it("says nothing at all when it was not", async () => {
    const response = await app.request("/test/throws-unexpectedly");
    expect(response.status).toBe(500);

    const failure = await failureOf(response);
    expect(failure.code).toBe(ErrorCode.Internal);
    expect(failure.message).toBe(INTERNAL_MESSAGE);
  });

  it("never lets the thrown message reach the caller", async () => {
    // The message this route throws carries a connection string with a
    // password in it, which is exactly the shape of the accident being guarded
    // against: nobody writes a secret into an error, a library does.
    const response = await app.request("/test/throws-unexpectedly");
    const text = JSON.stringify(await response.json());

    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("postgres://");
    expect(text).not.toMatch(/at .*\.ts:\d+/);
  });

  it("gives the caller an id to quote", async () => {
    const response = await app.request("/test/throws-unexpectedly");
    const failure = await failureOf(response);
    expect(failure.id).toBe(response.headers.get(REQUEST_ID_HEADER));
  });
});
