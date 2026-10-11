import { afterEach, describe, expect, it, vi } from "vitest";
import { startSky } from "./sky.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Stands in for the browser's observer, keeping what it watches and letting the test report on it. */
function watchVisibility() {
  const observed: Element[] = [];
  let report: IntersectionObserverCallback = () => {};
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        report = callback;
      }
      observe(element: Element) {
        observed.push(element);
      }
      disconnect() {}
    },
  );
  const tell = (entries: Array<[Element, boolean]>) =>
    report(
      entries.map(([target, isIntersecting]) => ({ target, isIntersecting })) as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    );
  return { observed, tell };
}

/** A canvas whose drawing context records nothing, since the test environment draws nothing. */
function quietCanvas(): HTMLCanvasElement {
  const context = { setTransform: vi.fn(), clearRect: vi.fn() } as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
  return document.createElement("canvas");
}

describe("the web behind the bands that show it", () => {
  it("is drawn while any band it shows through is in view and rests while none is", () => {
    const { observed, tell } = watchVisibility();
    const requested = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(7);
    const cancelled = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const canvas = quietCanvas();
    const first = document.createElement("section");
    const second = document.createElement("section");

    const stop = startSky(canvas, { watch: [first, second] });
    expect(observed).toEqual([first, second]);

    tell([
      [first, false],
      [second, true],
    ]);
    expect(cancelled).not.toHaveBeenCalled();

    tell([[second, false]]);
    expect(cancelled).toHaveBeenCalledWith(7);

    requested.mockClear();
    tell([[first, true]]);
    expect(requested).toHaveBeenCalledTimes(1);
    stop();
  });

  it("watches its own canvas where nothing else is named", () => {
    const { observed } = watchVisibility();
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const canvas = quietCanvas();
    startSky(canvas)();
    expect(observed).toEqual([canvas]);
  });
});
