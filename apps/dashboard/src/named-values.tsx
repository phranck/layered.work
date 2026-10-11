import { writeValueReference } from "@layered/content";
import {
  type CreateNamedValueBody,
  MaxLength,
  type NamedValue,
  type NamedValueUse,
  VALUE_NAME_MAX_LENGTH,
} from "@layered/schemas";
import { Button, Card, Field, Input } from "@layered/ui";
import { FloppyDiskIcon, PencilSimpleIcon, PlusIcon, TrashIcon, XIcon } from "@layered/ui/icons";
import { type FormEvent, useState } from "react";
import { ScreenTitle } from "./app-bar-slots.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { CardDialog, ConfirmDialog } from "./modal.js";
import {
  checkedValueDraft,
  useDeleteNamedValue,
  useNamedValues,
  useSaveNamedValue,
} from "./named-values-query.js";
import type { DashboardArea } from "./routes.js";
import { useSession } from "./session-queries.js";
import { Table } from "./table.js";

/**
 * The named values: lines of text kept once, which content refers to as
 * `{{ name }}`.
 *
 * Laid out as the social accounts are: a card listing one row per value, a
 * dialog to add or change one, and a dialog to delete one. Each row says where
 * the value is used, because that is what decides whether it can be deleted,
 * and the delete dialog names the places rather than offering a button that
 * the API would refuse.
 */

type Dialog = { editing: NamedValue | null } | { deleting: NamedValue } | null;

/**
 * The list of values for the dashboard's Values area.
 *
 * @param area - The area this screen is shown for.
 */
export function NamedValuesScreen({ area }: { area: DashboardArea }) {
  const { text } = useDashboardLanguage();
  const owner = useSession().data?.role === "owner";
  const values = useNamedValues();
  const [dialog, setDialog] = useState<Dialog>(null);
  const list = values.data ?? [];
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
              {text("valuesNew")}
            </Button>
          }
        />
        {(values.isError || values.isPending || !owner) && (
          <Card.Body>
            {values.isError && <ErrorNotice error={values.error} />}
            {values.isPending && <p>{text("loading")}</p>}
            {!owner && <p>{text("ownerOnly")}</p>}
          </Card.Body>
        )}
        {values.isSuccess && !list.length && <Table.Empty>{text("valuesEmpty")}</Table.Empty>}
        {list.length > 0 && (
          <Table
            columns={[
              { kind: "title", label: text("valueName") },
              { kind: "text", label: text("valueText") },
              { kind: "text", label: text("columnUses") },
              { kind: "action", label: text("columnAction"), actions: 2 },
            ]}
          >
            {list.map((value) => (
              <Table.Row key={value.id} onOpen={owner ? () => setDialog({ editing: value }) : undefined}>
                <Table.Cell kind="title">
                  <Table.Title title={writeValueReference(value.name)} />
                </Table.Cell>
                <Table.Cell>{value.value}</Table.Cell>
                <Table.Cell>
                  {value.usedBy.length ? text("valueUsedIn", value.usedBy.length) : text("valueUnused")}
                </Table.Cell>
                <Table.Actions>
                  <Button.Icon
                    label={text("navigationEdit", value.name)}
                    icon={<PencilSimpleIcon />}
                    disabled={!owner}
                    tabIndex={-1}
                    onClick={() => setDialog({ editing: value })}
                  />
                  <Button.Icon
                    label={text("navigationDelete", value.name)}
                    icon={<TrashIcon />}
                    disabled={!owner}
                    onClick={() => setDialog({ deleting: value })}
                  />
                </Table.Actions>
              </Table.Row>
            ))}
          </Table>
        )}
      </Card>
      {dialog && "editing" in dialog && (
        <ValueEditor value={dialog.editing} onClose={() => setDialog(null)} />
      )}
      {dialog && "deleting" in dialog && (
        <ValueDelete value={dialog.deleting} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

/**
 * Adds a value, or changes the text of one. A value's name is written once and
 * shown, not offered, afterwards, because content refers to it by that name.
 *
 * @param value - The value being changed, or null for a new one.
 * @param onClose - Called when the dialog is done, saved or not.
 */
function ValueEditor({ value, onClose }: { value: NamedValue | null; onClose: () => void }) {
  const { text } = useDashboardLanguage();
  const [draft, setDraft] = useState<CreateNamedValueBody>({
    name: value?.name ?? "",
    value: value?.value ?? "",
  });
  const [invalid, setInvalid] = useState(false);
  const save = useSaveNamedValue(value, onClose);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const checked = checkedValueDraft(value, draft);
    setInvalid(checked === null);
    if (checked) save.mutate(checked);
  };
  return (
    <CardDialog labelId="value-edit-title" onClose={onClose}>
      <Card.Header
        id="value-edit-title"
        title={value ? text("navigationEdit", writeValueReference(value.name)) : text("valuesNew")}
      />
      <Card.Body>
        <form id="value-edit" className="settings-form" onSubmit={submit} noValidate>
          <Field label={text("valueName")} hint={text("valueNameHint")} htmlFor="value-name">
            <Input
              id="value-name"
              value={draft.name}
              maxLength={VALUE_NAME_MAX_LENGTH}
              readOnly={value !== null}
              autoFocus={value === null}
              spellCheck={false}
              autoCapitalize="none"
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            />
          </Field>
          <Field label={text("valueText")} hint={text("valueTextHint")} htmlFor="value-text">
            <Input
              id="value-text"
              value={draft.value}
              maxLength={MaxLength.Line}
              autoFocus={value !== null}
              onChange={(event) => setDraft((current) => ({ ...current, value: event.target.value }))}
            />
          </Field>
          {invalid && (
            <p role="alert" className="dashboard-error">
              {text("valueInvalid")}
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
              form="value-edit"
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

/**
 * Deletes a value nothing refers to, and names the places that still refer to
 * one that cannot go yet.
 *
 * @param value - The value to delete.
 * @param onClose - Called when the dialog is done, deleted or not.
 */
function ValueDelete({ value, onClose }: { value: NamedValue; onClose: () => void }) {
  const { text } = useDashboardLanguage();
  const remove = useDeleteNamedValue(value, onClose);
  const inUse = value.usedBy.length > 0;
  const place = (use: NamedValueUse) =>
    use.kind === "entry" ? use.title : text("valueUseListing", use.listing);
  return (
    <ConfirmDialog
      title={text("navigationDelete", writeValueReference(value.name))}
      busy={remove.isPending}
      blocked={inUse}
      error={remove.error}
      onConfirm={() => remove.mutate()}
      onClose={onClose}
    >
      {inUse ? (
        <>
          <p>{text("valueInUse")}</p>
          <ul>
            {value.usedBy.map((use) => (
              <li key={use.kind === "entry" ? use.entryId : use.listing}>{place(use)}</li>
            ))}
          </ul>
        </>
      ) : (
        <p>{text("valueDeleteBody")}</p>
      )}
    </ConfirmDialog>
  );
}
