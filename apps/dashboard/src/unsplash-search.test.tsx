import type { MediaDetail } from "@layered/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createDashboardApi } from "./api.js";
import { DashboardApiProvider } from "./dashboard-context.js";
import { DashboardLanguageProvider } from "./language-context.js";
import { UnsplashSearch } from "./unsplash-search.js";

let client: QueryClient;
afterEach(() => {
  cleanup();
  client.clear();
});

const picture: MediaDetail = {
  id: "00000000-0000-4000-8000-000000000009",
  slug: "a-soldering-iron",
  kind: "image",
  mimeType: "image/jpeg",
  byteSize: 0,
  width: 4000,
  height: 2667,
  uploadedAt: "2026-10-10T10:00:00Z",
  url: "/api/account/media/00000000-0000-4000-8000-000000000009/content",
  focalPoint: { x: 0.5, y: 0.5 },
  processingState: "ready",
  translations: { en: { altText: null, caption: null }, de: { altText: null, caption: null } },
  processing: { state: "ready", errorId: null, variants: [] },
  uses: [],
  watermark: null,
  credit: { photographer: "Jane Doe", profileUrl: "https://unsplash.com/@janedoe" },
};

it("searches Unsplash through the API and hands the chosen photo on as a library picture", async () => {
  const search = vi.fn(async () => ({
    page: 1,
    hasMore: false,
    items: [
      {
        id: "Dwu85P9SOIk",
        thumbnailUrl: "https://images.unsplash.com/photo-1?w=400",
        width: 4000,
        height: 2667,
        description: "a soldering iron",
        photographer: "Jane Doe",
      },
    ],
  }));
  const importPhoto = vi.fn(async () => ({
    id: picture.id,
    slug: picture.slug,
    url: picture.url ?? "",
    width: 4000,
    height: 2667,
    existing: false,
  }));
  const choose = vi.fn();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DashboardApiProvider
        api={{
          ...createDashboardApi(client, () => {}),
          searchUnsplash: search,
          importUnsplash: importPhoto,
          fetchMediaDetail: async () => picture,
        }}
      >
        <DashboardLanguageProvider language="de">
          <UnsplashSearch onChoose={choose} onCancel={() => {}} />
        </DashboardLanguageProvider>
      </DashboardApiProvider>
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByRole("searchbox", { name: "Unsplash durchsuchen" }), {
    target: { value: " soldering " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Unsplash durchsuchen" }));
  fireEvent.click(await screen.findByTitle("a soldering iron"));
  await vi.waitFor(() => expect(choose).toHaveBeenCalledWith(picture));
  expect(search).toHaveBeenCalledWith("soldering", 1);
  expect(importPhoto).toHaveBeenCalledWith("Dwu85P9SOIk");
});
