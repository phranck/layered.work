import { Logo, Row, RowList, Section, Sidebar } from "@layered/ui";
import { UserCircleIcon } from "@layered/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { Outlet, useLinkClickHandler, useMatch, useRouteError } from "react-router";
import { DashboardApiError, fetchDashboardCounts, fetchSession } from "./api.js";
import { dashboardGroups } from "./routes.js";

function ErrorNotice({ error }: { error: unknown }) {
  const known = error instanceof DashboardApiError ? error : null;
  return (
    <p className="dashboard-error" role="alert">
      {known?.message ?? "Die Daten konnten nicht geladen werden."}
      {known?.id && <span className="dashboard-error__id">Fehler-ID: {known.id}</span>}
    </p>
  );
}

function AreaLink({
  area,
  count,
}: {
  area: (typeof dashboardGroups)[number]["areas"][number];
  count: number | null | undefined;
}) {
  const active = useMatch({ path: `/${area.path}`, end: true });
  const handleClick = useLinkClickHandler(`/${area.path}`);
  const Icon = area.icon;
  return (
    <Row.Link
      href={`/${area.path}`}
      onClick={handleClick}
      title={area.label}
      aria-current={active ? "page" : undefined}
      data-current={active ? "true" : undefined}
    >
      <Row.Lead aria-hidden="true">
        <Icon weight="duotone" />
      </Row.Lead>
      <Row.Text title={area.label} />
      {count !== null && count !== undefined && <Row.Meta>{count}</Row.Meta>}
    </Row.Link>
  );
}

function DashboardSidebar() {
  const handleLogoClick = useLinkClickHandler("/posts");
  const session = useQuery({ queryKey: ["session"], queryFn: fetchSession, retry: false });
  const counts = useQuery({
    queryKey: ["dashboard-counts", session.data?.id],
    queryFn: fetchDashboardCounts,
    enabled: session.isSuccess && session.data !== null,
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
        <nav aria-label="Dashboard-Bereiche">
          {dashboardGroups.map((group) => (
            <Section key={group.id}>
              <Section.Title title={group.label} />
              <Section.Body>
                <RowList>
                  {group.areas.map((area) => {
                    const count = area.countKey && visibleCounts ? visibleCounts[area.countKey] : null;
                    return <AreaLink key={area.id} area={area} count={count} />;
                  })}
                </RowList>
              </Section.Body>
            </Section>
          ))}
        </nav>
      </Sidebar.Body>
      <Sidebar.Footer>
        <Row>
          <Row.Lead aria-hidden="true">
            <UserCircleIcon weight="duotone" />
          </Row.Lead>
          <Row.Text
            title={
              session.isPending
                ? "Sitzung wird geladen…"
                : session.isError
                  ? "Sitzung nicht verfügbar"
                  : (session.data?.displayName ?? "Nicht angemeldet")
            }
            note={session.data ? (session.data.role === "owner" ? "Administrator" : "Redaktion") : undefined}
          />
        </Row>
      </Sidebar.Footer>
      <Sidebar.Handle
        className="dashboard-sidebar__separator"
        aria-label="Trennung zwischen Navigation und Inhalt"
      />
    </Sidebar>
  );
}

export function DashboardShell() {
  return (
    <div className="workbench dashboard-layout">
      <DashboardSidebar />
      <main className="workbench__main dashboard-main">
        <Outlet />
      </main>
    </div>
  );
}

export function AreaScreen({ title }: { title: string }) {
  return (
    <Section>
      <Section.Title title={title} level={1} />
      <Section.Body>
        <p className="unfinished">Dieser Bereich wird in einem eigenen Arbeitsschritt umgesetzt.</p>
      </Section.Body>
    </Section>
  );
}

export function NotFoundScreen() {
  return (
    <Section>
      <Section.Title title="Seite nicht gefunden" level={1} />
      <Section.Body>
        <p>Für diese Adresse gibt es keinen Dashboard-Bereich.</p>
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
