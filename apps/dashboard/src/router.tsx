import { createBrowserRouter, createMemoryRouter, Navigate, type RouteObject } from "react-router";
import { AreaScreen, DashboardShell, NotFoundScreen, RouteErrorScreen } from "./app.js";
import { dashboardAreas } from "./routes.js";

export const dashboardRouteObjects: RouteObject[] = [
  {
    path: "/",
    Component: DashboardShell,
    ErrorBoundary: RouteErrorScreen,
    children: [
      { index: true, element: <Navigate to="/posts" replace /> },
      ...dashboardAreas.map((area) => ({ path: area.path, element: <AreaScreen title={area.label} /> })),
      { path: "*", Component: NotFoundScreen },
    ],
  },
];

export function createDashboardBrowserRouter() {
  return createBrowserRouter(dashboardRouteObjects);
}

export function createDashboardMemoryRouter(initialEntries: string[]) {
  return createMemoryRouter(dashboardRouteObjects, { initialEntries });
}
