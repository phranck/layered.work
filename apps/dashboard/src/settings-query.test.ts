import { mailSettings } from "@layered/schemas";
import { describe, expect, it } from "vitest";
import { checkedSettings, testMailBlocker } from "./settings-query.js";

describe("a test message", () => {
  it("needs a key first, then saved settings, then a sender", () => {
    expect(testMailBlocker(false, true, null)).toBe("testMailNeedsKey");
    expect(testMailBlocker(true, true, null)).toBe("testMailNeedsSave");
    expect(testMailBlocker(true, false, null)).toBe("testMailNeedsSender");
    expect(testMailBlocker(true, false, "mail@layered.work")).toBeUndefined();
  });
});

describe("a settings group's draft", () => {
  it("names a failing field by its reason, and a field without one as a refused request", () => {
    const outcome = checkedSettings(
      mailSettings,
      { senderAddress: "not an address", senderName: "x".repeat(10_000) },
      { senderAddress: "invalidSenderAddress" },
    );
    expect(outcome).toEqual({ problems: ["invalidSenderAddress", "errorInvalidRequest"] });
  });
});
