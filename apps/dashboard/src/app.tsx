import { Button, Card, Logo, Row, RowList, Section, Sidebar } from "@layered/ui";
import { SignOutIcon, UserCircleIcon, XIcon } from "@layered/ui/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Outlet, useLinkClickHandler, useMatch, useNavigate, useRouteError } from "react-router";
import { DashboardApiError } from "./api.js";
import { useDashboardApi } from "./dashboard-context.js";
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
  const api = useDashboardApi();
  const navigate = useNavigate();
  const [accountOpen, setAccountOpen] = useState(false);
  const handleLogoClick = useLinkClickHandler("/posts");
  const session = useQuery({
    queryKey: ["session"],
    queryFn: api.fetchSession,
    retry: false,
    staleTime: Infinity,
  });
  const counts = useQuery({
    queryKey: ["dashboard-counts", session.data?.id],
    queryFn: api.fetchDashboardCounts,
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
        <Row.Button onClick={() => setAccountOpen(true)} disabled={!session.data} aria-haspopup="dialog">
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
        </Row.Button>
      </Sidebar.Footer>
      <Sidebar.Handle
        className="dashboard-sidebar__separator"
        aria-label="Trennung zwischen Navigation und Inhalt"
      />
      {session.data && (
        <AccountDialog
          open={accountOpen}
          displayName={session.data.displayName}
          email={session.data.email}
          onClose={() => setAccountOpen(false)}
          onSignedOut={() => navigate("/login", { replace: true })}
        />
      )}
    </Sidebar>
  );
}

function AccountDialog({
  displayName,
  email,
  onClose,
  onSignedOut,
  open,
}: {
  displayName: string;
  email: string;
  onClose: () => void;
  onSignedOut: () => void;
  open: boolean;
}) {
  const api = useDashboardApi();
  const queryClient = useQueryClient();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const signOut = useMutation({ mutationFn: api.signOut, onSuccess: () => queryClient.clear() });
  const closeAccount = useEffectEvent(onClose);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    const closeFromBackdrop = (event: MouseEvent) => {
      if (event.target === dialog) closeAccount();
    };
    dialog.addEventListener("click", closeFromBackdrop);
    return () => dialog.removeEventListener("click", closeFromBackdrop);
  }, [open]);

  async function submitSignOut() {
    try {
      await signOut.mutateAsync();
      onClose();
      onSignedOut();
    } catch {
      // The mutation retains the structured error for the alert below.
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="account-dialog card-overlay"
      data-open={open || undefined}
      aria-labelledby="account-dialog-title"
      tabIndex={-1}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <Card>
        <Card.Header id="account-dialog-title" title="Benutzerkonto" />
        <Card.Stack>
          <Row>
            <Row.Text title={displayName} note={email} />
          </Row>
          {signOut.error && <ErrorNotice error={signOut.error} />}
        </Card.Stack>
        <Card.Footer
          actions={
            <>
              <Button onClick={onClose} icon={<XIcon weight="bold" />}>
                Schließen
              </Button>
              <Button
                tone="danger"
                onClick={submitSignOut}
                disabled={signOut.isPending}
                autoFocus
                icon={<SignOutIcon weight="bold" />}
              >
                {signOut.isPending ? "Abmeldung läuft…" : "Abmelden"}
              </Button>
            </>
          }
        />
      </Card>
    </dialog>
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
