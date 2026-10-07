// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { readStored, writeStored } from "./stored.js";

const KEY = "layered:test:stored";

/**
 * Makes `window.localStorage` throw on access, as Safari does where a site may
 * not store anything.
 *
 * @returns A function that puts storage back.
 */
function refuseStorage(): () => void {
  const own = Object.getOwnPropertyDescriptor(window, "localStorage");
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get() {
      throw new DOMException("The operation is insecure.", "SecurityError");
    },
  });
  return () => {
    if (own) Object.defineProperty(window, "localStorage", own);
    else Reflect.deleteProperty(window, "localStorage");
  };
}

afterEach(() => {
  window.localStorage.removeItem(KEY);
});

describe("a choice kept in the browser", () => {
  it("reads back what was written", () => {
    expect(readStored(KEY)).toBeNull();
    writeStored(KEY, "list");
    expect(readStored(KEY)).toBe("list");
  });

  it("reads nothing and keeps nothing where storage refuses, without failing", () => {
    const restore = refuseStorage();
    try {
      expect(() => window.localStorage).toThrow();
      expect(readStored(KEY)).toBeNull();
      expect(() => writeStored(KEY, "list")).not.toThrow();
    } finally {
      restore();
    }
    expect(readStored(KEY)).toBeNull();
  });
});
