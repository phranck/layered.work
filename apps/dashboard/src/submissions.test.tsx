import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RouterProvider } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { createDashboardApi } from "./api.js";
import { DashboardApiProvider } from "./dashboard-context.js";
import { createDashboardMemoryRouter } from "./router.js";

const formId = "11c619cb-ef56-4846-9cb9-c723124c619f";
const submissionId = "22c619cb-ef56-4846-9cb9-c723124c619f";
const account = {
  id: "65f4582c-c983-4bd0-977c-d358d382fc83",
  email: "editor@example.test",
  displayName: "Editor",
  role: "owner",
  interfaceLanguage: "en",
  avatarMediaId: null,
  avatarUrl: null,
};
const form = {
  id: formId,
  slug: "contact",
  name: "Contact",
  notificationEmail: null,
  storeSubmissions: true,
  successMessage: { en: "Thanks", de: "Danke" },
  fields: [
    {
      key: "message",
      type: "longText",
      label: { en: "Message", de: "Nachricht" },
      hint: { en: "", de: "" },
      required: true,
      minLength: 1,
      maxLength: 2000,
      pattern: null,
    },
  ],
  createdAt: "2026-10-03T12:00:00.000Z",
  modifiedAt: "2026-10-03T12:00:00.000Z",
};

const json = (data: unknown) =>
  new Response(JSON.stringify({ data }), { headers: { "content-type": "application/json" } });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("shows stored markup as text, finds it, marks it read and confirms permanent deletion", async () => {
  let rows = [
    {
      id: submissionId,
      formId,
      values: { message: "<img src=x onerror=alert(1)> Österreich" },
      consents: [],
      sourceHash: "a".repeat(12),
      status: "unread",
      createdAt: "2026-10-03T12:00:00.000Z",
    },
  ];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/auth/me") || url.endsWith("/account")) return json(account);
    if (url.endsWith("/dashboard/counts"))
      return json({
        posts: 0,
        pages: 0,
        projects: 0,
        tags: 0,
        media: 0,
        blocks: 0,
        mainNav: 0,
        footerNav: 0,
        social: 0,
        forms: 1,
        submissions: rows.filter((row) => row.status === "unread").length,
        mailTemplates: null,
      });
    if (url.endsWith("/forms")) return json([form]);
    if (url.endsWith(`/forms/${formId}/submissions`) && !init?.method) return json(rows);
    if (url.endsWith(`/forms/${formId}/submissions/${submissionId}`) && init?.method === "PATCH") {
      rows = rows.map((row) => ({ ...row, status: JSON.parse(String(init.body)).status }));
      return json(rows[0]);
    }
    if (url.endsWith(`/forms/${formId}/submissions/${submissionId}`) && init?.method === "DELETE") {
      rows = [];
      return json({ deleted: true });
    }
    return json(null);
  });
  vi.stubGlobal("fetch", fetcher);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const api = createDashboardApi(queryClient, () => undefined);
  const router = createDashboardMemoryRouter({ api, queryClient, initialEntries: ["/submissions"] });
  render(
    <QueryClientProvider client={queryClient}>
      <DashboardApiProvider api={api}>
        <RouterProvider router={router} />
      </DashboardApiProvider>
    </QueryClientProvider>,
  );

  fireEvent.change(await screen.findByRole("textbox", { name: "Search submissions" }), {
    target: { value: "Österreich" },
  });
  fireEvent.click(await screen.findByRole("button", { name: /Österreich/ }));
  expect(screen.getAllByText("<img src=x onerror=alert(1)> Österreich").length).toBeGreaterThan(0);
  expect(document.querySelector("img[src=x]")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Mark read" }));
  await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true));
  expect(await screen.findByRole("button", { name: "Mark unread" })).toBeTruthy();
  expect(await screen.findByRole("link", { name: "Submissions 0" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Delete submission" }));
  expect(screen.getByText(/cannot be undone/i)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
  await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(true));
});
