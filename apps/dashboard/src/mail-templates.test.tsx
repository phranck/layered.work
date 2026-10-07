import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RouterProvider } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { createDashboardApi } from "./api.js";
import { DashboardApiProvider } from "./dashboard-context.js";
import { createDashboardMemoryRouter } from "./router.js";

const account = {
  id: "65f4582c-c983-4bd0-977c-d358d382fc83",
  email: "owner@example.test",
  displayName: "Owner",
  role: "owner",
  interfaceLanguage: "en",
  avatarMediaId: null,
  avatarUrl: null,
};
const template = {
  kind: "submission_confirmation",
  name: { en: "Confirmation", de: "Bestätigung" },
  subject: { en: "Thank you {{formName}}", de: "Danke {{formName}}" },
  body: { en: "Hello {{formName}}", de: "Hallo {{formName}}" },
  allowedVariables: ["formName", "submittedAt"],
};
const json = (data: unknown) =>
  new Response(JSON.stringify({ data }), { headers: { "content-type": "application/json" } });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("edits both languages and previews and test-sends the current draft", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.endsWith("/auth/me") || url.endsWith("/account")) return json(account);
    if (url.endsWith("/dashboard/counts"))
      return json({
        posts: 0,
        pages: 0,
        projects: 0,
        tags: 0,
        media: 0,
        values: 0,
        blocks: 0,
        mainNav: 0,
        footerNav: 0,
        social: 0,
        forms: 0,
        submissions: 0,
        mailTemplates: 2,
      });
    if (url.endsWith("/mail-templates") && !init?.method) return json([template]);
    if (url.endsWith("/preview"))
      return json({ subject: "Thank you Contact", text: "Hello Contact", html: "<p>Hello Contact</p>" });
    if (url.endsWith("/test"))
      return json({ accepted: true, answer: "Accepted", recipient: "reader@example.test" });
    if (url.endsWith("/submission_confirmation") && init?.method === "PUT")
      return json({ ...template, ...JSON.parse(String(init.body)) });
    return json(null);
  });
  vi.stubGlobal("fetch", fetcher);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const api = createDashboardApi(queryClient, () => undefined);
  const router = createDashboardMemoryRouter({
    api,
    queryClient,
    initialEntries: ["/mail-templates/submission_confirmation"],
  });
  render(
    <QueryClientProvider client={queryClient}>
      <DashboardApiProvider api={api}>
        <RouterProvider router={router} />
      </DashboardApiProvider>
    </QueryClientProvider>,
  );

  fireEvent.change(await screen.findByLabelText("Body (EN)"), {
    target: { value: "Hello **{{formName}}**" },
  });
  fireEvent.change(screen.getByLabelText("Body (DE)"), { target: { value: "Hallo **{{formName}}**" } });
  fireEvent.click(screen.getByRole("button", { name: "Preview" }));
  expect(await screen.findByText("Hello Contact", { selector: "pre" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Test recipient"), { target: { value: "reader@example.test" } });
  fireEvent.click(screen.getByRole("button", { name: "Send test" }));
  await screen.findByText(/SMTP2GO accepted the test message/);
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() =>
    expect(
      requests.some(({ url, init }) => url.endsWith("/submission_confirmation") && init?.method === "PUT"),
    ).toBe(true),
  );
  const testRequest = requests.find(({ url }) => url.endsWith("/test"));
  expect(JSON.parse(String(testRequest?.init?.body))).toMatchObject({
    recipient: "reader@example.test",
    template: { body: { en: "Hello **{{formName}}**", de: "Hallo **{{formName}}**" } },
  });
});
