import { describe, expect, it } from "vitest";
import { clampWidth, restoredWidth, type SidebarBounds } from "./sidebar-width.js";

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
