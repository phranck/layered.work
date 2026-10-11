import type { MediaDetail } from "@layered/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createDashboardApi } from "./api.js";
import { DashboardApiProvider } from "./dashboard-context.js";
import { DashboardLanguageProvider } from "./language-context.js";
import { MediaDetailDialog } from "./media-detail.js";
import { chooseTextLanguage, writeInEditor } from "./test-support.js";

let client: QueryClient;
afterEach(() => {
  cleanup();
  client.clear();
});

const detail: MediaDetail = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "picture",
  kind: "image",
  mimeType: "image/png",
  byteSize: 5,
  width: 400,
  height: 200,
  uploadedAt: "2026-10-05T10:00:00Z",
  url: "/picture",
  focalPoint: { x: 0.3, y: 0.7 },
  processingState: "ready",
  translations: { en: { altText: null, caption: null }, de: { altText: null, caption: null } },
  processing: { state: "ready", errorId: null, variants: [] },
  uses: [],
  watermark: null,
  credit: null,
};

/** Opens the dialog for `shown` and returns what saving and closing were called with. */
function openDialog(shown: MediaDetail) {
  const save = vi.fn(async () => shown);
  const close = vi.fn();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DashboardApiProvider
        api={{
          ...createDashboardApi(client, () => {}),
          fetchMediaDetail: async () => shown,
          saveMediaMetadata: save,
        }}
      >
        <DashboardLanguageProvider language="de">
          <MediaDetailDialog id={shown.id} onClose={close} />
        </DashboardLanguageProvider>
      </DashboardApiProvider>
    </QueryClientProvider>,
  );
  return { save, close };
}

it("credits a picture from Unsplash and offers it no watermark", async () => {
  openDialog({
    ...detail,
    credit: { photographer: "Jane Doe", profileUrl: "https://unsplash.com/@janedoe" },
  });
  const author = await screen.findByRole("link", { name: "Jane Doe" });
  expect(author.getAttribute("href")).toBe(
    "https://unsplash.com/@janedoe?utm_source=layered_work&utm_medium=referral",
  );
  expect(author.closest("small")?.textContent).toBe("Foto von Jane Doe auf Unsplash");
  expect(screen.queryByLabelText("Wasserzeichen")).toBeNull();
});

it("saves a watermark position, and none as null", async () => {
  const { save } = openDialog({ ...detail, watermark: "top-left" });
  const select = (await screen.findByLabelText("Wasserzeichen")) as HTMLSelectElement;
  expect(select.value).toBe("top-left");
  fireEvent.change(select, { target: { value: "bottom-right" } });
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
  await vi.waitFor(() =>
    expect(save).toHaveBeenLastCalledWith(detail.id, expect.objectContaining({ watermark: "bottom-right" })),
  );

  cleanup();
  const second = openDialog({ ...detail, watermark: "center" });
  fireEvent.change(await screen.findByLabelText("Wasserzeichen"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
  await vi.waitFor(() =>
    expect(second.save).toHaveBeenLastCalledWith(detail.id, expect.objectContaining({ watermark: null })),
  );
});

it("saves localized descriptions and an explicit decorative choice with the focal point", async () => {
  const { save, close } = openDialog(detail);
  fireEvent.change(await screen.findByLabelText("Alternativtext"), { target: { value: " Berge " } });
  await writeInEditor("Bildunterschrift", " Sonnenuntergang ");
  chooseTextLanguage("en");
  fireEvent.click(screen.getByRole("switch", { name: "Dekorativ" }));
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
  await vi.waitFor(() =>
    expect(save).toHaveBeenCalledWith(detail.id, {
      focalPoint: detail.focalPoint,
      translations: [
        { language: "en", altText: "", caption: null },
        { language: "de", altText: "Berge", caption: "Sonnenuntergang" },
      ],
      watermark: null,
    }),
  );
  expect(close).toHaveBeenCalledOnce();
});
