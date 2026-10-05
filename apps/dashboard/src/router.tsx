import type { QueryClient } from "@tanstack/react-query";
import type { ComponentType } from "react";
import { createBrowserRouter, createMemoryRouter, Navigate, type RouteObject, redirect } from "react-router";
import { AccessTokensScreen } from "./access-tokens.js";
import type { DashboardApi } from "./api.js";
import { AreaScreen, DashboardShell, NotFoundScreen, RouteErrorScreen } from "./app.js";
import { LoginScreen, type LoginScreenProps } from "./auth.js";
import { safeReturnTo } from "./auth-routing.js";
import { EntryEditorScreen } from "./entry-editor.js";
import { EntryListScreen } from "./entry-list.js";
import { FooterNavigationScreen } from "./footer-navigation.js";
import { FormEditorScreen, FormsScreen } from "./forms.js";
import { MailTemplateEditorScreen, MailTemplatesScreen } from "./mail-templates.js";
import { type DashboardArea, dashboardAreas } from "./routes.js";
import { AnalyticsSettingsScreen, MailSettingsScreen, SiteSettingsScreen } from "./settings.js";
import { SubmissionsScreen } from "./submissions.js";
import { TopicsScreen } from "./topics.js";

/**
 * The areas with a screen of their own rather than an entry list: the topics,
 * and the System group's areas, each of which is one group of the site's settings.
 */
const AREA_SCREENS: Partial<Record<string, ComponentType<{ area: DashboardArea }>>> = {
  tags: TopicsScreen,
  settings: SiteSettingsScreen,
  smtp: MailSettingsScreen,
  analytics: AnalyticsSettingsScreen,
  submissions: SubmissionsScreen,
  "api-tokens": AccessTokensScreen,
  "footer-nav": FooterNavigationScreen,
  "main-nav": FooterNavigationScreen,
};

export interface DashboardRouterOptions {
  api: DashboardApi;
  queryClient: QueryClient;
  initialEntries?: string[];
  loginAlias?: LoginScreenProps["loginAlias"];
}

function loginLocation(requestUrl: string, expired = false): string {
  const url = new URL(requestUrl);
  const requested = `${url.pathname}${url.search}${url.hash}`;
  const search = new URLSearchParams({ returnTo: safeReturnTo(requested) });
  if (expired) search.set("expired", "1");
  return `/login?${search}`;
}

export function dashboardRouteObjects({
  api,
  queryClient,
  loginAlias,
}: DashboardRouterOptions): RouteObject[] {
  return [
    { path: "/login", element: <LoginScreen loginAlias={loginAlias} /> },
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
        ...dashboardAreas.map((area): RouteObject => {
          const kind = area.entryKind;
          const Screen = AREA_SCREENS[area.id];
          if (Screen) return { path: area.path, element: <Screen area={area} /> };
          if (area.id === "forms")
            return {
              path: area.path,
              children: [
                { index: true, element: <FormsScreen area={area} /> },
                { path: ":id", element: <FormEditorScreen area={area} /> },
              ],
            };
          if (area.id === "mail-templates")
            return {
              path: area.path,
              children: [
                { index: true, element: <MailTemplatesScreen /> },
                { path: ":kind", element: <MailTemplateEditorScreen /> },
              ],
            };
          if (!kind) return { path: area.path, element: <AreaScreen titleKey={area.labelKey} /> };
          return {
            path: area.path,
            children: [
              { index: true, element: <EntryListScreen area={area} kind={kind} /> },
              { path: ":id", element: <EntryEditorScreen area={area} kind={kind} /> },
            ],
          };
        }),
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
