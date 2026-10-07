import { homeBlockSettings, homeBlockTypes, type StoredHomeBlock } from "@layered/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDashboardApi } from "./api.js";
import { DashboardApiProvider } from "./dashboard-context.js";
import { dashboardText } from "./dashboard-i18n.js";
import { declaredKeys, segmentsFit } from "./home-block-labels.js";
import { SettingControl } from "./home-block-settings.js";
import { HomeBlocksScreen } from "./home-blocks.js";
import { DashboardLanguageProvider } from "./language-context.js";
import { dashboardAreas } from "./routes.js";
import { chooseTextLanguage } from "./test-support.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** One stored block of each type, in the declared order, on its defaults. */
function storedBlocks(): StoredHomeBlock[] {
  return homeBlockTypes.map((type, sortOrder) => ({
    id: `00000000-0000-4000-8000-00000000000${sortOrder + 1}`,
    type,
    enabled: true,
    sortOrder,
    settings: homeBlockSettings(type, {}),
    pictureUrls: {},
  }));
}

/** The screen against a stand-in API that keeps the blocks in memory and records every request. */
function renderScreen() {
  let blocks = storedBlocks();
  const sent = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const id = /\/home-blocks\/([0-9a-f-]{36})$/.exec(path)?.[1];
    if (method === "PUT" && id) {
      blocks = blocks.map((block) => (block.id === id ? { ...block, ...body } : block));
      return Response.json({ data: blocks.find((block) => block.id === id) });
    }
    if (method === "POST") {
      const added: StoredHomeBlock = {
        id: "00000000-0000-4000-8000-000000000099",
        type: body.type,
        enabled: true,
        sortOrder: 9,
        settings: homeBlockSettings(body.type, {}),
        pictureUrls: {},
      };
      blocks = [...blocks, added];
      return Response.json({ data: added });
    }
    if (method === "DELETE" && id) {
      blocks = blocks.filter((block) => block.id !== id);
      return Response.json({ data: null });
    }
    return Response.json({ data: blocks });
  });
  vi.stubGlobal("fetch", sent);
  vi.stubGlobal("__API_BASE__", "/api");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["session"], {
    id: "00000000-0000-4000-8000-0000000000aa",
    email: "owner@example.test",
    displayName: "Owner",
    role: "owner",
  });
  const area = dashboardAreas.find((item) => item.id === "blocks");
  if (!area) throw new Error("Missing blocks area");
  render(
    <QueryClientProvider client={client}>
      <DashboardApiProvider api={createDashboardApi(client, () => {})}>
        <DashboardLanguageProvider language="de">
          <HomeBlocksScreen area={area} />
        </DashboardLanguageProvider>
      </DashboardApiProvider>
    </QueryClientProvider>,
  );
  const requests = (method: string) =>
    sent.mock.calls
      .filter(([, init]) => (init?.method ?? "GET") === method)
      .map(([path, init]) => ({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined }));
  return { requests, client };
}

describe("the blocks screen", () => {
  it("lists every block with what it shows, and keeps the hero where it is", async () => {
    renderScreen();
    expect(await screen.findAllByText("Hero")).toHaveLength(2);
    expect(
      screen.getByText("Gehäuse, Platinen und Software, die Schicht für Schicht entsteht."),
    ).toBeTruthy();
    expect(screen.getByText("Manuell markiert")).toBeTruthy();
    expect(screen.getAllByText("6 Einträge · Neueste zuerst")).toHaveLength(2);
    expect(screen.getByText("Alle Themen mit Anzahl")).toBeTruthy();
    expect(screen.getByText("Steht immer oben")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "„Hero“ verschieben, mit den Pfeiltasten nach oben oder unten" }),
    ).toHaveProperty("disabled", true);
    expect(screen.queryByRole("button", { name: "„Hero“ entfernen" })).toBeNull();
  });

  it("switches a block off without deleting it", async () => {
    const { requests } = renderScreen();
    fireEvent.click(await screen.findByRole("switch", { name: "Themen-Leiste auf der Website zeigen" }));
    await waitFor(() => expect(requests("PUT")).toHaveLength(1));
    expect(requests("PUT")[0]?.body.enabled).toBe(false);
    expect(requests("DELETE")).toHaveLength(0);
  });

  it("draws a grid's settings from its declaration, refuses a count outside its range and saves a valid one", async () => {
    const { requests } = renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: /^Beitrags-Raster\s*6 Einträge/ }));
    // The panel shows one block's settings at a time, so its fields are unique on the screen.
    const panel = document.body;
    // The placeholder is the declaration's fallback, in the language the switch shows.
    expect(await within(panel).findByLabelText("Überschrift")).toHaveProperty(
      "placeholder",
      "Notizen aus der Werkstatt",
    );
    chooseTextLanguage("en");
    expect(within(panel).getByLabelText("Überschrift")).toHaveProperty(
      "placeholder",
      "Notes from the workshop",
    );
    // Three multi-word options are a dropdown, never a segmented control.
    expect(within(panel).getByLabelText("Sortierung").tagName).toBe("SELECT");
    expect(within(panel).getByRole("switch", { name: "Hervorgehobenen auslassen" })).toBeTruthy();

    fireEvent.change(within(panel).getByLabelText("Anzahl"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Anzahl");
    expect(requests("PUT")).toHaveLength(0);

    fireEvent.change(within(panel).getByLabelText("Anzahl"), { target: { value: "9" } });
    fireEvent.change(within(panel).getByLabelText("Sortierung"), { target: { value: "title" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(requests("PUT")).toHaveLength(1));
    expect(requests("PUT")[0]?.body.settings).toMatchObject({ limit: 9, order: "title" });
    // The summary is read from the saved settings, so it changes with them.
    expect(await screen.findByText("9 Einträge · Nach Titel")).toBeTruthy();
  });

  it("adds a block at the end and removes one after asking", async () => {
    const { requests } = renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: "Themen-Leiste hinzufügen" }));
    await waitFor(() => expect(requests("POST")[0]?.body).toEqual({ type: "topic_bar" }));
    expect(screen.queryByRole("button", { name: "Hero hinzufügen" })).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: "„Themen-Leiste“ entfernen" })[0] as HTMLElement);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "„Themen-Leiste“ entfernen" }));
    await waitFor(() => expect(requests("DELETE")).toHaveLength(1));
  });
});

describe("the controls a declaration calls for", () => {
  it("names every declared block, setting and option in both languages", () => {
    for (const language of ["de", "en"] as const)
      for (const key of declaredKeys())
        expect(dashboardText(language, key), `${language} ${key}`).not.toBe(key);
  });

  it("sets options side by side only where each is one short word", () => {
    expect(segmentsFit(["Markiert", "Neuester"])).toBe(true);
    expect(segmentsFit(["Neueste zuerst", "Nach Titel"])).toBe(false);
    expect(segmentsFit(["Aufsteigend", "Kurz"])).toBe(false);
  });

  it("shows a setting of a kind no control knows as a text field rather than nothing", () => {
    render(
      <DashboardLanguageProvider language="en">
        <SettingControl
          setting={{ key: "colorway", kind: "swatch" } as never}
          value="teal"
          onChange={() => {}}
          editable
          idPrefix="test"
        />
      </DashboardLanguageProvider>,
    );
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("teal");
  });
});
