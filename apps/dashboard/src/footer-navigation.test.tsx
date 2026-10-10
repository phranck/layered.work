import { type FooterNavigation, saveFooterNavigationBody } from "@layered/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createDashboardApi } from "./api.js";
import { DashboardApiProvider } from "./dashboard-context.js";
import { FooterNavigationScreen } from "./footer-navigation.js";
import { DashboardLanguageProvider } from "./language-context.js";
import { queryKeys } from "./query-keys.js";
import { dashboardAreas } from "./routes.js";
import { chooseTextLanguage } from "./test-support.js";

const groups: FooterNavigation[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    title: { en: "Explore", de: "Entdecken" },
    sortOrder: 0,
    items: ["Projekte", "Beiträge"].map((name, index) => ({
      id: `00000000-0000-4000-8000-00000000000${index + 2}`,
      label: { en: name, de: name },
      parentId: null,
      visible: { en: true, de: true },
      entryId: null,
      topicId: null,
      href: "/posts/",
    })),
  },
];
let queryClient: QueryClient;
let sent: ReturnType<typeof vi.fn>;
beforeEach(() => {
  sent = vi.fn(async (_path: string, _init?: RequestInit) => Response.json({ data: groups }));
  vi.stubGlobal("fetch", sent);
  vi.stubGlobal("__API_BASE__", "/api");
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(queryKeys.session, {
    id: "00000000-0000-4000-8000-000000000009",
    email: "test@example.test",
    displayName: "Test",
    role: "owner",
  });
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.unstubAllGlobals();
});
function show(id = "footer-nav") {
  const area = dashboardAreas.find((candidate) => candidate.id === id);
  if (!area) throw new Error("Footer area missing");
  render(
    <QueryClientProvider client={queryClient}>
      <DashboardApiProvider api={createDashboardApi(queryClient, () => {})}>
        <DashboardLanguageProvider language="de">
          <FooterNavigationScreen area={area} />
        </DashboardLanguageProvider>
      </DashboardApiProvider>
    </QueryClientProvider>,
  );
}

it("shows the bilingual groups as rows with their links beneath them", async () => {
  show();
  expect(await screen.findByText("Entdecken")).toBeTruthy();
  const list = screen.getByRole("list", { name: "Entdecken" });
  expect(
    within(list)
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual(["Projekte", "Beiträge"]);
});

it("edits main navigation with language visibility, a parent and keyboard reordering", async () => {
  show("main-nav");
  fireEvent.click(await screen.findByRole("button", { name: "Entdecken bearbeiten" }));
  const parents = screen.getAllByLabelText("Übergeordneter Link");
  fireEvent.change(parents[1] as HTMLElement, { target: { value: groups[0]?.items[0]?.id } });
  fireEvent.click(screen.getAllByRole("switch", { name: "Sichtbar" })[1] as HTMLElement);
  fireEvent.keyDown(screen.getByRole("button", { name: /„Beiträge“ verschieben/ }), { key: "ArrowUp" });
  sent.mockImplementation(async (_path: string, init?: RequestInit) => {
    if (init?.method === "PUT")
      return Response.json({ data: { ...groups[0], ...JSON.parse(String(init.body)) } });
    return Response.json({ data: groups });
  });
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
  await waitFor(() => expect(sent.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true));
  const call = sent.mock.calls.find(([, init]) => init?.method === "PUT");
  expect(call?.[0]).toContain("/main-navigation/");
  const value = saveFooterNavigationBody.parse(JSON.parse(String(call?.[1]?.body)));
  expect(value.items[0]?.label.de).toBe("Beiträge");
  expect(value.items[0]?.visible.de).toBe(false);
  expect(value.items[0]?.parentId).toBe(groups[0]?.items[0]?.id);
});

it("asks before deleting and states exactly how many links go with the group", async () => {
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Entdecken löschen" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("Die Navigation und ihre 2 Links werden gelöscht.")).toBeTruthy();
  expect(sent.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(0);
  fireEvent.click(within(dialog).getByRole("button", { name: "Abbrechen" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("requires both titles and both link labels before saving the editor", async () => {
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Neue Navigation" }));
  chooseTextLanguage("en");
  fireEvent.change(screen.getByLabelText("Titel"), { target: { value: "Links" } });
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Titel und Linktexte brauchen beide Sprachen; Links brauchen eine gültige Adresse.",
  );
  expect(sent.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  chooseTextLanguage("de");
  fireEvent.change(screen.getByLabelText("Titel"), { target: { value: "Links" } });
  fireEvent.click(screen.getByRole("button", { name: "Link hinzufügen" }));
  chooseTextLanguage("en");
  fireEvent.change(screen.getByLabelText("Linktext"), { target: { value: "Read" } });
  fireEvent.change(screen.getByLabelText("Linkadresse"), { target: { value: "/posts/" } });
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
  expect(sent.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  chooseTextLanguage("de");
  fireEvent.change(screen.getByLabelText("Linktext"), { target: { value: "Lesen" } });
  sent.mockImplementation(async (_path: string, init?: RequestInit) => {
    if (init?.method === "POST")
      return Response.json({
        data: {
          ...groups[0],
          ...saveFooterNavigationBody.parse(JSON.parse(String(init.body))),
          items: groups[0]?.items,
        },
      });
    return Response.json({ data: groups });
  });
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
  await waitFor(() => expect(sent.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
});
