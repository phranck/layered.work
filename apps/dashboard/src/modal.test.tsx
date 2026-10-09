import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardApiError } from "./api.js";
import { DashboardLanguageProvider } from "./language-context.js";
import { ConfirmDialog } from "./modal.js";

afterEach(cleanup);

function ask(props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <DashboardLanguageProvider language="en">
      <ConfirmDialog title="Delete Mastodon" onConfirm={onConfirm} onClose={onClose} {...props}>
        <p>The account leaves the footer.</p>
      </ConfirmDialog>
    </DashboardLanguageProvider>,
  );
  const dialog = screen.getByRole("dialog", { name: "Delete Mastodon" });
  return { dialog, onConfirm, onClose };
}

describe("the question before a deletion", () => {
  it("starts on Cancel, names the action on its button, and runs it when confirmed", () => {
    const { dialog, onConfirm, onClose } = ask();
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete Mastodon" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("holds both buttons while the action runs, and the action alone while it is blocked", () => {
    const { dialog, onClose } = ask({ busy: true, confirm: "Deleting…" });
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveProperty("disabled", true);
    expect(within(dialog).getByRole("button", { name: "Deleting…" })).toHaveProperty("disabled", true);
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(onClose).not.toHaveBeenCalled();
    cleanup();

    const blocked = ask({ blocked: true }).dialog;
    expect(within(blocked).getByRole("button", { name: "Cancel" })).toHaveProperty("disabled", false);
    expect(within(blocked).getByRole("button", { name: "Delete Mastodon" })).toHaveProperty("disabled", true);
  });

  it("says a failure inside the dialog, with its id", () => {
    const { dialog } = ask({ error: new DashboardApiError("errorInternal", "delete-9", "internal") });
    const alert = within(dialog).getByRole("alert");
    expect(alert.textContent).toContain("delete-9");
  });
});
