import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BrandMark } from "./brand-mark.js";

afterEach(cleanup);

describe("BrandMark", () => {
  it("uses a decorative CSS mask without inline markup or styles", () => {
    const { container, getByRole } = render(
      <a href="https://github.com/LAYEREDwork" aria-label="GitHub">
        <BrandMark brand="github" className="footer-brand" />
      </a>,
    );
    const mark = container.querySelector(".brand-mark");
    expect(mark?.getAttribute("data-brand")).toBe("github");
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
    expect(mark?.classList.contains("footer-brand")).toBe(true);
    expect(mark?.hasAttribute("style")).toBe(false);
    expect(container.querySelector("svg, img")).toBeNull();
    expect(getByRole("link", { name: "GitHub" })).toBeTruthy();
  });
});
