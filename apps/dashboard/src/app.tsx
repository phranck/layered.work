import { Logo, Row, RowList, Section, Sidebar } from "@layered/ui";
import { UserCircleIcon } from "@layered/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Outlet, useLinkClickHandler, useMatch, useNavigate, useRouteError } from "react-router";
import { AccountDialog } from "./account-dialog.js";
import { useDashboardApi } from "./dashboard-context.js";
import { ErrorNotice } from "./error-notice.js";
import { DashboardLanguageProvider, useDashboardLanguage } from "./language-context.js";
import { dashboardGroups } from "./routes.js";

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
}: {
  accountOpen: boolean;
  onOpenAccount: () => void;
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
  return (
    <Sidebar>
      <Sidebar.Header>
        <Logo href="/posts" inkHeight="26px" onClick={handleLogoClick} />
      </Sidebar.Header>
      <Sidebar.Body>
        {session.isError && <ErrorNotice error={session.error} />}
        {session.data && counts.isError && <ErrorNotice error={counts.error} />}
        <nav aria-label={text("dashboardNav")}>
          {dashboardGroups.map((group) => (
            <Section key={group.id}>
              <Section.Title title={text(group.labelKey)} />
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
      </Sidebar.Body>
      <Sidebar.Footer>
        <Row.Button
          onClick={onOpenAccount}
          disabled={!account.data}
          aria-haspopup="dialog"
          aria-expanded={accountOpen}
        >
          <Row.Lead aria-hidden="true">
            {account.data?.avatarUrl ? (
              <img className="dashboard-avatar" src={account.data.avatarUrl} alt="" />
            ) : (
              <UserCircleIcon weight="duotone" />
            )}
          </Row.Lead>
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
                  ? text("administrator")
                  : text("roleEditor")
                : undefined
            }
          />
        </Row.Button>
      </Sidebar.Footer>
      <Sidebar.Handle
        className="dashboard-sidebar__separator"
        aria-label="Trennung zwischen Navigation und Inhalt"
      />
    </Sidebar>
  );
}

function DashboardLayout() {
  const api = useDashboardApi();
  const navigate = useNavigate();
  const [accountOpen, setAccountOpen] = useState(false);
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
    <div className="workbench dashboard-layout">
      <DashboardSidebar accountOpen={accountOpen} onOpenAccount={() => setAccountOpen(true)} />
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
  return (
    <Section>
      <Section.Title title="Dashboard nicht verfügbar" level={1} />
      <Section.Body>
        <ErrorNotice error={useRouteError()} />
      </Section.Body>
    </Section>
  );
}
