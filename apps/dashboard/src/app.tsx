import { Logo, Row, RowList, Section, Sidebar } from "@layered/ui";
import { DotsSixVerticalIcon, UserCircleIcon } from "@layered/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Outlet, useLinkClickHandler, useMatch, useNavigate, useRouteError } from "react-router";
import { AccountDialog } from "./account-dialog.js";
import { useDashboardApi } from "./dashboard-context.js";
import { ErrorNotice } from "./error-notice.js";
import { DashboardLanguageProvider, useDashboardLanguage } from "./language-context.js";
import { dashboardGroups } from "./routes.js";
import { useSidebarOrder } from "./sidebar-order.js";
import { type SidebarHandleProps, useSidebarWidth } from "./sidebar-width.js";

function AreaLink({
  area,
  count,
}: {
  area: (typeof dashboardGroups)[number]["areas"][number];
  count: number | null | undefined;
}) {
  const active = useMatch({ path: `/${area.path}`, end: true });
  const handleClick = useLinkClickHandler(`/${area.path}`);
  const { text } = useDashboardLanguage();
  const Icon = area.icon;
  const label = text(area.labelKey);
  return (
    <Row.Link
      href={`/${area.path}`}
      onClick={handleClick}
      title={label}
      aria-current={active ? "page" : undefined}
      data-current={active ? "true" : undefined}
    >
      <Row.Lead aria-hidden="true">
        <Icon weight="duotone" />
      </Row.Lead>
      <Row.Text title={label} />
      {count !== null && count !== undefined && <Row.Meta>{count}</Row.Meta>}
    </Row.Link>
  );
}

function DashboardSidebar({
  accountOpen,
  onOpenAccount,
  handle,
}: {
  accountOpen: boolean;
  onOpenAccount: () => void;
  handle: SidebarHandleProps;
}) {
  const api = useDashboardApi();
  const { text } = useDashboardLanguage();
  const handleLogoClick = useLinkClickHandler("/posts");
  const session = useQuery({
    queryKey: ["session"],
    queryFn: api.fetchSession,
    retry: false,
    staleTime: Infinity,
  });
  const account = useQuery({
    queryKey: ["account", session.data?.id],
    queryFn: api.fetchAccount,
    enabled: Boolean(session.data),
    retry: false,
    staleTime: Infinity,
  });
  const counts = useQuery({
    queryKey: ["dashboard-counts", session.data?.id],
    queryFn: api.fetchDashboardCounts,
    enabled: Boolean(session.data),
    retry: false,
  });
  const visibleCounts = session.isSuccess && session.data ? counts.data : undefined;
  const sidebar = useRef<HTMLElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const groups = useSidebarOrder(dashboardGroups, sidebar, slot);
  return (
    <Sidebar ref={sidebar}>
      <Sidebar.Header>
        <Logo href="/posts" inkHeight="26px" onClick={handleLogoClick} />
      </Sidebar.Header>
      <Sidebar.Body>
        {session.isError && <ErrorNotice error={session.error} />}
        {session.data && counts.isError && <ErrorNotice error={counts.error} />}
        <nav aria-label={text("dashboardNav")}>
          {groups.ordered.map((group) => (
            <Section key={group.id} ref={groups.ref(group.id)}>
              <Section.Title
                title={text(group.labelKey)}
                lead={
                  <button
                    type="button"
                    className="section__grip"
                    aria-label={text("moveGroup", text(group.labelKey))}
                    {...groups.grip(group.id)}
                  >
                    <DotsSixVerticalIcon aria-hidden="true" />
                  </button>
                }
                {...groups.handle(group.id)}
              />
              <Section.Body>
                <RowList>
                  {group.areas.map((area) => (
                    <AreaLink
                      key={area.id}
                      area={area}
                      count={area.countKey && visibleCounts ? visibleCounts[area.countKey] : null}
                    />
                  ))}
                </RowList>
              </Section.Body>
            </Section>
          ))}
        </nav>
        {/* Where a dragged group will land. One element for every drag, so
            nothing is created whilst a gesture runs. */}
        <div ref={slot} className="drop-slot" aria-hidden="true" />
      </Sidebar.Body>
      <Sidebar.Footer>
        <Row.Button
          onClick={onOpenAccount}
          disabled={!account.data}
          aria-haspopup="dialog"
          aria-expanded={accountOpen}
        >
          <Row.Tile aria-hidden="true">
            {account.data?.avatarUrl ? (
              <img src={account.data.avatarUrl} alt="" />
            ) : (
              <UserCircleIcon weight="duotone" />
            )}
          </Row.Tile>
          <Row.Text
            title={
              session.isPending
                ? text("loadingSession")
                : session.isError
                  ? text("unavailableSession")
                  : (account.data?.displayName ?? text("signedOut"))
            }
            note={
              account.data
                ? account.data.role === "owner"
                  ? text("roleOwner")
                  : text("roleEditor")
                : undefined
            }
          />
        </Row.Button>
      </Sidebar.Footer>
      <Sidebar.Handle
        className="dashboard-sidebar__separator"
        aria-label={text("sidebarResize")}
        {...handle}
      />
    </Sidebar>
  );
}

function DashboardLayout() {
  const api = useDashboardApi();
  const navigate = useNavigate();
  const [accountOpen, setAccountOpen] = useState(false);
  const workbench = useRef<HTMLDivElement>(null);
  const handle = useSidebarWidth(workbench);
  const session = useQuery({
    queryKey: ["session"],
    queryFn: api.fetchSession,
    retry: false,
    staleTime: Infinity,
  });
  const account = useQuery({
    queryKey: ["account", session.data?.id],
    queryFn: api.fetchAccount,
    enabled: Boolean(session.data),
    retry: false,
    staleTime: Infinity,
  });
  return (
    <div ref={workbench} className="workbench dashboard-layout">
      <DashboardSidebar
        accountOpen={accountOpen}
        onOpenAccount={() => setAccountOpen(true)}
        handle={handle}
      />
      <main className="workbench__main dashboard-main">
        <Outlet />
      </main>
      {accountOpen && account.data && (
        <AccountDialog
          account={account.data}
          onClose={() => setAccountOpen(false)}
          onSignedOut={() => navigate("/login", { replace: true })}
        />
      )}
    </div>
  );
}

export function DashboardShell() {
  const api = useDashboardApi();
  const session = useQuery({
    queryKey: ["session"],
    queryFn: api.fetchSession,
    retry: false,
    staleTime: Infinity,
  });
  const account = useQuery({
    queryKey: ["account", session.data?.id],
    queryFn: api.fetchAccount,
    enabled: Boolean(session.data),
    retry: false,
    staleTime: Infinity,
  });
  if (!account.data) return null;
  return (
    <DashboardLanguageProvider language={account.data.interfaceLanguage}>
      <DashboardLayout />
    </DashboardLanguageProvider>
  );
}

export function AreaScreen({
  titleKey,
}: {
  titleKey: (typeof dashboardGroups)[number]["areas"][number]["labelKey"];
}) {
  const { text } = useDashboardLanguage();
  return (
    <Section>
      <Section.Title title={text(titleKey)} level={1} />
      <Section.Body>
        <p className="unfinished">{text("unfinished")}</p>
      </Section.Body>
    </Section>
  );
}

export function NotFoundScreen() {
  const { text } = useDashboardLanguage();
  return (
    <Section>
      <Section.Title title={text("notFound")} level={1} />
      <Section.Body>
        <p>{text("notFoundBody")}</p>
      </Section.Body>
    </Section>
  );
}

export function RouteErrorScreen() {
  const { text } = useDashboardLanguage();
  return (
    <Section>
      <Section.Title title={text("dashboardUnavailable")} level={1} />
      <Section.Body>
        <ErrorNotice error={useRouteError()} />
      </Section.Body>
    </Section>
  );
}
