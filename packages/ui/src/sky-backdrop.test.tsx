import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SkyBackdrop } from "./sky-backdrop.js";

afterEach(cleanup);

describe("the sky behind a screen", () => {
  it("is a fixed layer hidden from assistive technology, holding the canvas the web is drawn on", () => {
    const { container } = render(<SkyBackdrop />);
    const layer = container.querySelector(".sky");
    expect(layer?.getAttribute("aria-hidden")).toBe("true");
    expect(layer?.querySelector("canvas.sky__web")).toBeTruthy();
  });

  it("stops listening to the window when it goes", () => {
    const removed = vi.spyOn(window, "removeEventListener");
    const context = { setTransform: vi.fn(), clearRect: vi.fn() } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
    const { unmount } = render(<SkyBackdrop />);
    unmount();
    expect(removed.mock.calls.map(([type]) => type)).toEqual(
      expect.arrayContaining(["pointermove", "pointerleave", "resize"]),
    );
    vi.restoreAllMocks();
  });
});
