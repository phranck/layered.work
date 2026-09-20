import type { QueryClient } from "@tanstack/react-query";
import { createBrowserRouter, createMemoryRouter, Navigate, type RouteObject, redirect } from "react-router";
import type { DashboardApi } from "./api.js";
import { AreaScreen, DashboardShell, NotFoundScreen, RouteErrorScreen } from "./app.js";
import { LoginScreen } from "./auth.js";
import { safeReturnTo } from "./auth-routing.js";
import { dashboardAreas } from "./routes.js";

export interface DashboardRouterOptions {
  api: DashboardApi;
  queryClient: QueryClient;
  initialEntries?: string[];
}

function loginLocation(requestUrl: string, expired = false): string {
  const url = new URL(requestUrl);
  const requested = `${url.pathname}${url.search}${url.hash}`;
  const search = new URLSearchParams({ returnTo: safeReturnTo(requested) });
  if (expired) search.set("expired", "1");
  return `/login?${search}`;
}

export function dashboardRouteObjects({ api, queryClient }: DashboardRouterOptions): RouteObject[] {
  return [
    { path: "/login", Component: LoginScreen },
    {
      path: "/",
      Component: DashboardShell,
      ErrorBoundary: RouteErrorScreen,
      shouldRevalidate: () => true,
      loader: async ({ request }) => {
        const previousSession = queryClient.getQueryData(["session"]);
        const session = await queryClient.fetchQuery({
          queryKey: ["session"],
          queryFn: api.fetchSession,
          staleTime: 0,
        });
        if (!session) {
          queryClient.clear();
          throw redirect(loginLocation(request.url, Boolean(previousSession)));
        }
        await queryClient.fetchQuery({
          queryKey: ["account", session.id],
          queryFn: api.fetchAccount,
          staleTime: 0,
        });
        return session;
      },
      children: [
        { index: true, element: <Navigate to="/posts" replace /> },
        ...dashboardAreas.map((area) => ({
          path: area.path,
          element: <AreaScreen titleKey={area.labelKey} />,
        })),
        { path: "*", Component: NotFoundScreen },
      ],
    },
  ];
}

export function createDashboardBrowserRouter(options: DashboardRouterOptions) {
  return createBrowserRouter(dashboardRouteObjects(options));
}

export function createDashboardMemoryRouter(options: DashboardRouterOptions) {
  return createMemoryRouter(dashboardRouteObjects(options), { initialEntries: options.initialEntries });
}
