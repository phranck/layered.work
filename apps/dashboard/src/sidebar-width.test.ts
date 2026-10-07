import { act, renderHook } from "@testing-library/react";
import type { PointerEvent } from "react";
import { describe, expect, it } from "vitest";
import { clampWidth, restoredWidth, type SidebarBounds, useSidebarWidth } from "./sidebar-width.js";

const bounds: SidebarBounds = { min: 190, max: 420, initial: 248 };

describe("the sidebar's width", () => {
  it("stays inside the bounds the stylesheet declares", () => {
    expect(clampWidth(100, bounds)).toBe(190);
    expect(clampWidth(500, bounds)).toBe(420);
    expect(clampWidth(300.4, bounds)).toBe(300);
  });

  it("comes back at the width it was left at", () => {
    expect(restoredWidth("312", bounds)).toBe(312);
  });

  it("falls back to the default when nothing usable was stored", () => {
    expect(restoredWidth(null, bounds)).toBe(248);
    expect(restoredWidth("", bounds)).toBe(248);
    expect(restoredWidth("wide", bounds)).toBe(248);
  });

  it("is clamped when the bounds have moved since it was stored", () => {
    expect(restoredWidth("600", bounds)).toBe(420);
    expect(restoredWidth("80", bounds)).toBe(190);
  });
});

describe("dragging the sidebar's edge under the interface scale", () => {
  it("keeps the edge under the pointer when the document is zoomed", () => {
    const workbench = document.createElement("div");
    workbench.style.setProperty("--sidebar-min", "190px");
    workbench.style.setProperty("--sidebar-max", "420px");
    workbench.style.setProperty("--sidebar-width", "248px");
    document.body.append(workbench);
    const handle = document.createElement("div");
    Object.defineProperty(handle, "currentCSSZoom", { value: 1.25 });
    handle.setPointerCapture = () => {};
    handle.hasPointerCapture = () => false;
    const pointer = (clientX: number) =>
      ({
        button: 0,
        clientX,
        pointerId: 1,
        currentTarget: handle,
        preventDefault: () => {},
      }) as unknown as PointerEvent<HTMLDivElement>;

    const workbenchRef = { current: workbench };
    const { result } = renderHook(() => useSidebarWidth(workbenchRef));
    act(() => result.current.onPointerDown(pointer(300)));
    act(() => result.current.onPointerMove(pointer(425)));

    // 125 window pixels at a zoom of 1.25 are 100 of the document's.
    expect(workbench.style.getPropertyValue("--sidebar-width")).toBe("348px");
    workbench.remove();
  });
});
