import type { NamedValue } from "@layered/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createDashboardApi } from "./api.js";
import { DashboardApiProvider } from "./dashboard-context.js";
import { DashboardLanguageProvider } from "./language-context.js";
import { NamedValuesScreen } from "./named-values.js";
import { dashboardAreas } from "./routes.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const USED: NamedValue = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "product",
  value: "Velvet",
  usedBy: [
    { kind: "entry", entryId: "00000000-0000-4000-8000-000000000009", title: "Ein Beitrag" },
    { kind: "listing", listing: "project" },
  ],
};
const UNUSED: NamedValue = {
  id: "00000000-0000-4000-8000-000000000002",
  name: "version",
  value: "2.1",
  usedBy: [],
};

/** Renders the screen for the owner, against a fetch that answers with the two values. */
function renderScreen() {
  const sent = vi.fn(async (_path: string, init?: RequestInit) =>
    Response.json({
      data:
        init?.method === "POST"
          ? { id: "00000000-0000-4000-8000-000000000003", usedBy: [], ...JSON.parse(String(init.body)) }
          : init?.method === "DELETE"
            ? null
            : [USED, UNUSED],
    }),
  );
  vi.stubGlobal("fetch", sent);
  vi.stubGlobal("__API_BASE__", "/api");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["session"], {
    id: USED.id,
    email: "owner@example.test",
    displayName: "Owner",
    role: "owner",
  });
  const area = dashboardAreas.find((item) => item.id === "values");
  if (!area) throw new Error("Missing values area");
  render(
    <QueryClientProvider client={client}>
      <DashboardApiProvider api={createDashboardApi(client, () => {})}>
        <DashboardLanguageProvider language="de">
          <NamedValuesScreen area={area} />
        </DashboardLanguageProvider>
      </DashboardApiProvider>
    </QueryClientProvider>,
  );
  return sent;
}

it("lists each value as content writes it, with its text and where it is used", async () => {
  renderScreen();
  expect(await screen.findByText("{{ product }}")).toBeTruthy();
  expect(screen.getByText("Velvet")).toBeTruthy();
  expect(screen.getByText("An 2 Stellen verwendet")).toBeTruthy();
  expect(screen.getByText("Nirgends verwendet")).toBeTruthy();
});

it("names the places that still use a value and offers no delete for it", async () => {
  const sent = renderScreen();
  fireEvent.click(await screen.findByRole("button", { name: "product löschen" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("Ein Beitrag")).toBeTruthy();
  expect(within(dialog).getByText("Einleitung der Projektübersicht")).toBeTruthy();
  expect(
    (within(dialog).getByRole("button", { name: "{{ product }} löschen" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(sent.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
});

it("deletes a value nothing uses", async () => {
  const sent = renderScreen();
  fireEvent.click(await screen.findByRole("button", { name: "version löschen" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "{{ version }} löschen" }));
  await waitFor(() =>
    expect(
      sent.mock.calls.some(([path, init]) => init?.method === "DELETE" && String(path).endsWith(UNUSED.id)),
    ).toBe(true),
  );
});

it("refuses a name in the wrong shape before sending, and adds one in the right shape", async () => {
  const sent = renderScreen();
  fireEvent.click(await screen.findByRole("button", { name: "Wert hinzufügen" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Product Name" } });
  fireEvent.change(screen.getByLabelText("Text"), { target: { value: "Velvet" } });
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(sent.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);

  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "product-name" } });
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
  await waitFor(() => expect(sent.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
  expect(JSON.parse(String(sent.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body))).toEqual({
    name: "product-name",
    value: "Velvet",
  });
});
