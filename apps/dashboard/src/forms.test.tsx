import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDashboardApi } from "./api.js";
import { DashboardApiProvider } from "./dashboard-context.js";
import { createDashboardMemoryRouter } from "./router.js";
import { chooseTextLanguage } from "./test-support.js";

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
  values: 0,
  blocks: 0,
  mainNav: 0,
  footerNav: 0,
  social: 0,
  forms: 0,
  submissions: 0,
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

/** One field of a saved form, as the editor sends it. */
type SentField = { type: string; label: unknown; span?: number };

/**
 * The new-form editor against an API that answers a save and keeps the request,
 * and a way to read the form the next press of Save sends.
 */
function mountRecording() {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.endsWith("/auth/me") || url.endsWith("/account")) return json(account);
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
  return async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(requests.some(({ url, init }) => url.endsWith("/forms") && init?.method === "POST")).toBe(true),
    );
    const sent = requests.find(({ url, init }) => url.endsWith("/forms") && init?.method === "POST");
    return JSON.parse(String(sent?.init?.body)) as { name: string; rows: { fields: SentField[] }[] };
  };
}

/** Gives an element the box the layout would give it, which the test environment does not lay out. */
function placeAt(
  element: Element | undefined,
  box: { left: number; top: number; width: number; height: number },
) {
  if (!element) throw new Error("Missing element to place");
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      ...box,
      x: box.left,
      y: box.top,
      right: box.left + box.width,
      bottom: box.top + box.height,
    }),
  });
}

describe("form builder", () => {
  it("creates a form with bilingual fields in the order and at the width chosen by the keyboard", async () => {
    const save = mountRecording();

    fireEvent.change(await screen.findByLabelText("Form name"), { target: { value: "Demo" } });
    // A click on a palette tile adds its field at the end and selects it.
    fireEvent.click(screen.getByRole("button", { name: "Email" }));
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Email address" } });
    chooseTextLanguage("de");
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "E-Mail-Adresse" } });
    chooseTextLanguage("en");
    fireEvent.keyDown(screen.getByRole("button", { name: /^Email address/, pressed: true }), {
      key: "ArrowUp",
    });
    fireEvent.click(screen.getByRole("button", { name: "6 of 12" }));

    const body = await save();
    expect(body.name).toBe("Demo");
    // The new field went into a row of its own above the first, at the width pressed.
    expect(body.rows.map((row) => row.fields.map((field) => field.type))).toEqual([["email"], ["shortText"]]);
    expect(body.rows[0]?.fields[0]?.label).toEqual({ en: "Email address", de: "E-Mail-Adresse" });
    expect(body.rows[0]?.fields[0]?.span).toBe(6);
  });

  it("sets the only field of a row beside a field at half width by the row's grip, showing what is carried and where it lands", async () => {
    const save = mountRecording();
    fireEvent.click(await screen.findByRole("button", { name: "Email" }));
    fireEvent.click(screen.getByRole("button", { name: "6 of 12" }));

    // The canvas as a browser lays it out: the short text across the first row,
    // the email at half width in the second, with six columns free beside it.
    placeAt(document.querySelector(".forms-rows") ?? undefined, { left: 0, top: 0, width: 600, height: 100 });
    const [first, second] = document.querySelectorAll(".forms-row__grid");
    placeAt(first, { left: 0, top: 0, width: 600, height: 40 });
    placeAt(second, { left: 0, top: 60, width: 600, height: 40 });
    const [shortText, email] = document.querySelectorAll(".forms-field");
    placeAt(shortText, { left: 0, top: 0, width: 600, height: 40 });
    placeAt(email, { left: 0, top: 60, width: 295, height: 40 });

    const grip = screen.getByRole("button", { name: "Move row 1 up or down with the arrow keys" });
    fireEvent.pointerDown(grip, { button: 0, pointerId: 1, clientX: -20, clientY: 20 });
    fireEvent.pointerMove(window, { pointerId: 1, buttons: 1, clientX: 450, clientY: 80 });
    expect(document.querySelector(".forms-builder__carried")).not.toBeNull();
    expect(document.querySelector(".forms-row[data-target] .forms-field[data-landing]")).not.toBeNull();
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 450, clientY: 80 });
    expect(document.querySelector(".forms-builder__carried")).toBeNull();

    const body = await save();
    expect(body.rows.map((row) => row.fields.map((field) => [field.type, field.span]))).toEqual([
      [
        ["email", 6],
        ["shortText", 6],
      ],
    ]);
  });

  it("moves a row with the arrow keys on its grip", async () => {
    const save = mountRecording();
    fireEvent.click(await screen.findByRole("button", { name: "Email" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Move row 1 up or down with the arrow keys" }), {
      key: "ArrowDown",
    });

    const body = await save();
    expect(body.rows.map((row) => row.fields.map((field) => field.type))).toEqual([["email"], ["shortText"]]);
  });

  it("hands the focus to a clicked field, so the arrow keys move it", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/me") || url.endsWith("/account")) return json(account);
      if (url.endsWith("/dashboard/counts")) return json(counts);
      if (url.endsWith("/forms")) return json([]);
      return json(null);
    });
    mount(fetcher as typeof fetch);

    const field = await screen.findByRole("button", { name: /^Short text/, pressed: false });
    fireEvent.click(field);
    expect(document.activeElement).toBe(field);
  });

  it("leads back to the list from the start of the bar, before the form's name", async () => {
    mountRecording();
    await screen.findByLabelText("Form name");

    const start = document.querySelector<HTMLElement>(".app-bar__start");
    const end = document.querySelector<HTMLElement>(".app-bar__end");
    if (!start || !end) throw new Error("Missing bar");
    const back = within(start).getByRole("link", { name: "Forms" });
    expect(back.querySelector(".button__icon svg")).not.toBeNull();
    expect(back.nextElementSibling?.textContent).toBe("New form");
    expect(within(end).queryByRole("button", { name: "Forms" })).toBeNull();

    fireEvent.click(back);
    expect(await screen.findByText("No forms yet.")).toBeTruthy();
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

    fireEvent.click(await screen.findByRole("button", { name: /^Short text/, pressed: false }));
    chooseTextLanguage("de");
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      fetcher.mock.calls.some(([url, init]) => String(url).endsWith("/forms") && init?.method === "POST"),
    ).toBe(false);
  });
});
