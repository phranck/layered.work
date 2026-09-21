import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDashboardApi } from "./api.js";
import { expirationLoginLocation } from "./auth-routing.js";
import { DashboardApiProvider } from "./dashboard-context.js";
import { createDashboardMemoryRouter } from "./router.js";

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

function successfulGet(input: RequestInfo | URL) {
  const url = String(input);
  if (url.endsWith("/dashboard/counts")) return json({ data: counts });
  if (url.endsWith("/account")) return json({ data: account });
  return json({ data: signedIn });
}

function renderDashboard(path = "/posts", loginAlias?: { username: string; email: string }) {
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

afterEach(() => {
  cleanup();
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
    const form = screen.getByRole("button", { name: "Anmelden" }).closest("form");
    if (!form) throw new Error("Missing login form");
    fireEvent.submit(form);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(request).not.toHaveBeenCalled();
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
    expect(links).toHaveLength(14);
    const settings = within(navigation).getByRole("link", { name: "Einstellungen" });
    fireEvent.click(settings);

    await waitFor(() => expect(router.state.location.pathname).toBe("/settings"));
    expect(settings.getAttribute("aria-current")).toBe("page");
    expect(settings.getAttribute("data-current")).toBe("true");
    expect(screen.getByRole("heading", { name: "Einstellungen" })).toBeTruthy();

    fireEvent.click(screen.getByRole("link", { name: "LAYERED.work" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/posts"));
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
    renderDashboard();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Zahlen konnten nicht geladen werden.");
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
    const { router } = renderDashboard();

    expect(await screen.findByRole("link", { name: "Beiträge 12" })).toBeTruthy();
    await router.navigate("/pages");

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
    expect(alert.textContent).toContain("Sitzung konnte nicht geladen werden.");
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
    const form = screen.getByRole("button", { name: "Anmelden" }).closest("form");
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
    expect(within(screen.getByRole("dialog")).getByText("Administrator").closest(".badge")).toBeTruthy();
    expect(screen.queryByLabelText("Rolle")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Adresse wird bereits verwendet.");
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
    expect(alert.textContent).toContain("Konto konnte nicht geladen werden.");
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
    fireEvent.click(await screen.findByRole("button", { name: "Abmelden" }));

    await screen.findByRole("heading", { name: "Anmelden" });
    expect(router.state.location.pathname).toBe("/login");
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
    renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /Frank Gregor/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Abmelden" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Abmeldung fehlgeschlagen.");
    expect(alert.textContent).toContain("logout-1");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
