import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDashboardMemoryRouter } from "./router.js";

const queryClients = new Set<QueryClient>();

const signedIn = {
  id: "65f4582c-c983-4bd0-977c-d358d382fc83",
  email: "frank@example.com",
  displayName: "Frank Gregor",
  role: "owner",
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

function renderDashboard(path = "/posts") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClients.add(queryClient);
  const router = createDashboardMemoryRouter([path]);
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { queryClient, router };
}

afterEach(() => {
  cleanup();
  for (const queryClient of queryClients) queryClient.clear();
  queryClients.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("dashboard shell", () => {
  it("does not claim the reader is signed out while the session is loading", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderDashboard();

    expect(screen.getByText("Sitzung wird geladen…")).toBeTruthy();
    expect(screen.queryByText("Nicht angemeldet")).toBeNull();
  });

  it("navigates between all areas and marks the current row", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json({ data: signedIn }))
        .mockResolvedValueOnce(json({ data: counts })),
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
      vi
        .fn()
        .mockResolvedValueOnce(json({ data: signedIn }))
        .mockResolvedValueOnce(json({ data: counts })),
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

    expect(await screen.findByText("Nicht angemeldet")).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Beiträge" }).textContent).not.toContain("0");
  });

  it("removes cached counts when the current session becomes signed out", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json({ data: signedIn }))
        .mockResolvedValueOnce(json({ data: counts }))
        .mockResolvedValueOnce(json({ data: null })),
    );
    const { queryClient } = renderDashboard();

    expect(await screen.findByRole("link", { name: "Beiträge 12" })).toBeTruthy();
    await queryClient.invalidateQueries({ queryKey: ["session"] });

    expect(await screen.findByText("Nicht angemeldet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Beiträge" }).textContent).not.toContain("12");
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
    expect(screen.queryByText("Nicht angemeldet")).toBeNull();
    expect(screen.getByText("Sitzung nicht verfügbar")).toBeTruthy();
  });

  it("renders a truthful not-found page for an unknown path", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ data: null })));
    renderDashboard("/does-not-exist");

    expect(await screen.findByRole("heading", { name: "Seite nicht gefunden" })).toBeTruthy();
  });
});
