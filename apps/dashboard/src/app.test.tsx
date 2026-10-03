import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDashboardApi } from "./api.js";
import { expirationLoginLocation } from "./auth-routing.js";
import { DashboardApiProvider } from "./dashboard-context.js";
import { EDITOR_TEXT_SIZE_KEY } from "./editor-text-size.js";
import { createDashboardMemoryRouter } from "./router.js";
import { SIDEBAR_ORDER_KEY } from "./sidebar-order.js";

const queryClients = new Set<QueryClient>();

const signedIn = {
  id: "65f4582c-c983-4bd0-977c-d358d382fc83",
  email: "frank@example.com",
  displayName: "Frank Gregor",
  role: "owner",
};

const account = {
  ...signedIn,
  interfaceLanguage: "de",
  avatarMediaId: null,
  avatarUrl: null,
};

const counts = {
  posts: 12,
  pages: 4,
  projects: 6,
  tags: 9,
  media: 17,
  blocks: 5,
  mainNav: 6,
  footerNav: 3,
  social: 7,
  forms: null,
  submissions: null,
  mailTemplates: null,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const posts = [
  {
    id: "9a2b6f0e-1c4d-4e5f-8a7b-0c1d2e3f4a5b",
    entryId: "1b2c3d4e-5f60-4718-9a0b-1c2d3e4f5a6b",
    title: "NeXTSTEP on a Raspberry Pi",
    state: "public",
    language: "en",
    date: "2025-08-22T00:00:00.000Z",
    thumbnailUrl: null,
    translated: true,
    topics: [],
    trashed: false,
  },
  {
    id: "2f3e4d5c-6b7a-4891-a0b1-c2d3e4f5a6b7",
    entryId: "1b2c3d4e-5f60-4718-9a0b-1c2d3e4f5a6b",
    title: "NeXTSTEP auf einem Raspberry Pi",
    state: "hidden",
    language: "de",
    date: "2025-08-22T00:00:00.000Z",
    thumbnailUrl: null,
    translated: true,
    topics: [],
    trashed: false,
  },
  {
    id: "3a4b5c6d-7e8f-4901-b2c3-d4e5f6a7b8c9",
    entryId: "4c5d6e7f-8091-4a2b-bc3d-4e5f6a7b8c9d",
    title: "A draft about soldering",
    state: "draft",
    language: "en",
    date: "2025-09-01T00:00:00.000Z",
    thumbnailUrl: null,
    translated: false,
    topics: [],
    trashed: false,
  },
];

const settings = {
  site: {
    title: { en: "LAYERED.work", de: "LAYERED.work" },
    footerLine: { en: "", de: "" },
    defaultLanguage: "en",
    socialImageMediaId: null,
    socialImageUrl: null,
  },
  mail: { senderAddress: "hello@layered.work", senderName: "LAYERED.work", apiKeyConfigured: true },
  analytics: { umamiWebsiteId: "3e266ac6-8103-4bef-bedb-7d127ed75cc4" },
};

/** The draft from the list, as the editor opens it. */
const draftDetail = {
  id: "3a4b5c6d-7e8f-4901-b2c3-d4e5f6a7b8c9",
  entryId: "4c5d6e7f-8091-4a2b-bc3d-4e5f6a7b8c9d",
  kind: "post",
  language: "en",
  title: "A draft about soldering",
  summary: null,
  body: "First line of the draft.",
  state: "draft",
  readingWidth: "normal",
  showInOtherLanguage: false,
  publishedAt: null,
  modifiedAt: "2025-09-01T00:00:00.000Z",
  path: "/a-draft-about-soldering/",
  slug: "a-draft-about-soldering",
  pictureUrl: null,
  topics: [{ id: "5d6e7f80-91a2-4b3c-8d4e-5f6a7b8c9d0e", name: "Electronics", named: true }],
  counterpart: null,
  counterpartTrashed: false,
  trashed: false,
};

/** The topics, one of which the draft has and one of which has no German name. */
const topics = [
  {
    id: "5d6e7f80-91a2-4b3c-8d4e-5f6a7b8c9d0e",
    en: { name: "Electronics", slug: "electronics" },
    de: { name: "Elektronik", slug: "elektronik" },
    entryCount: 1,
  },
  {
    id: "8e9fa0b1-c2d3-4e4f-9a5b-6c7d8e9f0a1b",
    en: { name: "Soldering", slug: "soldering" },
    de: null,
    entryCount: 3,
  },
];

function successfulGet(input: RequestInfo | URL) {
  const url = String(input);
  if (url.endsWith("/topics")) return json({ data: topics });
  if (url.endsWith(`/entries/${draftDetail.id}`)) return json({ data: draftDetail });
  if (url.endsWith("/settings")) return json({ data: settings });
  if (url.endsWith("/dashboard/counts")) return json({ data: counts });
  if (url.includes("/entries?kind=post")) return json({ data: posts });
  if (url.includes("/entries?")) return json({ data: [] });
  if (url.endsWith("/account")) return json({ data: account });
  return json({ data: signedIn });
}

function renderDashboard(
  path = "/posts",
  loginAlias?: { username: string; email: string },
  browserLanguages = ["de-AT", "en"],
) {
  // The sign-in screen speaks the browser's language; most cases read German.
  vi.spyOn(navigator, "languages", "get").mockReturnValue(browserLanguages);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClients.add(queryClient);
  let router: ReturnType<typeof createDashboardMemoryRouter>;
  const api = createDashboardApi(queryClient, () => {
    const destination = expirationLoginLocation(router.state.location);
    if (destination) void router.navigate(destination, { replace: true });
  });
  router = createDashboardMemoryRouter({ api, queryClient, initialEntries: [path], loginAlias });
  render(
    <QueryClientProvider client={queryClient}>
      <DashboardApiProvider api={api}>
        <RouterProvider router={router} />
      </DashboardApiProvider>
    </QueryClientProvider>,
  );
  return { api, queryClient, router };
}

/** The sidebar's group titles, top to bottom. */
function groupTitles(navigation: HTMLElement): string[] {
  return within(navigation)
    .getAllByRole("heading", { level: 2 })
    .map((heading) => heading.textContent ?? "");
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  for (const queryClient of queryClients) queryClient.clear();
  queryClients.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("dashboard shell", () => {
  it("maps an explicitly configured local login alias before normal email validation", async () => {
    const request = vi.fn((input, _init?: RequestInit) => Promise.resolve(successfulGet(input)));
    vi.stubGlobal("fetch", request);
    renderDashboard("/login", { username: "phranck", email: signedIn.email });
    fireEvent.change(screen.getByLabelText("Benutzername"), { target: { value: "phranck" } });
    fireEvent.change(screen.getByLabelText("Passwort"), { target: { value: "phranck" } });
    fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));
    await screen.findByRole("heading", { name: "Beiträge" });
    const call = request.mock.calls.find(([input]) => String(input).endsWith("/auth/sign-in"));
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ email: signedIn.email, password: "phranck" });
  });
  it("keeps real login email validation when no local alias is configured", async () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    renderDashboard("/login");
    const input = screen.getByLabelText("E-Mail-Adresse");
    expect(input.getAttribute("type")).toBe("email");
    fireEvent.change(input, { target: { value: "phranck" } });
    fireEvent.change(screen.getByLabelText("Passwort"), { target: { value: "phranck" } });
    // The button stands in the card's footer, outside the form, and submits it
    // through its `form` attribute, which is what `.form` follows.
    const form = (screen.getByRole("button", { name: "Anmelden" }) as HTMLButtonElement).form;
    if (!form) throw new Error("Missing login form");
    fireEvent.submit(form);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(request).not.toHaveBeenCalled();
  });
  it("signs in in English where the browser prefers it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ data: null })));
    renderDashboard("/login", undefined, ["en-GB", "de"]);

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(document.documentElement.lang).toBe("en");
  });

  it("does not claim the reader is signed out while the session is loading", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderDashboard();

    expect(screen.queryByRole("navigation", { name: "Dashboard-Bereiche" })).toBeNull();
  });

  it("navigates between all areas and marks the current row", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input) => Promise.resolve(successfulGet(input))),
    );
    const { router } = renderDashboard();

    const navigation = await screen.findByRole("navigation", { name: "Dashboard-Bereiche" });
    const links = within(navigation).getAllByRole("link");
    expect(links).toHaveLength(15);
    const settings = within(navigation).getByRole("link", { name: "Einstellungen" });
    fireEvent.click(settings);

    await waitFor(() => expect(router.state.location.pathname).toBe("/settings"));
    expect(settings.getAttribute("aria-current")).toBe("page");
    expect(settings.getAttribute("data-current")).toBe("true");
    expect(screen.getByRole("heading", { name: "Einstellungen" })).toBeTruthy();

    fireEvent.click(screen.getByRole("link", { name: "LAYERED.work" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/posts"));
  });

  it("lists the sidebar's groups in the order the reader left them", async () => {
    localStorage.setItem(SIDEBAR_ORDER_KEY, JSON.stringify(["system", "content"]));
    vi.stubGlobal(
      "fetch",
      vi.fn((input) => Promise.resolve(successfulGet(input))),
    );
    renderDashboard();

    const navigation = await screen.findByRole("navigation", { name: "Dashboard-Bereiche" });
    expect(groupTitles(navigation)).toEqual(["System", "Inhalt", "Startseite", "Struktur", "Formulare"]);
  });

  it("moves a group with the arrow keys on its grip and keeps the new order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input) => Promise.resolve(successfulGet(input))),
    );
    renderDashboard();

    const navigation = await screen.findByRole("navigation", { name: "Dashboard-Bereiche" });
    const grip = within(navigation).getByRole("button", { name: /„Inhalt“ verschieben/ });
    grip.focus();
    fireEvent.keyDown(grip, { key: "ArrowDown" });

    expect(groupTitles(navigation)).toEqual(["Startseite", "Inhalt", "Struktur", "Formulare", "System"]);
    expect(JSON.parse(localStorage.getItem(SIDEBAR_ORDER_KEY) ?? "[]")).toEqual([
      "landing",
      "content",
      "structure",
      "forms",
      "system",
    ]);
    expect(document.activeElement).toBe(grip);
    fireEvent.keyDown(grip, { key: "ArrowUp" });
    fireEvent.keyDown(grip, { key: "ArrowUp" });
    expect(groupTitles(navigation)[0]).toBe("Inhalt");
  });

  it("lists the posts with figures that count the rows below them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input) => Promise.resolve(successfulGet(input))),
    );
    renderDashboard();

    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    const figures = () =>
      Array.from(document.querySelectorAll(".stat__value"), (figure) => figure.textContent).join(" ");
    expect(figures()).toBe("1 1 1 2");
    expect(within(table).getAllByTitle("Auch auf Deutsch")).toHaveLength(1);
    expect(within(table).getAllByTitle("Auch auf Englisch")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "DE" }));
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(figures()).toBe("0 0 1 1");

    fireEvent.click(screen.getByRole("button", { name: "Alle" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Titel und Themen durchsuchen" }), {
      target: { value: "solder" },
    });
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(figures()).toBe("0 1 0 0");

    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), { target: { value: "public" } });
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("Kein Eintrag passt zu Suche und Filter.")).toBeTruthy();
  });

  it("focuses the list's search on Command-K and gives the focus back on Escape", async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    vi.stubGlobal(
      "fetch",
      vi.fn((input) => Promise.resolve(successfulGet(input))),
    );
    renderDashboard();

    const field = await screen.findByRole("searchbox", { name: "Titel und Themen durchsuchen" });
    await screen.findByRole("table");
    const footer = screen.getByRole("button", { name: /Frank Gregor/ });
    footer.focus();
    const pressed = fireEvent.keyDown(document.activeElement ?? document.body, { key: "k", metaKey: true });

    expect(pressed).toBe(false);
    expect(document.activeElement).toBe(field);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("⌘K")).toBeTruthy();

    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(document.activeElement?.textContent).toContain("NeXTSTEP on a Raspberry Pi");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "ArrowUp" });
    expect(document.activeElement).toBe(field);

    fireEvent.keyDown(field, { key: "Escape" });
    expect(document.activeElement).toBe(footer);
  });

  it("leaves Command-K alone whilst a text field other than a search has focus", async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    vi.stubGlobal(
      "fetch",
      vi.fn((input) => Promise.resolve(successfulGet(input))),
    );
    renderDashboard("/settings");

    fireEvent.click(await screen.findByRole("button", { name: /Frank Gregor/ }));
    const name = screen.getByLabelText("Name");
    name.focus();
    const pressed = fireEvent.keyDown(name, { key: "k", metaKey: true });

    expect(pressed).toBe(true);
    expect(document.activeElement).toBe(name);
    expect(screen.queryByRole("dialog", { name: "Suche" })).toBeNull();
  });

  it("opens a search over everything where a screen has no list, and opens a hit with Enter", async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
    const found = {
      entries: [
        { id: posts[2]?.id, kind: "post", title: "A draft about soldering", language: "en", state: "draft" },
      ],
      media: [
        {
          id: "7d8e9fa0-b1c2-4d3e-8f40-a1b2c3d4e5f6",
          slug: "soldering-iron",
          thumbnailUrl: null,
          altText: "A soldering iron on the bench",
        },
      ],
    };
    const request = vi.fn((input: RequestInfo | URL) =>
      Promise.resolve(String(input).includes("/search?") ? json({ data: found }) : successfulGet(input)),
    );
    vi.stubGlobal("fetch", request);
    const { router } = renderDashboard("/settings");

    const heading = await screen.findByRole("heading", { name: "Einstellungen" });
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
    const dialog = await screen.findByRole("dialog", { name: "Suche" });
    expect(within(dialog).getByText("Strg K")).toBeTruthy();

    const input = within(dialog).getByRole("combobox", { name: "Einträge und Medien durchsuchen" });
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "solder" } });
    await within(dialog).findByRole("option", { name: /A draft about soldering/ });
    expect(request.mock.calls.some(([url]) => String(url).endsWith("/search?q=solder"))).toBe(true);
    expect(within(dialog).getByRole("option", { name: /soldering-iron/ })).toBeTruthy();

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe("media-7d8e9fa0-b1c2-4d3e-8f40-a1b2c3d4e5f6");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(router.state.location.pathname).toBe(`/posts/${posts[2]?.id}`));
    expect(screen.queryByRole("dialog", { name: "Suche" })).toBeNull();
    expect(heading).toBeTruthy();
  });

  it("closes the search on Escape and gives the focus back", async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    vi.stubGlobal(
      "fetch",
      vi.fn((input) => Promise.resolve(successfulGet(input))),
    );
    renderDashboard("/settings");

    const footer = await screen.findByRole("button", { name: /Frank Gregor/ });
    footer.focus();
    fireEvent.keyDown(footer, { key: "k", metaKey: true });
    const dialog = await screen.findByRole("dialog", { name: "Suche" });
    fireEvent(dialog, new Event("cancel", { cancelable: true }));

    expect(screen.queryByRole("dialog", { name: "Suche" })).toBeNull();
    expect(document.activeElement).toBe(footer);
  });

  it("lets the owner change the site's title in both languages and save it", async () => {
    const saved = {
      ...settings,
      site: { ...settings.site, title: { en: "LAYERED.work", de: "LAYERED.werk" } },
    };
    const request = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(
        String(input).endsWith("/settings/site") && init?.method === "PUT"
          ? json({ data: saved })
          : successfulGet(input),
      ),
    );
    vi.stubGlobal("fetch", request);
    renderDashboard("/settings");

    const save = await screen.findByRole("button", { name: "Speichern" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Titel auf Deutsch"), { target: { value: "LAYERED.werk" } });
    expect((save as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(save);

    await waitFor(() =>
      expect(
        request.mock.calls.some(
          ([url, init]) => String(url).endsWith("/settings/site") && init?.method === "PUT",
        ),
      ).toBe(true),
    );
    const put = request.mock.calls.find(
      ([url, init]) => String(url).endsWith("/settings/site") && init?.method === "PUT",
    );
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({
      title: { en: "LAYERED.work", de: "LAYERED.werk" },
      footerLine: { en: "", de: "" },
      defaultLanguage: "en",
      socialImageMediaId: null,
    });
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Speichern" }) as HTMLButtonElement).disabled).toBe(true),
    );
  });

  it("says why a sender name cannot be saved, before anything is sent", async () => {
    const request = vi.fn((input: RequestInfo | URL) => Promise.resolve(successfulGet(input)));
    vi.stubGlobal("fetch", request);
    renderDashboard("/smtp");

    fireEvent.change(await screen.findByLabelText("Absendername"), { target: { value: "Evil <x@y.z>" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "weder spitze Klammern noch Anführungszeichen",
    );
    expect(request.mock.calls.some(([url]) => String(url).includes("/settings/mail"))).toBe(false);
    expect((screen.getByRole("button", { name: "Testnachricht senden" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText("Speichere die Änderungen, bevor du eine Testnachricht sendest.")).toBeTruthy();
  });

  it("sends a test message and shows what SMTP2GO answered", async () => {
    const request = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(
        String(input).endsWith("/settings/mail/test") && init?.method === "POST"
          ? json({ data: { accepted: false, answer: "sender not verified", recipient: "frank@example.com" } })
          : successfulGet(input),
      ),
    );
    vi.stubGlobal("fetch", request);
    renderDashboard("/smtp");

    expect(await screen.findByText("Gesetzt")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Testnachricht senden" }));

    const outcome = await screen.findByRole("status");
    expect(outcome.textContent).toContain("SMTP2GO hat die Nachricht an frank@example.com nicht angenommen.");
    expect(outcome.textContent).toContain("sender not verified");
  });

  it("shows an author who is not the owner the settings without letting them change anything", async () => {
    const editor = { ...account, role: "editor" };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        Promise.resolve(String(input).endsWith("/account") ? json({ data: editor }) : successfulGet(input)),
      ),
    );
    renderDashboard("/analytics");

    const field = await screen.findByLabelText("Website-ID");
    expect((field as HTMLInputElement).value).toBe(settings.analytics.umamiWebsiteId);
    expect((field as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText("Nur der Owner kann diese Einstellungen ändern.")).toBeTruthy();
    expect(screen.getByText("https://umami.layered.work")).toBeTruthy();
  });

  it("opens an entry from its row with Enter", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input) => Promise.resolve(successfulGet(input))),
    );
    const { router } = renderDashboard();

    const row = (await screen.findByText("A draft about soldering")).closest("tr");
    if (!row) throw new Error("The draft has no row.");
    row.focus();
    fireEvent.keyDown(row, { key: "Enter" });

    await waitFor(() => expect(router.state.location.pathname).toBe(`/posts/${posts[2]?.id}`));
    expect(await screen.findByRole("heading", { name: "A draft about soldering", level: 1 })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Beiträge 12" }).getAttribute("aria-current")).toBe("page");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByLabelText("Titel")).toHaveProperty("value", "A draft about soldering");
    expect(document.querySelector(".cm-content")?.textContent).toBe("First line of the draft.");
    expect(screen.getByRole("radio", { name: /Entwurf/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Electronics")).toBeTruthy();
  });

  it("puts the way back and where the reader is into the bar, not into the heading", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input) => Promise.resolve(successfulGet(input))),
    );
    const { router } = renderDashboard();

    await screen.findByRole("table");
    const bar = document.querySelector(".app-bar") as HTMLElement;
    expect(within(bar).getByText("Inhalt")).toBeTruthy();
    expect(document.querySelector("main .eyebrow")).toBeNull();

    await router.navigate(`/posts/${draftDetail.id}`);
    const back = await within(bar).findByRole("link", { name: "Beiträge" });
    expect(back.closest(".app-bar__start")).toBeTruthy();
    expect(within(bar).queryByText("Inhalt")).toBeNull();
    fireEvent.click(back);
    await waitFor(() => expect(router.state.location.pathname).toBe("/posts"));
  });

  it("says in the bar that a save by hand worked, and lets it go by itself", async () => {
    const published = { ...draftDetail, state: "public", publishedAt: "2025-09-02T00:00:00.000Z" };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
        Promise.resolve(
          init?.method === "PUT"
            ? json({ data: { ...published, ...JSON.parse(String(init.body)) } })
            : String(input).endsWith(`/entries/${draftDetail.id}`)
              ? json({ data: published })
              : successfulGet(input),
        ),
      ),
    );
    renderDashboard(`/posts/${draftDetail.id}`);

    fireEvent.change(await screen.findByLabelText("Titel"), { target: { value: "By hand" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    const centre = document.querySelector(".app-bar__center") as HTMLElement;
    const shown = await within(centre).findByText("Gespeichert", { selector: ".notification__message" });
    expect(shown.closest(".notification")?.getAttribute("data-tone")).toBe("success");
    expect(centre.querySelector('[aria-live="polite"]')?.textContent).toBe("Gespeichert");
    expect(within(centre).queryByRole("button", { name: "Schließen" })).toBeNull();
    await waitFor(() => expect(centre.querySelector(".notification")).toBeNull(), { timeout: 5000 });
  }, 10_000);

  it("keeps a failed save in the bar, with its id, until it is closed", async () => {
    const published = { ...draftDetail, state: "public", publishedAt: "2025-09-02T00:00:00.000Z" };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
        Promise.resolve(
          init?.method === "PUT"
            ? json({ error: { code: "internal", message: "Database gone.", id: "save-7" } }, 500)
            : String(input).endsWith(`/entries/${draftDetail.id}`)
              ? json({ data: published })
              : successfulGet(input),
        ),
      ),
    );
    renderDashboard(`/posts/${draftDetail.id}`);

    fireEvent.change(await screen.findByLabelText("Titel"), { target: { value: "Will fail" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    const centre = document.querySelector(".app-bar__center") as HTMLElement;
    await within(centre).findByText("Auf dem Server ist ein Fehler aufgetreten.", {
      selector: ".notification__message",
    });
    expect(within(centre).getByText("Fehler-ID: save-7")).toBeTruthy();
    expect(centre.querySelector('[aria-live="assertive"]')?.textContent).toContain("save-7");
    fireEvent.click(within(centre).getByRole("button", { name: "Schließen" }));
    await waitFor(() => expect(centre.querySelector(".notification")).toBeNull());
  });

  it("saves a draft by itself once typing pauses, and says when", async () => {
    const request = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(
        init?.method === "PUT"
          ? json({ data: { ...draftDetail, ...JSON.parse(String(init.body)) } })
          : successfulGet(input),
      ),
    );
    vi.stubGlobal("fetch", request);
    renderDashboard(`/posts/${draftDetail.id}`);

    fireEvent.change(await screen.findByLabelText("Titel"), { target: { value: "A finished thought" } });
    expect(screen.getByRole("status").textContent).toBe("Ungespeicherte Änderungen");

    await waitFor(() => expect(request.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true), {
      timeout: 3500,
    });
    const put = request.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body))).toMatchObject({ title: "A finished thought", state: "draft" });
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toMatch(/^Automatisch gespeichert um /),
    );
    // A save the editor made by itself is not news.
    expect(document.querySelector(".app-bar__center .notification")).toBeNull();
  });

  it("never saves a change to a public entry by itself, and asks before leaving it unsaved", async () => {
    const published = { ...draftDetail, state: "public", publishedAt: "2025-09-02T00:00:00.000Z" };
    const request = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(
        String(input).endsWith(`/entries/${draftDetail.id}`) && !init?.method
          ? json({ data: published })
          : successfulGet(input),
      ),
    );
    vi.stubGlobal("fetch", request);
    const { router } = renderDashboard(`/posts/${draftDetail.id}`);

    fireEvent.change(await screen.findByLabelText("Titel"), { target: { value: "Changed live" } });
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(request.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
    expect(screen.queryByRole("button", { name: "Veröffentlichen" })).toBeNull();

    fireEvent.click(screen.getByRole("link", { name: "Beiträge" }));
    const dialog = await screen.findByRole("dialog", { name: "Ungespeicherte Änderungen" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Bleiben" }));
    expect(router.state.location.pathname).toBe(`/posts/${draftDetail.id}`);

    fireEvent.click(screen.getByRole("link", { name: "Beiträge" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Verwerfen" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/posts"));
  });

  it("publishes a draft with what is written, and then shows it as public", async () => {
    const request = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(
        init?.method === "PUT"
          ? json({
              data: {
                ...draftDetail,
                ...JSON.parse(String(init.body)),
                publishedAt: "2026-10-02T12:00:00.000Z",
              },
            })
          : successfulGet(input),
      ),
    );
    vi.stubGlobal("fetch", request);
    renderDashboard(`/posts/${draftDetail.id}`);

    fireEvent.click(await screen.findByRole("button", { name: "Veröffentlichen" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Veröffentlichen" })).toBeNull());
    const put = request.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body))).toMatchObject({
      state: "public",
      title: "A draft about soldering",
    });
    expect(screen.getByRole("radio", { name: /Öffentlich/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("status").textContent).toMatch(/^Gespeichert um /);
  });

  it("adds a topic from the completion, creates a new one by name, removes one, and saves them", async () => {
    const created = {
      id: "9fa0b1c2-d3e4-4f5a-8b6c-7d8e9f0a1b2c",
      en: { name: "Flux", slug: "flux" },
      de: null,
      entryCount: 0,
    };
    const request = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/topics") && init?.method === "POST") return Promise.resolve(json({ data: created }));
      if (init?.method === "PUT")
        return Promise.resolve(json({ data: { ...draftDetail, ...JSON.parse(String(init.body)) } }));
      return Promise.resolve(successfulGet(input));
    });
    vi.stubGlobal("fetch", request);
    renderDashboard(`/posts/${draftDetail.id}`);

    const field = await screen.findByRole("combobox", { name: "Themen" });
    await screen.findByText("Electronics");
    fireEvent.change(field, { target: { value: "solder" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(await screen.findByText("Soldering")).toBeTruthy();

    fireEvent.change(field, { target: { value: "Flux" } });
    expect(screen.getByRole("option", { name: "„Flux“ neu anlegen" })).toBeTruthy();
    fireEvent.keyDown(field, { key: "Enter" });
    await screen.findByText("Flux");
    const asked = request.mock.calls.find(
      ([url, init]) => String(url).endsWith("/topics") && init?.method === "POST",
    );
    expect(JSON.parse(String(asked?.[1]?.body))).toEqual({ language: "en", name: "Flux" });

    fireEvent.click(screen.getByRole("button", { name: "„Electronics“ entfernen" }));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(request.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true));
    const put = request.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body)).topicIds).toEqual([topics[1]?.id, created.id]);
  });

  it("lists the topics with a missing German name shown as missing, and asks before deleting one", async () => {
    const request = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(init?.method === "DELETE" ? json({ data: null }) : successfulGet(input)),
    );
    vi.stubGlobal("fetch", request);
    renderDashboard("/tags");

    const table = await screen.findByRole("table");
    const soldering = within(table).getByText("Soldering").closest("tr") as HTMLElement;
    expect(within(soldering).getByText("Fehlt")).toBeTruthy();
    expect(within(soldering).getByText("3")).toBeTruthy();

    fireEvent.click(within(soldering).getByRole("button", { name: "Löschen" }));
    const dialog = await screen.findByRole("dialog", { name: "„Soldering“ löschen" });
    expect(within(dialog).getByText(/3 Einträge verlieren dieses Thema/)).toBeTruthy();
    expect(request.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Löschen" }));
    await waitFor(() =>
      expect(
        request.mock.calls.some(
          ([url, init]) => String(url).endsWith(`/topics/${topics[1]?.id}`) && init?.method === "DELETE",
        ),
      ).toBe(true),
    );
  });

  it("edits the last segment of the address, writes it as a slug, and saves it", async () => {
    const request = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(
        init?.method === "PUT"
          ? json({ data: { ...draftDetail, ...JSON.parse(String(init.body)) } })
          : successfulGet(input),
      ),
    );
    vi.stubGlobal("fetch", request);
    renderDashboard(`/posts/${draftDetail.id}`);

    const field = (await screen.findByLabelText("Slug")) as HTMLInputElement;
    expect(field.value).toBe("a-draft-about-soldering");
    expect(field.closest(".address-field")?.textContent).toContain("/");

    fireEvent.change(field, { target: { value: "Über Lötkolben " } });
    expect(field.value).toBe("ueber-loetkolben-");
    expect((screen.getByRole("button", { name: "Speichern" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.blur(field);
    expect(field.value).toBe("ueber-loetkolben");

    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(request.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true));
    const put = request.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body))).toMatchObject({ slug: "ueber-loetkolben" });
  });

  it("says plainly when the address belongs to another entry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
        Promise.resolve(
          init?.method === "PUT"
            ? json({ error: { code: "conflict", message: "Taken.", id: "slug-1" } }, 409)
            : successfulGet(input),
        ),
      ),
    );
    renderDashboard(`/posts/${draftDetail.id}`);

    const field = await screen.findByLabelText("Slug");
    fireEvent.change(field, { target: { value: "a-page" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(
      await screen.findByText("Diese Adresse gehört bereits einem anderen Eintrag.", {
        selector: ".notification__message",
      }),
    ).toBeTruthy();
  });

  it("sets the writing surface's text size from the toolbar and keeps it for the next visit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => Promise.resolve(successfulGet(input))),
    );
    renderDashboard(`/posts/${draftDetail.id}`);

    const smaller = await screen.findByRole("button", { name: "Text im Editor kleiner" });
    const larger = screen.getByRole("button", { name: "Text im Editor größer" });
    const surface = document.querySelector(".editor__surface") as HTMLElement;
    expect(surface.dataset.textSize).toBe("s");
    expect((smaller as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(larger);
    fireEvent.click(larger);
    expect(surface.dataset.textSize).toBe("l");
    expect(localStorage.getItem(EDITOR_TEXT_SIZE_KEY)).toBe("l");

    cleanup();
    renderDashboard(`/posts/${draftDetail.id}`);
    await screen.findByRole("button", { name: "Text im Editor größer" });
    expect((document.querySelector(".editor__surface") as HTMLElement).dataset.textSize).toBe("l");
  });

  it("offers to show an entry in the other language only while it has no counterpart, and saves the choice", async () => {
    const request = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(
        init?.method === "PUT"
          ? json({ data: { ...draftDetail, ...JSON.parse(String(init.body)) } })
          : successfulGet(input),
      ),
    );
    vi.stubGlobal("fetch", request);
    renderDashboard(`/posts/${draftDetail.id}`);

    const toggle = await screen.findByRole("switch", { name: "Auch auf Deutsch zeigen" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => expect(request.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true));
    const put = request.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body))).toMatchObject({ showInOtherLanguage: true });
  });

  it("does not offer the other language's lists once that language exists", async () => {
    const translated = {
      ...draftDetail,
      counterpart: { id: "6e7f8091-a2b3-4c4d-9e5f-6a7b8c9d0e1f", language: "de", title: "Ein Entwurf" },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        Promise.resolve(
          String(input).endsWith(`/entries/${draftDetail.id}`)
            ? json({ data: translated })
            : successfulGet(input),
        ),
      ),
    );
    renderDashboard(`/posts/${draftDetail.id}`);

    await screen.findByRole("link", { name: /„Ein Entwurf“ öffnen/ });
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("moves an entry to the bin after saying what that affects, and goes back to the list", async () => {
    const request = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/trash-impact"))
        return Promise.resolve(json({ data: { mediaReferences: 2, navigationItems: 1 } }));
      if (url.endsWith(`/entries/${draftDetail.id}/trash`) && init?.method === "POST")
        return Promise.resolve(json({ data: { ...draftDetail, trashed: true } }));
      return Promise.resolve(successfulGet(input));
    });
    vi.stubGlobal("fetch", request);
    const { router } = renderDashboard(`/posts/${draftDetail.id}`);

    fireEvent.click(await screen.findByRole("button", { name: "In den Papierkorb" }));
    const dialog = await screen.findByRole("dialog", {
      name: "„A draft about soldering“ in den Papierkorb legen",
    });
    expect(await within(dialog).findByText(/die 2 Dateien, auf die er verweist/)).toBeTruthy();
    expect(within(dialog).getByText("Ein Navigationspunkt zeigt auf diesen Eintrag.")).toBeTruthy();
    expect(request.mock.calls.some(([url]) => String(url).endsWith("/trash"))).toBe(false);

    fireEvent.click(within(dialog).getByRole("button", { name: "In den Papierkorb" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/posts"));
  });

  it("shows the bin as a filter, restores a row from it, and asks before emptying it", async () => {
    const binned = { ...posts[2], trashed: true };
    const request = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/entries?kind=post"))
        return Promise.resolve(json({ data: [posts[0], posts[1], binned] }));
      if (url.endsWith("/restore") && init?.method === "POST")
        return Promise.resolve(json({ data: draftDetail }));
      if (url.includes("/entries/bin?kind=post") && init?.method === "DELETE")
        return Promise.resolve(json({ data: { deleted: 1 } }));
      return Promise.resolve(successfulGet(input));
    });
    vi.stubGlobal("fetch", request);
    renderDashboard();

    const table = await screen.findByRole("table");
    expect(within(table).queryByText("A draft about soldering")).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), { target: { value: "bin" } });
    expect(within(table).getByText("A draft about soldering")).toBeTruthy();
    expect(within(table).getByText("Im Papierkorb")).toBeTruthy();

    fireEvent.click(within(table).getByRole("button", { name: "Wiederherstellen" }));
    await waitFor(() =>
      expect(request.mock.calls.some(([url]) => String(url).endsWith(`/entries/${binned.id}/restore`))).toBe(
        true,
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Papierkorb leeren" }));
    const dialog = await screen.findByRole("dialog", { name: "Papierkorb leeren" });
    expect(within(dialog).getByText(/Eine Fassung wird endgültig gelöscht/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Papierkorb leeren" }));
    await waitFor(() => expect(request.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(true));
  });

  it("creates the other language from the panel and opens it", async () => {
    const german = {
      ...draftDetail,
      id: "6e7f8091-a2b3-4c4d-9e5f-6a7b8c9d0e1f",
      language: "de",
      path: "/de/a-draft-about-soldering/",
      counterpart: { id: draftDetail.id, language: "en", title: draftDetail.title },
    };
    const request = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(`/entries/${draftDetail.id}/translation`) && init?.method === "POST")
        return Promise.resolve(json({ data: german }));
      if (url.endsWith(`/entries/${german.id}`)) return Promise.resolve(json({ data: german }));
      return Promise.resolve(successfulGet(input));
    });
    vi.stubGlobal("fetch", request);
    const { router } = renderDashboard(`/posts/${draftDetail.id}`);

    expect(await screen.findByText("Gibt es noch nicht.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fassung auf Deutsch anlegen" }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/posts/${german.id}`));
    expect(await screen.findByRole("link", { name: /„A draft about soldering“ öffnen/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /anlegen/ })).toBeNull();
  });

  it("opens a preview of the unsaved text in a window opened by the click", async () => {
    const url = "https://layered.work/preview/abc.def/";
    const request = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(
        String(input).endsWith(`/entries/${draftDetail.id}/previews`) && init?.method === "POST"
          ? json({ data: { url, expiresAt: "2026-10-02T13:00:00.000Z" } })
          : successfulGet(input),
      ),
    );
    vi.stubGlobal("fetch", request);
    const target = { opener: {} as unknown, location: { href: "" }, close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(target as unknown as Window);
    renderDashboard(`/posts/${draftDetail.id}`);

    fireEvent.change(await screen.findByLabelText("Titel"), { target: { value: "Not saved yet" } });
    fireEvent.click(screen.getByRole("button", { name: "Vorschau" }));

    // Opened at once, before anything was asked of the API, so Safari lets it.
    expect(open).toHaveBeenCalledWith("", "_blank");
    await waitFor(() => expect(target.location.href).toBe(url));
    expect(target.opener).toBeNull();
    const post = request.mock.calls.find(([input]) => String(input).endsWith("/previews"));
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      title: "Not saved yet",
      summary: null,
      body: "First line of the draft.",
      readingWidth: "normal",
    });
    expect(request.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });

  it("saves an entry on Command-S, also with the cursor in the writing surface", async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    const published = { ...draftDetail, state: "public", publishedAt: "2025-09-02T00:00:00.000Z" };
    const request = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(
        init?.method === "PUT"
          ? json({ data: { ...published, ...JSON.parse(String(init.body)) } })
          : String(input).endsWith(`/entries/${draftDetail.id}`)
            ? json({ data: published })
            : successfulGet(input),
      ),
    );
    vi.stubGlobal("fetch", request);
    renderDashboard(`/posts/${draftDetail.id}`);

    // Nothing changed: the browser's own dialog is kept away and nothing is sent.
    await screen.findByLabelText("Titel");
    expect(fireEvent.keyDown(document.body, { key: "s", metaKey: true })).toBe(false);
    expect(request.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);

    fireEvent.change(screen.getByLabelText("Titel"), { target: { value: "Saved by keyboard" } });
    const surface = document.querySelector(".cm-content") as HTMLElement;
    surface.focus();
    expect(fireEvent.keyDown(surface, { key: "s", metaKey: true })).toBe(false);

    await waitFor(() => expect(request.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true));
    const put = request.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body))).toMatchObject({ title: "Saved by keyboard", state: "public" });
  });

  it("saves the account dialog rather than the entry behind it on Command-S", async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    const request = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(
        String(input).endsWith("/account") && init?.method === "PATCH"
          ? json({ data: { ...account, displayName: "Renamed" } })
          : successfulGet(input),
      ),
    );
    vi.stubGlobal("fetch", request);
    renderDashboard(`/posts/${draftDetail.id}`);

    fireEvent.change(await screen.findByLabelText("Titel"), { target: { value: "Changed entry" } });
    fireEvent.click(screen.getByRole("button", { name: /Frank Gregor/ }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Renamed" } });
    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "s", metaKey: true });

    await waitFor(() => expect(request.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true));
    expect(request.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });

  it("saves a settings card on Control-S where the platform uses Control", async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
    const request = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(
        String(input).endsWith("/settings/site") && init?.method === "PUT"
          ? json({ data: settings })
          : successfulGet(input),
      ),
    );
    vi.stubGlobal("fetch", request);
    renderDashboard("/settings");

    fireEvent.change(await screen.findByLabelText("Titel auf Deutsch"), {
      target: { value: "LAYERED.werk" },
    });
    fireEvent.keyDown(document.body, { key: "s", ctrlKey: true });

    await waitFor(() =>
      expect(
        request.mock.calls.some(
          ([url, init]) => String(url).endsWith("/settings/site") && init?.method === "PUT",
        ),
      ).toBe(true),
    );
  });

  it("shows the real API counts and omits unavailable badges", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input) => Promise.resolve(successfulGet(input))),
    );
    renderDashboard();

    const posts = await screen.findByRole("link", { name: "Beiträge 12" });
    expect(posts.textContent).toContain("12");
    expect(screen.getByRole("link", { name: "Medien 17" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Formulare" }).textContent).not.toContain("0");
    expect(screen.getByRole("link", { name: "Einsendungen" }).textContent).not.toContain("0");
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/dashboard\/counts$/), {
      credentials: "include",
    });
  });

  it("keeps failed counts visible as an error with its error id", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json({ data: signedIn }))
        .mockResolvedValueOnce(json({ data: account }))
        .mockResolvedValueOnce(
          json(
            { error: { code: "internal", message: "Zahlen konnten nicht geladen werden.", id: "req-54" } },
            500,
          ),
        ),
    );
    // An area without a list, so the only protected request is the counts.
    renderDashboard("/media");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Auf dem Server ist ein Fehler aufgetreten.");
    expect(alert.textContent).not.toContain("Zahlen konnten nicht geladen werden.");
    expect(alert.textContent).toContain("req-54");
    expect(screen.getByRole("link", { name: "Beiträge" }).textContent).not.toContain("0");
  });

  it("does not request or invent counts when signed out", async () => {
    const request = vi.fn().mockResolvedValueOnce(json({ data: null }));
    vi.stubGlobal("fetch", request);
    renderDashboard();

    expect(await screen.findByRole("heading", { name: "Anmelden" })).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("navigation", { name: "Dashboard-Bereiche" })).toBeNull();
  });

  it("removes cached counts when the current session becomes signed out", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json({ data: signedIn }))
        .mockResolvedValueOnce(json({ data: account }))
        .mockResolvedValueOnce(json({ data: counts }))
        .mockResolvedValueOnce(json({ data: null })),
    );
    const { router } = renderDashboard("/media");

    expect(await screen.findByRole("link", { name: "Beiträge 12" })).toBeTruthy();
    await router.navigate("/settings");

    expect(await screen.findByRole("heading", { name: "Anmelden" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Beiträge 12" })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Sitzung ist abgelaufen");
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).has("expired")).toBe(false));
  });

  it("preserves the requested route when a null session and protected 401 expire concurrently", async () => {
    let resolveSession: (response: Response) => void = () => undefined;
    let resolveCounts: (response: Response) => void = () => undefined;
    let sessionRequests = 0;
    let countRequests = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input) => {
        const url = String(input);
        if (url.endsWith("/auth/me")) {
          sessionRequests += 1;
          if (sessionRequests === 1) return Promise.resolve(json({ data: signedIn }));
          return new Promise<Response>((resolve) => {
            resolveSession = resolve;
          });
        }
        if (url.endsWith("/account")) return Promise.resolve(json({ data: account }));
        countRequests += 1;
        if (countRequests === 1) return Promise.resolve(json({ data: counts }));
        return new Promise<Response>((resolve) => {
          resolveCounts = resolve;
        });
      }),
    );
    const { api, router } = renderDashboard("/media");

    await screen.findByRole("heading", { name: "Medien" });
    // The sidebar's own count request has to have taken the first answer, so
    // the request below is the one left waiting. The heading can appear before
    // that request is made when the machine is busy.
    await waitFor(() => expect(countRequests).toBe(1));
    const navigation = router.navigate("/settings");
    const protectedRequest = api.fetchDashboardCounts();
    resolveSession(json({ data: null }));
    await navigation;
    await screen.findByRole("heading", { name: "Anmelden" });
    resolveCounts(new Response("", { status: 401 }));
    await expect(protectedRequest).rejects.toThrow();

    expect(router.state.location.pathname).toBe("/login");
    expect(new URLSearchParams(router.state.location.search).get("returnTo")).toBe("/settings");
  });

  it("shows a session failure instead of claiming the reader is signed out", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          json(
            { error: { code: "internal", message: "Sitzung konnte nicht geladen werden.", id: "req-auth" } },
            500,
          ),
        ),
    );
    renderDashboard();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Auf dem Server ist ein Fehler aufgetreten.");
    expect(screen.queryByRole("navigation", { name: "Dashboard-Bereiche" })).toBeNull();
  });

  it("renders a truthful not-found page for an unknown path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input) => Promise.resolve(successfulGet(input))),
    );
    renderDashboard("/does-not-exist");

    expect(await screen.findByRole("heading", { name: "Seite nicht gefunden" })).toBeTruthy();
  });

  it("preserves a safe requested route when redirecting to login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ data: null })));
    const { router } = renderDashboard("/settings?tab=mail");

    await screen.findByRole("heading", { name: "Anmelden" });
    expect(router.state.location.pathname).toBe("/login");
    expect(new URLSearchParams(router.state.location.search).get("returnTo")).toBe("/settings?tab=mail");
  });

  it("uses the same safe credential error and rejects an external return route", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input) => {
        const url = String(input);
        if (url.endsWith("/auth/sign-in")) {
          return Promise.resolve(
            json({ error: { code: "unauthenticated", message: "Server wording", id: "login-refused" } }, 401),
          );
        }
        return Promise.resolve(json({ data: null }));
      }),
    );
    renderDashboard("/login?returnTo=https%3A%2F%2Fevil.example");

    fireEvent.change(screen.getByLabelText("E-Mail-Adresse"), { target: { value: "nobody@example.com" } });
    fireEvent.change(screen.getByLabelText("Passwort"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("E-Mail-Adresse oder Passwort stimmen nicht.");
    expect(alert.textContent).not.toContain("Server wording");
  });

  it("returns to the requested internal route after signing in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input) => Promise.resolve(successfulGet(input))),
    );
    const { router } = renderDashboard("/login?returnTo=%2Fsettings%3Ftab%3Dmail");

    fireEvent.change(screen.getByLabelText("E-Mail-Adresse"), { target: { value: "frank@example.com" } });
    fireEvent.change(screen.getByLabelText("Passwort"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));

    await screen.findByRole("heading", { name: "Einstellungen" });
    expect(router.state.location.pathname).toBe("/settings");
    expect(router.state.location.search).toBe("?tab=mail");
  });

  it("submits sign-in only once when the form is triggered twice while pending", async () => {
    let resolveSignIn: (response: Response) => void = () => undefined;
    let signedInAfterRequest = false;
    const request = vi.fn((input, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/sign-in")) {
        return new Promise<Response>((resolve) => {
          resolveSignIn = resolve;
        });
      }
      if (url.endsWith("/dashboard/counts")) return Promise.resolve(json({ data: counts }));
      if (url.endsWith("/account")) return Promise.resolve(json({ data: account }));
      return Promise.resolve(json({ data: signedInAfterRequest ? signedIn : null }));
    });
    vi.stubGlobal("fetch", request);
    renderDashboard("/login?returnTo=%2Fmedia");

    fireEvent.change(screen.getByLabelText("E-Mail-Adresse"), { target: { value: "frank@example.com" } });
    fireEvent.change(screen.getByLabelText("Passwort"), { target: { value: "secret" } });
    // The button stands in the card's footer, outside the form, and submits it
    // through its `form` attribute, which is what `.form` follows.
    const form = (screen.getByRole("button", { name: "Anmelden" }) as HTMLButtonElement).form;
    if (!form) throw new Error("Login form was not rendered.");
    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() =>
      expect(request.mock.calls.filter(([input]) => String(input).endsWith("/auth/sign-in"))).toHaveLength(1),
    );
    signedInAfterRequest = true;
    resolveSignIn(json({ data: signedIn }));
    expect(await screen.findByRole("heading", { name: "Medien" })).toBeTruthy();
  });

  it("saves account changes and applies the language across the dashboard immediately", async () => {
    const englishAccount = { ...account, displayName: "Frank Updated", interfaceLanguage: "en" };
    const mediaItem = {
      id: "f6209cc7-086d-4d28-a67e-4d1ad3f750aa",
      slug: "portrait",
      url: "/api/account/media/f6209cc7-086d-4d28-a67e-4d1ad3f750aa/content",
      width: 600,
      height: 600,
    };
    const request = vi.fn((input, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/account") && init?.method === "PATCH")
        return Promise.resolve(json({ data: englishAccount }));
      if (url.includes("/account/media?"))
        return Promise.resolve(json({ data: { items: [mediaItem], page: 1, hasMore: false } }));
      return Promise.resolve(successfulGet(input));
    });
    vi.stubGlobal("fetch", request);
    renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /Frank Gregor/ }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Frank Updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Bild auswählen" }));
    fireEvent.click(await screen.findByRole("button", { name: "portrait" }));
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(await screen.findByRole("heading", { name: "Posts" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Dashboard areas" })).toBeTruthy();
    expect(document.documentElement.lang).toBe("en");
    const patchCall = request.mock.calls.find(
      ([input, init]) => String(input).endsWith("/account") && init?.method === "PATCH",
    );
    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({
      displayName: "Frank Updated",
      interfaceLanguage: "en",
      avatarMediaId: mediaItem.id,
    });
  });

  it("discards account language and portrait drafts on cancel", async () => {
    const mediaItem = {
      id: "f6209cc7-086d-4d28-a67e-4d1ad3f750aa",
      slug: "portrait",
      url: "/api/account/media/f6209cc7-086d-4d28-a67e-4d1ad3f750aa/content",
      width: 600,
      height: 600,
    };
    const request = vi.fn((input, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/account/media?"))
        return Promise.resolve(json({ data: { items: [mediaItem], page: 1, hasMore: false } }));
      return Promise.resolve(successfulGet(input));
    });
    vi.stubGlobal("fetch", request);
    renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /Frank Gregor/ }));
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    fireEvent.click(screen.getByRole("button", { name: "Bild auswählen" }));
    fireEvent.click(await screen.findByRole("button", { name: "portrait" }));
    expect(
      screen.getByRole("dialog", { name: "Benutzerkonto" }).querySelector("img")?.getAttribute("src"),
    ).toBe(mediaItem.url);
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

    expect(screen.getByRole("heading", { name: "Beiträge" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Frank Gregor/ }));
    expect(screen.getByRole("button", { name: "Deutsch" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("dialog", { name: "Benutzerkonto" }).querySelector("img")).toBeNull();
    expect(
      request.mock.calls.some(
        ([input, init]) => String(input).endsWith("/account") && init?.method === "PATCH",
      ),
    ).toBe(false);
  });

  it("uploads a portrait through the library and saves it as the account's picture", async () => {
    const uploaded = {
      id: "0c1d5e0b-6a43-4f2a-9b6e-3c8a7d2f1e90",
      slug: "mein-portrait",
      url: "/api/account/media/0c1d5e0b-6a43-4f2a-9b6e-3c8a7d2f1e90/content",
      width: 800,
      height: 800,
      existing: false,
    };
    const token = "claims.signature";
    const request = vi.fn((input, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/media/uploads"))
        return Promise.resolve(
          json({
            data: { token, url: `/media/uploads/${token}/content`, headers: { "Content-Type": "image/png" } },
          }),
        );
      if (url.endsWith(`/media/uploads/${token}/content`))
        return Promise.resolve(json({ data: { received: true } }));
      if (url.endsWith("/media/uploads/complete")) return Promise.resolve(json({ data: uploaded }));
      if (url.endsWith("/account") && init?.method === "PATCH")
        return Promise.resolve(
          json({ data: { ...account, avatarMediaId: uploaded.id, avatarUrl: uploaded.url } }),
        );
      return Promise.resolve(successfulGet(input));
    });
    vi.stubGlobal("fetch", request);
    renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /Frank Gregor/ }));
    const dialog = screen.getByRole("dialog", { name: "Benutzerkonto" });
    const input = dialog.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("No file input in the account dialog.");
    const file = new File([new Uint8Array([137, 80, 78, 71])], "Mein Portrait.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(dialog.querySelector("img")?.getAttribute("src")).toBe(uploaded.url));
    const asked = request.mock.calls.find(([url]) => String(url).endsWith("/media/uploads"));
    expect(JSON.parse(String(asked?.[1]?.body))).toEqual({
      filename: "Mein Portrait.png",
      type: "image/png",
      size: 4,
    });
    const sent = request.mock.calls.find(([url]) => String(url).endsWith("/content"));
    expect(sent?.[1]?.method).toBe("PUT");
    expect(sent?.[1]?.body).toBe(file);

    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(
        request.mock.calls.some(
          ([url, init]) => String(url).endsWith("/account") && init?.method === "PATCH",
        ),
      ).toBe(true),
    );
    const patch = request.mock.calls.find(
      ([url, init]) => String(url).endsWith("/account") && init?.method === "PATCH",
    );
    expect(JSON.parse(String(patch?.[1]?.body))).toMatchObject({ avatarMediaId: uploaded.id });
  });

  it("refuses a file the library does not take before anything is sent", async () => {
    const request = vi.fn((input) => Promise.resolve(successfulGet(input)));
    vi.stubGlobal("fetch", request);
    renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /Frank Gregor/ }));
    const input = screen.getByRole("dialog").querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("No file input in the account dialog.");
    fireEvent.change(input, { target: { files: [new File(["text"], "notes.txt", { type: "text/plain" })] } });

    expect((await screen.findByRole("alert")).textContent).toContain("JPEG, PNG, WebP, AVIF und GIF");
    expect(request.mock.calls.some(([url]) => String(url).includes("/media/uploads"))).toBe(false);
  });

  it("discards the account draft on Escape and backdrop close", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input) => Promise.resolve(successfulGet(input))),
    );
    renderDashboard();
    const footer = await screen.findByRole("button", { name: /Frank Gregor/ });

    footer.focus();
    expect(document.activeElement).toBe(footer);
    fireEvent.click(footer);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Discard me" } });
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(footer);
    fireEvent.click(footer);
    expect(screen.getByLabelText("Name").getAttribute("value")).toBe("Frank Gregor");
    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(footer);
  });

  it("keeps the role read-only and shows account save errors with their id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input, init?: RequestInit) => {
        if (String(input).endsWith("/account") && init?.method === "PATCH")
          return Promise.resolve(
            json(
              { error: { code: "conflict", message: "Adresse wird bereits verwendet.", id: "account-1" } },
              409,
            ),
          );
        return Promise.resolve(successfulGet(input));
      }),
    );
    renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /Frank Gregor/ }));
    expect(within(screen.getByRole("dialog")).getByText("Owner").closest(".badge")).toBeTruthy();
    expect(screen.queryByLabelText("Rolle")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Diese E-Mail-Adresse gehört bereits zu einem anderen Konto.");
    expect(alert.textContent).toContain("account-1");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("cannot dismiss the account dialog while a save is pending", async () => {
    let resolveSave: (response: Response) => void = () => undefined;
    const request = vi.fn((input, init?: RequestInit) => {
      if (String(input).endsWith("/account") && init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          resolveSave = resolve;
        });
      }
      return Promise.resolve(successfulGet(input));
    });
    vi.stubGlobal("fetch", request);
    renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /Frank Gregor/ }));
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(
        request.mock.calls.filter(
          ([input, init]) => String(input).endsWith("/account") && init?.method === "PATCH",
        ),
      ).toHaveLength(1),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    fireEvent.click(dialog);
    expect(screen.getByRole("dialog")).toBeTruthy();

    resolveSave(json({ data: { ...account, interfaceLanguage: "en" } }));
    expect(await screen.findByRole("heading", { name: "Posts" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows a protected error page when the account profile cannot load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input) =>
        String(input).endsWith("/account")
          ? Promise.resolve(
              json(
                {
                  error: { code: "internal", message: "Konto konnte nicht geladen werden.", id: "profile-1" },
                },
                500,
              ),
            )
          : Promise.resolve(json({ data: signedIn })),
      ),
    );
    renderDashboard();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Auf dem Server ist ein Fehler aufgetreten.");
    expect(alert.textContent).toContain("profile-1");
    expect(screen.queryByRole("navigation", { name: "Dashboard-Bereiche" })).toBeNull();
  });

  it("signs out from the account dialog and returns to login", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input) => {
        const url = String(input);
        if (url.endsWith("/dashboard/counts")) return Promise.resolve(json({ data: counts }));
        if (url.endsWith("/account")) return Promise.resolve(json({ data: account }));
        if (url.endsWith("/auth/sign-out")) return Promise.resolve(json({ data: { signedOut: true } }));
        return Promise.resolve(json({ data: signedIn }));
      }),
    );
    const { router } = renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /Frank Gregor/ }));
    fireEvent.click(await within(screen.getByRole("dialog")).findByRole("button", { name: "Abmelden" }));

    await screen.findByRole("heading", { name: "Anmelden" });
    expect(router.state.location.pathname).toBe("/login");
  });

  it("signs out from the button beside the account in the sidebar, without opening the account", async () => {
    const request = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/sign-out")) return Promise.resolve(json({ data: { signedOut: true } }));
      return Promise.resolve(successfulGet(input));
    });
    vi.stubGlobal("fetch", request);
    const { router } = renderDashboard("/media");

    await screen.findByRole("button", { name: /Frank Gregor/ });
    const footer = document.querySelector(".sidebar__footer") as HTMLElement;
    fireEvent.click(within(footer).getByRole("button", { name: "Abmelden" }));

    await screen.findByRole("heading", { name: "Anmelden" });
    expect(router.state.location.pathname).toBe("/login");
    expect(request.mock.calls.filter(([url]) => String(url).endsWith("/auth/sign-out"))).toHaveLength(1);
  });

  it("keeps the account dialog open and shows a sign-out failure with its id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input) => {
        const url = String(input);
        if (url.endsWith("/dashboard/counts")) return Promise.resolve(json({ data: counts }));
        if (url.endsWith("/account")) return Promise.resolve(json({ data: account }));
        if (url.endsWith("/auth/sign-out")) {
          return Promise.resolve(
            json({ error: { code: "internal", message: "Abmeldung fehlgeschlagen.", id: "logout-1" } }, 500),
          );
        }
        return Promise.resolve(json({ data: signedIn }));
      }),
    );
    renderDashboard("/media");

    fireEvent.click(await screen.findByRole("button", { name: /Frank Gregor/ }));
    fireEvent.click(await within(screen.getByRole("dialog")).findByRole("button", { name: "Abmelden" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Auf dem Server ist ein Fehler aufgetreten.");
    expect(alert.textContent).toContain("logout-1");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
