import {
  MaxLength,
  NAVIGATION_HREF_MAX_LENGTH,
  type SaveSocialAccountBody,
  SOCIAL_PLATFORM_NAMES,
  SOCIAL_PLATFORMS,
  type SocialAccount,
  saveSocialAccountBody,
} from "@layered/schemas";
import { BrandMark, Button, Card, Field, Input, Select, Switch } from "@layered/ui";
import { FloppyDiskIcon, PencilSimpleIcon, PlusIcon, TrashIcon, XIcon } from "@layered/ui/icons";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { ScreenTitle } from "./app-bar-slots.js";
import { useDashboardApi } from "./dashboard-context.js";
import { refreshCounts } from "./dashboard-counts.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { CardDialog, ConfirmDialog } from "./modal.js";
import { useNotify } from "./notifications.js";
import { queryKeys } from "./query-keys.js";
import type { DashboardArea } from "./routes.js";
import { useSession } from "./session-queries.js";
import { moveItem } from "./sidebar-order.js";
import { Table } from "./table.js";

type Dialog = { editing: SocialAccount | null } | { deleting: SocialAccount } | null;
const platformOptions = SOCIAL_PLATFORMS.map((value) => ({ value, label: SOCIAL_PLATFORM_NAMES[value] }));

/** Fetches the accounts and the sidebar's count again after one was added, changed, moved or deleted. */
function refreshAccounts(client: QueryClient) {
  void client.invalidateQueries({ queryKey: queryKeys.socialAccounts });
  void refreshCounts(client);
}

export function SocialAccountsScreen({ area }: { area: DashboardArea }) {
  const api = useDashboardApi();
  const client = useQueryClient();
  const { text } = useDashboardLanguage();
  const { notifyError } = useNotify();
  const owner = useSession().data?.role === "owner";
  const accounts = useQuery({ queryKey: queryKeys.socialAccounts, queryFn: api.fetchSocialAccounts });
  const [dialog, setDialog] = useState<Dialog>(null);
  const refresh = () => refreshAccounts(client);
  const save = useMutation({
    mutationFn: (account: SocialAccount) => {
      const { id, ...value } = account;
      return api.saveSocialAccount(id, value);
    },
    onSuccess: refresh,
    onError: (error) => notifyError(error),
  });
  const reorder = useMutation({
    mutationFn: api.reorderSocialAccounts,
    onSuccess: refresh,
    onError: (error) => notifyError(error),
  });
  const list = accounts.data ?? [];
  return (
    <>
      <ScreenTitle title={text(area.labelKey)} />
      <Card>
        <Card.Header
          title={text(area.labelKey)}
          meta={list.length}
          actions={
            <Button
              tone="primary"
              icon={<PlusIcon />}
              disabled={!owner}
              onClick={() => setDialog({ editing: null })}
            >
              {text("socialNew")}
            </Button>
          }
        />
        {(accounts.isError || accounts.isPending || !owner) && (
          <Card.Body>
            {accounts.isError && <ErrorNotice error={accounts.error} />}
            {accounts.isPending && <p>{text("loading")}</p>}
            {!owner && <p>{text("ownerOnly")}</p>}
          </Card.Body>
        )}
        {accounts.isSuccess && !list.length && <Table.Empty>{text("socialEmpty")}</Table.Empty>}
        {list.length > 0 && (
          <Table
            columns={[
              { kind: "grip", label: "" },
              { kind: "title", label: text("socialPlatform") },
              { kind: "text", label: text("socialHandle") },
              { kind: "switch", label: text("navigationVisible") },
              { kind: "action", label: text("columnAction"), actions: 2 },
            ]}
            onMove={(from, to) => {
              if (from !== to)
                reorder.mutate(
                  moveItem(list, from, to).map((account, sortOrder) => ({ id: account.id, sortOrder })),
                );
            }}
          >
            {list.map((account, index) => (
              <Table.Row
                key={account.id}
                index={index}
                onOpen={owner ? () => setDialog({ editing: account }) : undefined}
              >
                <Table.Grip
                  index={index}
                  label={text("moveGroup", account.handle)}
                  disabled={!owner || reorder.isPending}
                />
                <Table.Cell kind="title">
                  <Table.Title
                    title={SOCIAL_PLATFORM_NAMES[account.platform]}
                    tile={<BrandMark brand={account.platform} />}
                  />
                </Table.Cell>
                <Table.Cell>{account.handle}</Table.Cell>
                <Table.Control kind="switch">
                  <Switch
                    aria-label={`${text("socialEnabled")}: ${account.handle}`}
                    checked={account.enabled}
                    disabled={!owner || save.isPending}
                    onCheckedChange={(enabled) => save.mutate({ ...account, enabled })}
                  />
                </Table.Control>
                <Table.Actions>
                  <Button.Icon
                    label={text("navigationEdit", account.handle)}
                    icon={<PencilSimpleIcon />}
                    disabled={!owner}
                    tabIndex={-1}
                    onClick={() => setDialog({ editing: account })}
                  />
                  <Button.Icon
                    label={text("navigationDelete", account.handle)}
                    icon={<TrashIcon />}
                    disabled={!owner}
                    onClick={() => setDialog({ deleting: account })}
                  />
                </Table.Actions>
              </Table.Row>
            ))}
          </Table>
        )}
      </Card>
      {dialog && "editing" in dialog && (
        <SocialEditor
          account={dialog.editing}
          sortOrder={Math.max(-1, ...list.map((row) => row.sortOrder)) + 1}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog && "deleting" in dialog && (
        <SocialDelete account={dialog.deleting} onClose={() => setDialog(null)} />
      )}
    </>
  );
}
function SocialEditor({
  account,
  sortOrder,
  onClose,
}: {
  account: SocialAccount | null;
  sortOrder: number;
  onClose: () => void;
}) {
  const api = useDashboardApi();
  const client = useQueryClient();
  const { text } = useDashboardLanguage();
  const { notifyError } = useNotify();
  const [value, setValue] = useState<SaveSocialAccountBody>(() =>
    account
      ? {
          platform: account.platform,
          handle: account.handle,
          href: account.href,
          enabled: account.enabled,
          sortOrder: account.sortOrder,
        }
      : { platform: "mastodon", handle: "", href: "", enabled: true, sortOrder },
  );
  const [invalid, setInvalid] = useState(false);
  const save = useMutation({
    mutationFn: (value: SaveSocialAccountBody) => api.saveSocialAccount(account?.id ?? null, value),
    onSuccess: () => {
      refreshAccounts(client);
      onClose();
    },
    onError: (error) => notifyError(error),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = saveSocialAccountBody.safeParse(value);
    setInvalid(!parsed.success);
    if (parsed.success) save.mutate(parsed.data);
  };
  return (
    <CardDialog labelId="social-edit-title" onClose={onClose}>
      <Card.Header
        id="social-edit-title"
        title={account ? text("navigationEdit", account.handle) : text("socialNew")}
      />
      <Card.Body>
        <form id="social-edit" className="settings-form" onSubmit={submit} noValidate>
          <Field label={text("socialPlatform")} htmlFor="social-platform">
            <Select
              id="social-platform"
              value={value.platform}
              options={platformOptions}
              onChange={(event) => {
                const platform = SOCIAL_PLATFORMS.find((item) => item === event.target.value);
                if (platform) setValue((current) => ({ ...current, platform }));
              }}
            />
          </Field>
          <BrandMark brand={value.platform} />
          <Field label={text("socialHandle")} htmlFor="social-handle">
            <Input
              id="social-handle"
              value={value.handle}
              maxLength={MaxLength.Line}
              onChange={(event) => setValue((current) => ({ ...current, handle: event.target.value }))}
            />
          </Field>
          <Field label={text("navigationAddress")} htmlFor="social-href">
            <Input
              id="social-href"
              type="url"
              value={value.href}
              maxLength={NAVIGATION_HREF_MAX_LENGTH}
              onChange={(event) => setValue((current) => ({ ...current, href: event.target.value }))}
            />
          </Field>
          <Field.Inline label={text("socialEnabled")} htmlFor="social-enabled">
            <Switch
              id="social-enabled"
              aria-label={text("socialEnabled")}
              checked={value.enabled}
              onCheckedChange={(enabled) => setValue((current) => ({ ...current, enabled }))}
            />
          </Field.Inline>
          {invalid && (
            <p role="alert" className="dashboard-error">
              {text("socialInvalid")}
            </p>
          )}
          {save.isError && <ErrorNotice error={save.error} />}
        </form>
      </Card.Body>
      <Card.Footer
        actions={
          <>
            <Button icon={<XIcon />} onClick={onClose}>
              {text("cancel")}
            </Button>
            <Button
              form="social-edit"
              type="submit"
              tone="primary"
              icon={<FloppyDiskIcon />}
              disabled={save.isPending}
            >
              {text("save")}
            </Button>
          </>
        }
      />
    </CardDialog>
  );
}
function SocialDelete({ account, onClose }: { account: SocialAccount; onClose: () => void }) {
  const api = useDashboardApi();
  const client = useQueryClient();
  const { text } = useDashboardLanguage();
  const remove = useMutation({
    mutationFn: () => api.deleteSocialAccount(account.id),
    onSuccess: () => {
      refreshAccounts(client);
      onClose();
    },
  });
  return (
    <ConfirmDialog
      title={text("navigationDelete", account.handle)}
      busy={remove.isPending}
      error={remove.error}
      onConfirm={() => remove.mutate()}
      onClose={onClose}
    >
      <p>{text("socialDeleteBody")}</p>
    </ConfirmDialog>
  );
}
