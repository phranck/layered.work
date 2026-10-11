import type { MediaDetail } from "@layered/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { createDashboardApi } from "./api.js";
import { DashboardApiProvider } from "./dashboard-context.js";
import { DashboardLanguageProvider } from "./language-context.js";
import { MediaField } from "./media-field.js";

afterEach(cleanup);

const picture: MediaDetail = {
  id: "00000000-0000-4000-8000-000000000002",
  slug: "front",
  kind: "image",
  mimeType: "image/jpeg",
  byteSize: 5,
  width: 1600,
  height: 900,
  uploadedAt: "2026-10-05T10:00:00Z",
  url: "/api/account/media/front/content",
  focalPoint: { x: 0.2, y: 0.8 },
  processingState: "ready",
  translations: { en: { altText: null, caption: null }, de: { altText: null, caption: null } },
  processing: { state: "ready", errorId: null, variants: [] },
  uses: [],
  watermark: null,
  credit: null,
};

/** Draws one field naming the picture, in the shape given. */
function field(shape: "sharing" | "home-plate" | "whole") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DashboardApiProvider
        api={{ ...createDashboardApi(client, () => {}), fetchMediaDetail: async () => picture }}
      >
        <DashboardLanguageProvider language="en">
          <MediaField
            label="Picture"
            none="None"
            mediaId={picture.id}
            shape={shape}
            editable
            onChange={() => {}}
          />
        </DashboardLanguageProvider>
      </DashboardApiProvider>
    </QueryClientProvider>,
  );
}

it("crops the home page's picture around its focal point, as the site does", async () => {
  field("home-plate");
  const image = await screen.findByRole("presentation");
  expect(image.getAttribute("src")).toBe(picture.url);
  expect(image.getAttribute("data-shape")).toBe("home-plate");
  expect((image as HTMLImageElement).style.objectPosition).toBe("20% 80%");
});

it("crops a sharing picture around the middle and shows a watermark whole, ignoring the focal point", async () => {
  field("sharing");
  const sharing = await screen.findByRole("presentation");
  expect(sharing.getAttribute("data-shape")).toBe("sharing");
  expect((sharing as HTMLImageElement).style.objectPosition).toBe("");
  cleanup();
  field("whole");
  expect((await screen.findByRole("presentation")).getAttribute("data-shape")).toBe("whole");
});
