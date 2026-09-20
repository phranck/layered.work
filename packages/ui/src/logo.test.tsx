import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Logo } from "./logo.js";

afterEach(cleanup);

describe("Logo optical height", () => {
  it("accepts a numeric optical height as CSS pixels", () => {
    const { getByRole } = render(<Logo inkHeight={60} />);
    expect(getByRole("link").style.getPropertyValue("--logo-ink-height")).toBe("60px");
  });

  it("preserves CSS lengths and the accessible wordmark", () => {
    const { getByRole } = render(<Logo inkHeight="2rem" href="/home" />);
    const link = getByRole("link", { name: "LAYERED.work" });
    expect(link.style.getPropertyValue("--logo-ink-height")).toBe("2rem");
    expect(link.getAttribute("href")).toBe("/home");
    expect(getByRole("img", { name: "LAYERED.work" }).getAttribute("src")).toBe("/logo.svg");
  });
});
