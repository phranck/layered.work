import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { AppBarSlotsProvider } from "./app-bar-slots.js";
import { DashboardLanguageProvider } from "./language-context.js";
import { NotificationProvider, useNotify } from "./notifications.js";

/**
 * How a notification leaves: when its fade ends, which the stylesheet times,
 * or at once where nothing fades.
 */

/** A stylesheet giving the notification the fade the dashboard's own gives it. */
let fade: HTMLStyleElement | null = null;

afterEach(() => {
  cleanup();
  fade?.remove();
  fade = null;
});

/** Shows a failure, which stays until it is closed, in the bar. */
function Failure() {
  const { notify } = useNotify();
  return (
    <button type="button" onClick={() => notify({ tone: "danger", message: "Gone wrong" })}>
      Fail
    </button>
  );
}

function show() {
  render(
    <DashboardLanguageProvider language="en">
      <AppBarSlotsProvider>
        {(bar) => (
          <NotificationProvider>
            {bar}
            <Failure />
          </NotificationProvider>
        )}
      </AppBarSlotsProvider>
    </DashboardLanguageProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Fail" }));
}

/** The notification as it stands in the bar, or null once it has gone. */
const pill = () => document.querySelector(".notification");

it("stays whilst it fades, and goes when the fade ends", () => {
  fade = document.createElement("style");
  // Written out in its parts, because the test document does not read them out of `transition`.
  fade.textContent = ".notification { transition-property: opacity; transition-duration: 160ms; }";
  document.head.append(fade);
  show();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(pill()?.hasAttribute("data-leaving")).toBe(true);
  fireEvent.transitionEnd(pill() as Element);
  expect(pill()).toBeNull();
});

it("goes at once where nothing fades", () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(pill()).toBeNull();
});
