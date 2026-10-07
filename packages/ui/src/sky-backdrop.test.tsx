import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SkyBackdrop, SkyBand } from "./sky-backdrop.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** A drawing context that records nothing, since the test environment draws nothing. */
function quietCanvas() {
  const context = { setTransform: vi.fn(), clearRect: vi.fn() } as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
}

describe("the sky behind a screen", () => {
  it("is a fixed layer hidden from assistive technology, holding the canvas the web is drawn on", () => {
    const { container } = render(<SkyBackdrop />);
    const layer = container.querySelector(".sky");
    expect(layer?.getAttribute("aria-hidden")).toBe("true");
    expect(layer?.classList.contains("sky--band")).toBe(false);
    expect(layer?.querySelector("canvas.sky__web")).toBeTruthy();
  });

  it("stops listening to the window and stops watching its size and visibility when it goes", () => {
    quietCanvas();
    const removed = vi.spyOn(window, "removeEventListener");
    const sizing = vi.spyOn(ResizeObserver.prototype, "disconnect");
    const visibility = vi.spyOn(IntersectionObserver.prototype, "disconnect");
    const { unmount } = render(<SkyBackdrop />);
    unmount();
    expect(removed.mock.calls.map(([type]) => type)).toEqual(
      expect.arrayContaining(["pointermove", "pointerleave"]),
    );
    expect(sizing).toHaveBeenCalled();
    expect(visibility).toHaveBeenCalled();
  });
});

describe("the sky behind a band", () => {
  it("is the same layer and canvas, marked as a band's", () => {
    const { container } = render(<SkyBand />);
    const layer = container.querySelector(".sky.sky--band");
    expect(layer?.getAttribute("aria-hidden")).toBe("true");
    expect(layer?.querySelector("canvas.sky__web")).toBeTruthy();
  });
});
