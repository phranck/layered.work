import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { createDashboardApi } from "./api.js";
import { AppBarSlotsProvider } from "./app-bar-slots.js";
import { DashboardApiProvider } from "./dashboard-context.js";
import { EntryEditorScreen } from "./entry-editor.js";
import { DashboardLanguageProvider } from "./language-context.js";
import { dashboardAreas } from "./routes.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("blocks publishing an unknown component, names the reason, and still saves the draft", async () => {
  const entry = {
    id: "00000000-0000-4000-8000-000000000001",
    entryId: "00000000-0000-4000-8000-000000000002",
    kind: "post",
    language: "en",
    title: "Fixture",
    summary: null,
    body: "Carousel { Text. }",
    state: "draft",
    readingWidth: "normal",
    showInOtherLanguage: false,
    publishedAt: null,
    modifiedAt: "2026-10-05T00:00:00.000Z",
    path: "/en/fixture/",
    slug: "fixture",
    pictureUrl: null,
    topics: [],
    counterpart: null,
    counterpartTrashed: false,
    trashed: false,
  };
  const sent = vi.fn(async (path: string, init?: RequestInit) =>
    Response.json({
      data: path.endsWith("/topics")
        ? []
        : { ...entry, ...(init?.method === "PUT" ? JSON.parse(String(init.body)) : {}) },
    }),
  );
  vi.stubGlobal("fetch", sent);
  vi.stubGlobal("__API_BASE__", "/api");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const area = dashboardAreas.find((row) => row.id === "posts");
  if (!area) throw new Error("Missing posts area");
  const router = createMemoryRouter(
    [{ path: "/posts/:id", element: <EntryEditorScreen area={area} kind="post" /> }],
    { initialEntries: [`/posts/${entry.id}`] },
  );
  render(
    <QueryClientProvider client={client}>
      <DashboardApiProvider api={createDashboardApi(client, () => {})}>
        <DashboardLanguageProvider language="de">
          <AppBarSlotsProvider>
            {(bar) => (
              <>
                {bar}
                <RouterProvider router={router} />
              </>
            )}
          </AppBarSlotsProvider>
        </DashboardLanguageProvider>
      </DashboardApiProvider>
    </QueryClientProvider>,
  );
  const publish = await screen.findByRole("button", { name: "Veröffentlichen" });
  expect(publish).toHaveProperty("disabled", true);
  expect(screen.getByText("Veröffentlichung gesperrt: Carousel ist keine Komponente.")).toBeTruthy();
  fireEvent.click(publish);
  expect(sent.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  fireEvent.change(screen.getByLabelText("Titel"), { target: { value: "Updated fixture" } });
  const save = screen.getByRole("button", { name: "Speichern" });
  expect(save).toHaveProperty("disabled", false);
  fireEvent.click(save);
  await waitFor(() => expect(sent.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true));
  expect(
    JSON.parse(String(sent.mock.calls.find(([, init]) => init?.method === "PUT")?.[1]?.body)),
  ).toMatchObject({ state: "draft", body: entry.body });
  client.clear();
  router.dispose();
});
