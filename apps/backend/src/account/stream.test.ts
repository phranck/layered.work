import { describe, expect, it, vi } from "vitest";
import { observeMediaStream } from "./stream.js";

describe("observeMediaStream", () => {
  it("reports an upstream failure that occurs after streaming starts", async () => {
    const failure = new Error("object stream failed");
    const onError = vi.fn();
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(failure);
      },
    });

    const read = observeMediaStream(source, onError).getReader().read();

    await expect(read).rejects.toBe(failure);
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("cancels the upstream reader when the response consumer cancels", async () => {
    const cancel = vi.fn();
    const source = new ReadableStream<Uint8Array>({ cancel });

    await observeMediaStream(source, vi.fn()).cancel("caller left");

    expect(cancel).toHaveBeenCalledWith("caller left");
  });
});
