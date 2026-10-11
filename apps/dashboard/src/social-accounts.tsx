import {
  MaxLength,
  NAVIGATION_HREF_MAX_LENGTH,
  SOCIAL_PLATFORM_NAMES,
  SOCIAL_PLATFORMS,
  type SocialAccount,
} from "@layered/schemas";
import { BrandMark, Field, Input, Select, Switch } from "@layered/ui";
import { useState } from "react";
import { ActionButton } from "./action-button.js";
import { ScreenTitle } from "./app-bar-slots.js";
import { useDashboardLanguage } from "./language-context.js";
import { ListCard } from "./list-card.js";
import { nextSortOrder, reorderedPositions } from "./list-order.js";
import { ConfirmDialog, FormDialog } from "./modal.js";
import { useNotify } from "./notifications.js";
import type { DashboardArea } from "./routes.js";
import {
  accountDraftOf,
  checkedAccount,
  PLATFORM_OPTIONS,
  useDeleteSocialAccount,
  useReorderSocialAccounts,
  useSaveSocialAccount,
  useSocialAccounts,
} from "./social-accounts-query.js";
import { Table } from "./table.js";

/** Which dialog is open: the editor for an account or a new one, or the question before one is deleted. */
type Dialog = { editing: SocialAccount | null } | { deleting: SocialAccount } | null;

/**
 * The site's social accounts as a table: dragged into order, switched on and
 * off, opened for editing, deleted. Every account sees them; only the owner
 * changes them.
 *
 * @param area - The sidebar area, which names the screen.
 */
export function SocialAccountsScreen({ area }: { area: DashboardArea }) {
  const { text } = useDashboardLanguage();
  const { notifyError } = useNotify();
  const accounts = useSocialAccounts();
  const [dialog, setDialog] = useState<Dialog>(null);
  const save = useSaveSocialAccount({ onError: notifyError });
  const reorder = useReorderSocialAccounts({ onError: notifyError });
  return (
    <>
      <ScreenTitle title={text(area.labelKey)} />
      <ListCard
        title={text(area.labelKey)}
        query={accounts}
        newLabel={text("socialNew")}
        onNew={() => setDialog({ editing: null })}
        empty={text("socialEmpty")}
      >
        {(list, owner) => (
          <Table
            columns={[
              { kind: "grip", label: "" },
              { kind: "title", label: text("socialPlatform") },
              { kind: "text", label: text("socialHandle") },
              { kind: "switch", label: text("navigationVisible") },
              { kind: "action", label: text("columnAction"), actions: 2 },
            ]}
            onMove={(from, to) => {
              if (from !== to) reorder.mutate(reorderedPositions(list, from, to));
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
                    onCheckedChange={(enabled) =>
                      save.mutate({
                        id: account.id,
                        value: { ...accountDraftOf(account, account.sortOrder), enabled },
                      })
                    }
                  />
                </Table.Control>
                <Table.Actions>
                  <ActionButton.Icon
                    action="edit"
                    label={text("navigationEdit", account.handle)}
                    disabled={!owner}
                    tabIndex={-1}
                    onClick={() => setDialog({ editing: account })}
                  />
                  <ActionButton.Icon
                    action="delete"
                    label={text("navigationDelete", account.handle)}
                    disabled={!owner}
                    onClick={() => setDialog({ deleting: account })}
                  />
                </Table.Actions>
              </Table.Row>
            ))}
          </Table>
        )}
      </ListCard>
      {dialog && "editing" in dialog && (
        <SocialEditor
          account={dialog.editing}
          sortOrder={nextSortOrder(accounts.data ?? [])}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog && "deleting" in dialog && (
        <SocialDelete account={dialog.deleting} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

/**
 * One social account in a dialog: its platform, with the platform's mark, its
 * handle, its address and whether the site shows it.
 *
 * @param account - The account, or null for a new one.
 * @param sortOrder - The place a new account takes.
 * @param onClose - Closes the dialog, after a save as well.
 */
function SocialEditor({
  account,
  sortOrder,
  onClose,
}: {
  account: SocialAccount | null;
  sortOrder: number;
  onClose: () => void;
}) {
  const { text } = useDashboardLanguage();
  const [value, setValue] = useState(() => accountDraftOf(account, sortOrder));
  const [invalid, setInvalid] = useState(false);
  const save = useSaveSocialAccount({ onSuccess: () => onClose() });
  const submit = () => {
    const body = checkedAccount(value);
    setInvalid(body === null);
    if (body) save.mutate({ id: account?.id ?? null, value: body });
  };
  return (
    <FormDialog
      title={account ? text("navigationEdit", account.handle) : text("socialNew")}
      onSubmit={submit}
      onClose={onClose}
      busy={save.isPending}
      problem={invalid ? text("socialInvalid") : null}
      error={save.error}
    >
      <Field label={text("socialPlatform")} htmlFor="social-platform">
        <Select
          id="social-platform"
          value={value.platform}
          options={PLATFORM_OPTIONS}
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
    </FormDialog>
  );
}

/** The question before a social account is deleted. */
function SocialDelete({ account, onClose }: { account: SocialAccount; onClose: () => void }) {
  const { text } = useDashboardLanguage();
  const remove = useDeleteSocialAccount(account, { onSuccess: () => onClose() });
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
