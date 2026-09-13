import { ErrorCode } from "@layered/schemas";
import { describe, expect, it, vi } from "vitest";
import { registerProbeRoutes } from "../test-support/probe-routes.js";
import { app } from "./app.js";
import { REQUEST_ID_HEADER } from "./request-id.js";

registerProbeRoutes(app);

/**
 * What a failed request leaves behind, so that somebody holding an id can find
 * out what happened.
 *
 * The logger is spied on rather than replaced, because what is being checked is
 * what the application actually writes.
 */

/** Captures what was logged whilst something runs. */
async function linesWhilst(run: () => Response | Promise<Response>) {
  const { logger } = await import("../logger.js");
  const written: { level: string; fields: Record<string, unknown>; message: string }[] = [];

  const spies = (["info", "warn", "error"] as const).map((level) =>
    vi.spyOn(logger, level).mockImplementation(((fields: Record<string, unknown>, message: string) => {
      written.push({ level, fields, message });
    }) as never),
  );

  try {
    const response = await run();
    return { response, written };
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
}

describe("a request that failed", () => {
  it("is explained by exactly one line, which carries the route and the cause", async () => {
    const { response, written } = await linesWhilst(() => app.request("/test/throws-unexpectedly"));
    const id = response.headers.get(REQUEST_ID_HEADER);

    const mentioning = written.filter((line) => line.fields.requestId === id);
    const explaining = mentioning.filter((line) => "err" in line.fields);

    expect(explaining).toHaveLength(1);
    expect(explaining[0]?.level).toBe("error");
    expect(explaining[0]?.fields.route).toBe("/test/throws-unexpectedly");
    expect(explaining[0]?.fields.code).toBe(ErrorCode.Internal);

    // The other line is the access record: the same id, and no second opinion
    // about what went wrong, so an alert counting failures counts one.
    expect(mentioning.length).toBe(2);
    expect(mentioning.filter((line) => line.message === "request")).toHaveLength(1);
  });

  it("is recorded at error when it is a fault and at info when it is the caller", async () => {
    const fault = await linesWhilst(() => app.request("/test/throws-unexpectedly"));
    const refusal = await linesWhilst(() =>
      app.request("/test/validated", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "" }),
      }),
    );

    // A noisy category must not be able to bury a serious one, which is the
    // only reason a log has levels at all.
    expect(fault.written.some((line) => line.level === "error")).toBe(true);
    expect(refusal.written.every((line) => line.level !== "error")).toBe(true);
  });

  it("records a deliberate failure without a stack, because nothing went wrong here", async () => {
    const { written } = await linesWhilst(() => app.request("/test/throws-deliberately"));
    const explaining = written.filter((line) => line.fields.code === ErrorCode.Conflict);

    expect(explaining).toHaveLength(1);
    expect(explaining[0]?.level).toBe("info");
  });
});

describe("every request", () => {
  it("leaves one line with the method, the route, the status and how long it took", async () => {
    const { written } = await linesWhilst(() => app.request("/health"));
    const access = written.filter((line) => line.message === "request");

    expect(access).toHaveLength(1);
    expect(access[0]?.fields).toMatchObject({ method: "GET", route: "/health", status: 200 });
    expect(access[0]?.fields.durationMs).toBeTypeOf("number");
  });

  it("records the route rather than the path, so one line per address is not one per visitor", async () => {
    // `/entries/:slug` groups; `/entries/the-soundbox` does not, and a path is
    // also where somebody's data ends up in a log by accident.
    const { written } = await linesWhilst(() => app.request("/nothing-here"));
    const access = written.find((line) => line.message === "request");

    expect(access?.fields.route).not.toContain("nothing-here");
  });
});
