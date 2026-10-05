import type { MediaDetail } from "@layered/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createDashboardApi } from "./api.js";
import { DashboardApiProvider } from "./dashboard-context.js";
import { DashboardLanguageProvider } from "./language-context.js";
import { MediaDetailDialog } from "./media-detail.js";

let client: QueryClient;
afterEach(() => {
  cleanup();
  client.clear();
});
it("saves localized descriptions and an explicit decorative choice with the focal point", async () => {
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
  };
  const save = vi.fn(async () => detail);
  const close = vi.fn();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DashboardApiProvider
        api={{
          ...createDashboardApi(client, () => {}),
          fetchMediaDetail: async () => detail,
          saveMediaMetadata: save,
        }}
      >
        <DashboardLanguageProvider language="de">
          <MediaDetailDialog id={detail.id} onClose={close} />
        </DashboardLanguageProvider>
      </DashboardApiProvider>
    </QueryClientProvider>,
  );
  fireEvent.change(await screen.findByLabelText("Alternativtext auf Deutsch"), {
    target: { value: " Berge " },
  });
  fireEvent.change(screen.getByLabelText("Bildunterschrift auf Deutsch"), {
    target: { value: " Sonnenuntergang " },
  });
  fireEvent.click(screen.getByRole("switch", { name: "Dekorativ auf Englisch" }));
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
  await vi.waitFor(() =>
    expect(save).toHaveBeenCalledWith(detail.id, {
      focalPoint: detail.focalPoint,
      translations: [
        { language: "en", altText: "", caption: null },
        { language: "de", altText: "Berge", caption: "Sonnenuntergang" },
      ],
    }),
  );
  expect(close).toHaveBeenCalledOnce();
});
