import type { SocialAccount } from "@layered/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createDashboardApi } from "./api.js";
import { DashboardApiProvider } from "./dashboard-context.js";
import { DashboardLanguageProvider } from "./language-context.js";
import { dashboardAreas } from "./routes.js";
import { SocialAccountsScreen } from "./social-accounts.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("renders the mark, disables without deleting, and validates a new account", async () => {
  const account: SocialAccount = {
    id: "00000000-0000-4000-8000-000000000001",
    platform: "github",
    handle: "Own account",
    href: "https://example.test/account",
    enabled: true,
    sortOrder: 0,
  };
  const sent = vi.fn(async (_path: string, init?: RequestInit) =>
    Response.json({
      data:
        init?.method === "PUT" || init?.method === "POST"
          ? { ...account, ...JSON.parse(String(init.body)) }
          : [account],
    }),
  );
  vi.stubGlobal("fetch", sent);
  vi.stubGlobal("__API_BASE__", "/api");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["session"], {
    id: account.id,
    email: "fixture@example.test",
    displayName: "Test",
    role: "owner",
  });
  const area = dashboardAreas.find((item) => item.id === "social");
  if (!area) throw new Error("Missing social area");
  const view = render(
    <QueryClientProvider client={client}>
      <DashboardApiProvider api={createDashboardApi(client, () => {})}>
        <DashboardLanguageProvider language="de">
          <SocialAccountsScreen area={area} />
        </DashboardLanguageProvider>
      </DashboardApiProvider>
    </QueryClientProvider>,
  );
  expect(await screen.findByText("GitHub")).toBeTruthy();
  expect(view.container.querySelector('[data-brand="github"]')).toBeTruthy();
  fireEvent.click(screen.getByRole("switch", { name: "Auf der Website zeigen: Own account" }));
  await waitFor(() => expect(sent.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true));
  expect(
    JSON.parse(String(sent.mock.calls.find(([, init]) => init?.method === "PUT")?.[1]?.body)).enabled,
  ).toBe(false);
  expect(sent.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Konto hinzufügen" }));
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Plattform"), { target: { value: "xing" } });
  fireEvent.change(screen.getByLabelText("Handle"), { target: { value: "Fixture Xing" } });
  fireEvent.change(screen.getByLabelText("Linkadresse"), { target: { value: "https://example.test/xing" } });
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
  await waitFor(() => expect(sent.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
  client.clear();
});
