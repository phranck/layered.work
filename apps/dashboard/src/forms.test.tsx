import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDashboardApi } from "./api.js";
import { DashboardApiProvider } from "./dashboard-context.js";
import { createDashboardMemoryRouter } from "./router.js";

const account = {
  id: "65f4582c-c983-4bd0-977c-d358d382fc83",
  email: "editor@example.test",
  displayName: "Editor",
  role: "owner",
  interfaceLanguage: "en",
  avatarMediaId: null,
  avatarUrl: null,
};
const counts = {
  posts: 0,
  pages: 0,
  projects: 0,
  tags: 0,
  media: 0,
  blocks: 0,
  mainNav: 0,
  footerNav: 0,
  social: 0,
  forms: 0,
  submissions: null,
  mailTemplates: null,
};
const json = (data: unknown) =>
  new Response(JSON.stringify({ data }), { headers: { "content-type": "application/json" } });

function mount(fetcher: typeof fetch) {
  vi.stubGlobal("fetch", fetcher);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const api = createDashboardApi(queryClient, () => undefined);
  const router = createDashboardMemoryRouter({ api, queryClient, initialEntries: ["/forms/new"] });
  render(
    <QueryClientProvider client={queryClient}>
      <DashboardApiProvider api={api}>
        <RouterProvider router={router} />
      </DashboardApiProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("form builder", () => {
  it("creates a form with bilingual fields in the order chosen by the keyboard drag handle", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith("/auth/me")) return json(account);
      if (url.endsWith("/account")) return json(account);
      if (url.endsWith("/dashboard/counts")) return json(counts);
      if (url.endsWith("/forms") && init?.method === "POST")
        return json({
          ...JSON.parse(String(init.body)),
          id: "0199f064-43b7-79a8-917f-eefc8c852497",
          createdAt: "2026-10-04T00:00:00.000Z",
          modifiedAt: "2026-10-04T00:00:00.000Z",
        });
      if (url.endsWith("/forms")) return json([]);
      return json(null);
    });
    mount(fetcher as typeof fetch);

    fireEvent.change(await screen.findByLabelText("Form name"), { target: { value: "Demo" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Field" }), { target: { value: "email" } });
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    fireEvent.change(screen.getByLabelText("Label (EN)"), { target: { value: "Email address" } });
    fireEvent.change(screen.getByLabelText("Label (DE)"), { target: { value: "E-Mail-Adresse" } });
    fireEvent.keyDown(screen.getByRole("button", { name: /Drag to reorder.*Email address/ }), {
      key: "ArrowUp",
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(requests.some(({ url, init }) => url.endsWith("/forms") && init?.method === "POST")).toBe(true),
    );
    const sent = requests.find(({ url, init }) => url.endsWith("/forms") && init?.method === "POST");
    const body = JSON.parse(String(sent?.init?.body));
    expect(body.name).toBe("Demo");
    expect(body.fields.map((field: { type: string }) => field.type)).toEqual(["email", "shortText"]);
    expect(body.fields[0].label).toEqual({ en: "Email address", de: "E-Mail-Adresse" });
  });

  it("does not send a field whose German label is blank", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/me") || url.endsWith("/account")) return json(account);
      if (url.endsWith("/dashboard/counts")) return json(counts);
      if (url.endsWith("/forms")) return json([]);
      return json(null);
    });
    mount(fetcher as typeof fetch);

    fireEvent.click(await screen.findByRole("button", { name: /Short text · name/ }));
    fireEvent.change(screen.getByLabelText("Label (DE)"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      fetcher.mock.calls.some(([url, init]) => String(url).endsWith("/forms") && init?.method === "POST"),
    ).toBe(false);
  });
});
