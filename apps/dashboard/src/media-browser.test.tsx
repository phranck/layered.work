import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { DashboardApi } from "./api.js";
import { createDashboardApi } from "./api.js";
import { DashboardApiProvider } from "./dashboard-context.js";
import { DashboardLanguageProvider } from "./language-context.js";
import { MediaBrowser } from "./media-browser.js";

const id = "00000000-0000-4000-8000-000000000001";
const picture = {
  id,
  slug: "very-long-file-name",
  kind: "image",
  mimeType: "image/png",
  byteSize: 123,
  width: 400,
  height: 200,
  uploadedAt: "2026-10-05T10:00:00Z",
  url: "/picture",
  processingState: "ready",
  focalPoint: { x: 0.5, y: 0.5 },
};
let client: QueryClient;
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});
function show(choose?: (slug: string, item: unknown) => void, overrides: Partial<DashboardApi> = {}) {
  vi.stubGlobal("__API_BASE__", "/api");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ data: { items: [picture], page: 1, hasMore: false } })),
  );
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DashboardApiProvider api={{ ...createDashboardApi(client, () => {}), ...overrides }}>
        <DashboardLanguageProvider language="de">
          <MediaBrowser onChoose={choose} />
        </DashboardLanguageProvider>
      </DashboardApiProvider>
    </QueryClientProvider>,
  );
}
it("uses the library grid as a picker and returns the stable slug", async () => {
  const choose = vi.fn();
  show(choose);
  fireEvent.click(await screen.findByRole("button", { name: /very-long-file-name/ }));
  expect(choose).toHaveBeenCalledWith(picture.slug, expect.objectContaining({ id }));
});
it("requests only unused files when the filter is selected", async () => {
  show(vi.fn());
  await screen.findByRole("button", { name: /very-long-file-name/ });
  fireEvent.click(screen.getByRole("switch", { name: "Nur ungenutzte Dateien" }));
  await vi.waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/media?search=&kind=all&page=1&unused=true",
      expect.objectContaining({ credentials: "include" }),
    ),
  );
});
it("uploads multiple dropped files with progress and selects the final successful file", async () => {
  const choose = vi.fn();
  const upload = vi.fn<DashboardApi["uploadMedia"]>(async (file, progress) => {
    progress?.(50);
    return { id, slug: file.name, url: "/picture", width: 400, height: 200, existing: false };
  });
  const detail = {
    ...picture,
    kind: "image" as const,
    processingState: "ready" as const,
    translations: { en: { altText: null, caption: null }, de: { altText: null, caption: null } },
    processing: { state: "ready" as const, errorId: null, variants: [] },
    uses: [],
    watermark: null,
    credit: null,
  };
  show(choose, { uploadMedia: upload, fetchMediaDetail: async () => detail });
  const files = [
    new File(["one"], "one.png", { type: "image/png" }),
    new File(["two"], "two.png", { type: "image/png" }),
  ];
  fireEvent.drop(screen.getByRole("region", { name: "Bilder hier ablegen oder Dateien auswählen." }), {
    dataTransfer: { files },
  });
  await screen.findByRole("progressbar", { name: "two.png: 50%" });
  await vi.waitFor(() => expect(choose).toHaveBeenCalledWith(detail.slug, expect.objectContaining({ id })));
  expect(upload.mock.calls.map(([file]) => file.name)).toEqual(["one.png", "two.png"]);
});
