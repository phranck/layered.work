import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
const secret = `lwpat_${"x".repeat(43)}`;
const id = "0199f064-43b7-79a8-917f-eefc8c852497";
const json = (data: unknown) =>
  new Response(JSON.stringify({ data }), { headers: { "content-type": "application/json" } });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("issues a scoped token, shows its value once and revokes it", async () => {
  let tokens: unknown[] = [];
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
    if (url.endsWith("/access-tokens") && init?.method === "POST") {
      const created = {
        id,
        ...JSON.parse(String(init.body)),
        createdAt: "2026-10-05T00:00:00.000Z",
        lastUsedAt: null,
        revokedAt: null,
      };
      tokens = [created];
      return json({ ...created, value: secret });
    }
    if (url.endsWith("/access-tokens") && !init?.method) return json(tokens);
    if (url.endsWith(`/access-tokens/${id}`) && init?.method === "DELETE") {
      tokens = [{ ...(tokens[0] as object), revokedAt: "2026-10-05T01:00:00.000Z" }];
      return json(tokens[0]);
    }
    return json(null);
  });
  vi.stubGlobal("fetch", fetcher);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const api = createDashboardApi(queryClient, () => undefined);
  const router = createDashboardMemoryRouter({ api, queryClient, initialEntries: ["/api-tokens"] });
  render(
    <QueryClientProvider client={queryClient}>
      <DashboardApiProvider api={api}>
        <RouterProvider router={router} />
      </DashboardApiProvider>
    </QueryClientProvider>,
  );

  fireEvent.change(await screen.findByLabelText("Token name"), { target: { value: "Agent writer" } });
  fireEvent.click(screen.getByRole("switch", { name: "Write content" }));
  fireEvent.click(screen.getByRole("button", { name: "Create token" }));
  expect(await screen.findByDisplayValue(secret)).toBeTruthy();
  const issue = requests.find(({ url, init }) => url.endsWith("/access-tokens") && init?.method === "POST");
  expect(JSON.parse(String(issue?.init?.body)).scopes).toEqual(["content:write"]);
  fireEvent.click(await screen.findByRole("button", { name: "Revoke" }));
  // Nothing is revoked before the question is answered.
  const dialog = await screen.findByRole("dialog", { name: "Revoke “Agent writer”" });
  expect(requests.some(({ init }) => init?.method === "DELETE")).toBe(false);
  fireEvent.click(within(dialog).getByRole("button", { name: "Revoke" }));
  await waitFor(() =>
    expect(
      requests.some(({ url, init }) => url.endsWith(`/access-tokens/${id}`) && init?.method === "DELETE"),
    ).toBe(true),
  );
});
