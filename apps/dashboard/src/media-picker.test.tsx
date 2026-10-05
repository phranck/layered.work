import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createDashboardApi } from "./api.js";
import { DashboardApiProvider } from "./dashboard-context.js";
import { DashboardLanguageProvider } from "./language-context.js";
import { MediaPicker } from "./media-picker.js";

let client: QueryClient;
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});
it("shows the processing state for every image without changing the picker interaction", async () => {
  vi.stubGlobal("__API_BASE__", "/api");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        data: {
          page: 1,
          hasMore: false,
          items: ["queued", "processing", "ready", "failed"].map((processingState, index) => ({
            id: `00000000-0000-4000-8000-00000000000${index + 1}`,
            slug: `image-${index}`,
            url: `/image-${index}`,
            width: 400,
            height: 200,
            processingState,
          })),
        },
      }),
    ),
  );
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DashboardApiProvider api={createDashboardApi(client, () => {})}>
        <DashboardLanguageProvider language="de">
          <MediaPicker onCancel={() => {}} onChoose={() => {}} />
        </DashboardLanguageProvider>
      </DashboardApiProvider>
    </QueryClientProvider>,
  );
  expect(await screen.findByText("Wartet auf Verarbeitung")).toBeTruthy();
  for (const label of ["Wird verarbeitet…", "Bereit", "Verarbeitung fehlgeschlagen"])
    expect(screen.getByText(label)).toBeTruthy();
});
