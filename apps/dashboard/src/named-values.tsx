import {
  type CreateNamedValueBody,
  createNamedValueBody,
  MaxLength,
  type NamedValue,
  type NamedValueUse,
  updateNamedValueBody,
  VALUE_NAME_MAX_LENGTH,
} from "@layered/schemas";
import { Button, Card, Field, Input, Row, RowList } from "@layered/ui";
import {
  BracketsCurlyIcon,
  FloppyDiskIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from "@layered/ui/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { ScreenTitle } from "./app-bar-slots.js";
import { useDashboardApi } from "./dashboard-context.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { CardDialog } from "./modal.js";
import { NAMED_VALUES_KEY, useNamedValues } from "./named-values-query.js";
import { useNotify } from "./notifications.js";
import type { DashboardArea } from "./routes.js";
import { useSession } from "./session-queries.js";

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

/** A reference as content writes it, which is how a value is recognized in the list. */
const written = (name: string) => `{{ ${name} }}`;

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
        <Card.Body>
          {values.isError && <ErrorNotice error={values.error} />}
          {values.isPending && <p>{text("loading")}</p>}
          {values.isSuccess && !list.length && <p>{text("valuesEmpty")}</p>}
          {!owner && <p>{text("ownerOnly")}</p>}
          <RowList>
            {list.map((value) => (
              <Row.Bare key={value.id}>
                <Row.Lead>
                  <BracketsCurlyIcon />
                </Row.Lead>
                <Row.Text title={written(value.name)} note={value.value} />
                <Row.Meta>
                  {value.usedBy.length ? text("valueUsedIn", value.usedBy.length) : text("valueUnused")}
                </Row.Meta>
                <Row.Actions>
                  <Button.Icon
                    label={text("navigationEdit", value.name)}
                    icon={<PencilSimpleIcon />}
                    disabled={!owner}
                    onClick={() => setDialog({ editing: value })}
                  />
                  <Button.Icon
                    label={text("navigationDelete", value.name)}
                    icon={<TrashIcon />}
                    disabled={!owner}
                    onClick={() => setDialog({ deleting: value })}
                  />
                </Row.Actions>
              </Row.Bare>
            ))}
          </RowList>
        </Card.Body>
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

/** Refreshes the list and the sidebar's count after a change. */
function useRefresh() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: NAMED_VALUES_KEY });
    void client.invalidateQueries({ queryKey: ["dashboard-counts"] });
  };
}

/**
 * Adds a value, or changes the text of one. A value's name is written once and
 * shown, not offered, afterwards, because content refers to it by that name.
 *
 * @param value - The value being changed, or null for a new one.
 * @param onClose - Called when the dialog is done, saved or not.
 */
function ValueEditor({ value, onClose }: { value: NamedValue | null; onClose: () => void }) {
  const api = useDashboardApi();
  const refresh = useRefresh();
  const { text } = useDashboardLanguage();
  const { notifyError } = useNotify();
  const [draft, setDraft] = useState<CreateNamedValueBody>({
    name: value?.name ?? "",
    value: value?.value ?? "",
  });
  const [invalid, setInvalid] = useState(false);
  const save = useMutation({
    mutationFn: (next: CreateNamedValueBody) =>
      value ? api.updateNamedValue(value.id, { value: next.value }) : api.createNamedValue(next),
    onSuccess: () => {
      refresh();
      onClose();
    },
    onError: (error) => notifyError(error),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = value
      ? updateNamedValueBody.safeParse({ value: draft.value })
      : createNamedValueBody.safeParse(draft);
    setInvalid(!parsed.success);
    if (parsed.success) save.mutate({ name: draft.name, value: parsed.data.value });
  };
  return (
    <CardDialog labelId="value-edit-title" onClose={onClose}>
      <Card.Header
        id="value-edit-title"
        title={value ? text("navigationEdit", written(value.name)) : text("valuesNew")}
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
  const api = useDashboardApi();
  const refresh = useRefresh();
  const { text } = useDashboardLanguage();
  const { notifyError } = useNotify();
  const remove = useMutation({
    mutationFn: () => api.deleteNamedValue(value.id),
    onSuccess: () => {
      refresh();
      onClose();
    },
    onError: (error) => notifyError(error),
  });
  const inUse = value.usedBy.length > 0;
  const place = (use: NamedValueUse) =>
    use.kind === "entry" ? use.title : text("valueUseListing", use.listing);
  return (
    <CardDialog labelId="value-delete-title" onClose={onClose}>
      <Card.Header id="value-delete-title" title={text("navigationDelete", written(value.name))} />
      <Card.Body>
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
        {remove.isError && <ErrorNotice error={remove.error} />}
      </Card.Body>
      <Card.Footer
        actions={
          <>
            <Button onClick={onClose} autoFocus>
              {text("cancel")}
            </Button>
            <Button tone="danger" disabled={inUse || remove.isPending} onClick={() => remove.mutate()}>
              {text("navigationDelete", written(value.name))}
            </Button>
          </>
        }
      />
    </CardDialog>
  );
}
