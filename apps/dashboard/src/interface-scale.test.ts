import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyStoredInterfaceScale,
  INTERFACE_SCALE_KEY,
  restoredScale,
  useInterfaceScale,
  zoomOf,
} from "./interface-scale.js";

afterEach(() => {
  window.localStorage.removeItem(INTERFACE_SCALE_KEY);
  document.documentElement.removeAttribute("data-interface-scale");
});

describe("the stored interface size", () => {
  it("is the step that was stored", () => {
    expect(restoredScale("xl")).toBe("xl");
  });

  it("is the standard size where nothing or something unknown was stored", () => {
    expect(restoredScale(null)).toBe("m");
    expect(restoredScale("huge")).toBe("m");
    expect(restoredScale("")).toBe("m");
  });

  it("sizes the document before anything renders", () => {
    window.localStorage.setItem(INTERFACE_SCALE_KEY, "l");
    applyStoredInterfaceScale();
    expect(document.documentElement.getAttribute("data-interface-scale")).toBe("l");
  });
});

describe("choosing the interface size", () => {
  it("applies the step at once and keeps it for the next visit", () => {
    const { result } = renderHook(() => useInterfaceScale());
    expect(result.current[0]).toBe("m");

    act(() => result.current[1]("s"));

    expect(result.current[0]).toBe("s");
    expect(document.documentElement.getAttribute("data-interface-scale")).toBe("s");
    expect(window.localStorage.getItem(INTERFACE_SCALE_KEY)).toBe("s");
  });
});

describe("the zoom an element is shown at", () => {
  it("is the zoom the browser reports, and one where it reports none", () => {
    const zoomed = document.createElement("div");
    Object.defineProperty(zoomed, "currentCSSZoom", { value: 1.25 });
    expect(zoomOf(zoomed)).toBe(1.25);
    expect(zoomOf(document.createElement("div"))).toBe(1);
  });
});
