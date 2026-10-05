import { afterEach, expect, it, vi } from "vitest";
import { activateVisibleModels } from "./model-island.js";

afterEach(() => vi.unstubAllGlobals());
it("loads the viewer once and exposes each model source only on intersection", async () => {
  const root = document.createElement("div");
  root.innerHTML =
    '<model-viewer data-model-src="/first.glb"></model-viewer><model-viewer data-model-src="/second.glb"></model-viewer>';
  const models = root.querySelectorAll("model-viewer");
  let notify: IntersectionObserverCallback | undefined;
  const unobserve = vi.fn();
  const observe = vi.fn();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit) {
        notify = callback;
        expect(options.rootMargin).toBe("0px");
      }
      observe = observe;
      unobserve = unobserve;
    },
  );
  const load = vi.fn(async () => {});
  activateVisibleModels(load, root);
  expect(observe).toHaveBeenCalledTimes(2);
  expect(load).not.toHaveBeenCalled();
  const intersect = (index: number, isIntersecting: boolean) =>
    notify?.(
      [{ target: models[index], isIntersecting } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  intersect(0, false);
  expect(load).not.toHaveBeenCalled();
  intersect(0, true);
  await Promise.resolve();
  expect(load).toHaveBeenCalledOnce();
  expect(models[0]?.getAttribute("src")).toBe("/first.glb");
  expect(models[1]?.getAttribute("src")).toBeNull();
  intersect(1, true);
  await Promise.resolve();
  expect(load).toHaveBeenCalledOnce();
  expect(models[1]?.getAttribute("src")).toBe("/second.glb");
});
it("creates no observer or viewer request when the page contains no model", () => {
  const observer = vi.fn();
  vi.stubGlobal("IntersectionObserver", observer);
  const load = vi.fn(async () => {});
  activateVisibleModels(load, document.createElement("div"));
  expect(observer).not.toHaveBeenCalled();
  expect(load).not.toHaveBeenCalled();
});
