import { Button, Logo, Row, RowList, Section, Sidebar } from "@layered/ui";
import { DotsSixVerticalIcon, SignOutIcon, UserCircleIcon } from "@layered/ui/icons";
import { useRef, useState } from "react";
import { Outlet, useLinkClickHandler, useMatch, useRouteError } from "react-router";
import { AccountDialog } from "./account-dialog.js";
import { AppBarSlotsProvider, ScreenTitle } from "./app-bar-slots.js";
import { useDashboardCounts } from "./dashboard-counts.js";
import { ErrorNotice } from "./error-notice.js";
import { DashboardLanguageProvider, useDashboardLanguage } from "./language-context.js";
import { NotificationProvider } from "./notifications.js";
import { dashboardGroups, START_PATH } from "./routes.js";
import { SaveShortcutProvider } from "./save-shortcut.js";
import { SearchProvider } from "./search.js";
import { useAccount, useSession, useSignOut } from "./session-queries.js";
import { useSidebarOrder } from "./sidebar-order.js";
import { type SidebarHandleProps, useSidebarWidth } from "./sidebar-width.js";

function AreaLink({
  area,
  count,
}: {
  area: (typeof dashboardGroups)[number]["areas"][number];
  count: number | null | undefined;
}) {
  // Not only the area itself: an entry opened from a list stays in that list's area.
  const active = useMatch({ path: `/${area.path}`, end: false });
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
  const { text } = useDashboardLanguage();
  const handleLogoClick = useLinkClickHandler(START_PATH);
  const session = useSession();
  const account = useAccount();
  const signOut = useSignOut();
  const counts = useDashboardCounts();
  const visibleCounts = session.isSuccess && session.data ? counts.data : undefined;
  const sidebar = useRef<HTMLElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const groups = useSidebarOrder(dashboardGroups, sidebar, slot);
  return (
    <Sidebar ref={sidebar}>
      <Sidebar.Header>
        <Logo href={START_PATH} inkHeight="32px" onClick={handleLogoClick} />
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
        {signOut.isError && <ErrorNotice error={signOut.error} />}
        {/* Two targets side by side rather than one inside the other: the row
            opens the account, and the button at its end signs out. */}
        <div className="sidebar-account">
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
          <Button.Icon
            label={signOut.isPending ? text("signOutPending") : text("signOut")}
            icon={<SignOutIcon weight="duotone" />}
            disabled={!account.data || signOut.isPending}
            onClick={() => signOut.mutate()}
          />
        </div>
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
  const [accountOpen, setAccountOpen] = useState(false);
  const workbench = useRef<HTMLDivElement>(null);
  const handle = useSidebarWidth(workbench);
  const account = useAccount();
  return (
    <div ref={workbench} className="workbench dashboard-layout">
      {/* Inside the workbench, so the search dialog it holds reads the
          workbench's tokens as the account dialog does. */}
      <SearchProvider>
        <SaveShortcutProvider>
          {/* The bar's places and what is said in it reach the whole frame,
              the sidebar and the account dialog included. */}
          <AppBarSlotsProvider>
            {(bar) => (
              <NotificationProvider>
                <DashboardSidebar
                  accountOpen={accountOpen}
                  onOpenAccount={() => setAccountOpen(true)}
                  handle={handle}
                />
                {/* The bar stands above the content and stays put; only the
                    content below it scrolls. */}
                <div className="workbench__column">
                  {bar}
                  <main className="workbench__main dashboard-main">
                    <Outlet />
                  </main>
                </div>
                {accountOpen && account.data && (
                  <AccountDialog account={account.data} onClose={() => setAccountOpen(false)} />
                )}
              </NotificationProvider>
            )}
          </AppBarSlotsProvider>
        </SaveShortcutProvider>
      </SearchProvider>
    </div>
  );
}

export function DashboardShell() {
  const account = useAccount();
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
      <ScreenTitle title={text(titleKey)} />
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
      <ScreenTitle title={text("notFound")} />
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
