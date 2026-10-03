import { afterEach, describe, expect, it, vi } from "vitest";
import { browserLanguage, type DashboardStringKey, dashboardText } from "./dashboard-i18n.js";

afterEach(() => vi.restoreAllMocks());

describe("the dashboard catalogue", () => {
  it("speaks the language it is asked for", () => {
    expect(dashboardText("de", "settings")).toBe("Einstellungen");
    expect(dashboardText("en", "settings")).toBe("Settings");
  });

  it("shows a key it does not hold as the key itself", () => {
    expect(dashboardText("en", "notInTheCatalogue" as DashboardStringKey)).toBe("notInTheCatalogue");
  });
});

describe("the language before sign-in", () => {
  it("follows the first German or English preference of the browser", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["fr-FR", "de-AT", "en"]);
    expect(browserLanguage()).toBe("de");
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-GB", "de"]);
    expect(browserLanguage()).toBe("en");
  });

  it("falls back to English when the browser prefers neither", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["fr-FR"]);
    expect(browserLanguage()).toBe("en");
  });
});
