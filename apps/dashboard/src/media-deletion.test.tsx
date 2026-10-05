import type { MediaDetail } from "@layered/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createDashboardApi } from "./api.js";
import { DashboardApiProvider } from "./dashboard-context.js";
import { DashboardLanguageProvider } from "./language-context.js";
import { MediaDeleteDialog } from "./media-deletion.js";

const notices = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock("./notifications.js", () => ({ useNotify: () => notices }));
const detail: MediaDetail = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "owned-picture",
  kind: "image",
  mimeType: "image/png",
  byteSize: 5,
  width: 400,
  height: 200,
  uploadedAt: "2026-10-05T10:00:00Z",
  url: "/picture",
  focalPoint: { x: 0.5, y: 0.5 },
  processingState: "ready",
  translations: { en: { altText: null, caption: null }, de: { altText: null, caption: null } },
  processing: { state: "ready", errorId: null, variants: [] },
  uses: [],
};
let client: QueryClient;
afterEach(() => {
  cleanup();
  client.clear();
  vi.clearAllMocks();
});
function show(value = detail) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const remove = vi.fn(async () => ({
    deleted: true as const,
    cleanupState: "ready" as const,
    removedObjects: 3,
    errorId: null,
  }));
  const close = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <DashboardApiProvider api={{ ...createDashboardApi(client, () => {}), deleteMedia: remove }}>
        <DashboardLanguageProvider language="de">
          <MediaDeleteDialog detail={value} onClose={close} onDeleted={close} />
        </DashboardLanguageProvider>
      </DashboardApiProvider>
    </QueryClientProvider>,
  );
  return { remove, close };
}
it("only removes the unused file after explicit confirmation and reports the object count", async () => {
  const { remove, close } = show();
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Datei löschen" }));
  await vi.waitFor(() => expect(remove).toHaveBeenCalledWith(detail.id));
  expect(notices.notify).toHaveBeenCalledWith(
    expect.objectContaining({ message: "Datei und 3 Speicherobjekte gelöscht." }),
  );
  expect(close).toHaveBeenCalledOnce();
});
it("names and links a referencing entry and disables deletion", () => {
  const { remove } = show({
    ...detail,
    uses: [{ id: detail.id, title: "Referenced draft", language: "en", kind: "post" }],
  });
  expect(screen.getByRole("link", { name: "Referenced draft (EN)" }).getAttribute("href")).toBe(
    `/posts/${detail.id}`,
  );
  expect(screen.getByRole("button", { name: "Datei löschen" }).hasAttribute("disabled")).toBe(true);
  expect(remove).not.toHaveBeenCalled();
});
