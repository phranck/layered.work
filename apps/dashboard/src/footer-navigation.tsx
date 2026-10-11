import {
  type FooterNavigation,
  MaxLength,
  NAVIGATION_ITEMS_MAX,
  type NavigationPlacement,
} from "@layered/schemas";
import { Button, Card, Field, Select, Switch } from "@layered/ui";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  FloppyDiskIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from "@layered/ui/icons";
import { type FormEvent, useState } from "react";
import { ScreenTitle } from "./app-bar-slots.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { moveItem, nextSortOrder, reorderedPositions } from "./list-order.js";
import { CardDialog, ConfirmDialog } from "./modal.js";
import {
  type DraftItem,
  draftItemsOf,
  hasBrokenLink,
  navigationBodyOf,
  newNavigationItem,
  placementOf,
  useDeleteNavigation,
  useNavigation,
  useReorderNavigation,
  useSaveNavigation,
  withoutItem,
} from "./navigation-query.js";
import { NavigationTarget } from "./navigation-target.js";
import { useNotify } from "./notifications.js";
import { Reorder } from "./reorder.js";
import type { DashboardArea } from "./routes.js";
import { useSession } from "./session-queries.js";
import { Table } from "./table.js";
import { useTextLanguage } from "./text-language.js";
import { Translated } from "./translated.js";
import "./footer-navigation.css";

/** Which dialog is open: the editor for a group or a new one, or the question before one is deleted. */
type OpenDialog = { editing: FooterNavigation | null } | { deleting: FooterNavigation } | null;

/**
 * One of the site's navigations, main or footer, as a table of its groups of
 * links: dragged into order, opened for editing, deleted. Every account sees
 * them; only the owner changes them.
 *
 * @param area - The sidebar area, which names the screen and decides the navigation.
 */
export function FooterNavigationScreen({ area }: { area: DashboardArea }) {
  const placement = placementOf(area);
  const { text, language } = useDashboardLanguage();
  const session = useSession();
  const owner = session.data?.role === "owner";
  const list = useNavigation(placement);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const { notifyError } = useNotify();
  const reorder = useReorderNavigation(placement, { onError: notifyError });
  return (
    <>
      <ScreenTitle title={text(area.labelKey)} />
      <Card>
        <Card.Header
          title={text(area.labelKey)}
          meta={list.data?.length}
          actions={
            <Button
              tone="primary"
              icon={<PlusIcon />}
              disabled={!owner}
              onClick={() => setDialog({ editing: null })}
            >
              {text("navigationNew")}
            </Button>
          }
        />
        {(list.isError || list.isPending || !owner) && (
          <Card.Body>
            {list.isError && <ErrorNotice error={list.error} />}
            {list.isPending && <p>{text("loading")}</p>}
            {!owner && <p>{text("ownerOnly")}</p>}
          </Card.Body>
        )}
        {list.isSuccess && list.data.length === 0 && <Table.Empty>{text("navigationEmpty")}</Table.Empty>}
        {list.isSuccess && list.data.length > 0 && (
          <Table
            columns={[
              { kind: "grip", label: "" },
              { kind: "title", label: text("columnName") },
              { kind: "text", label: text("columnLinks") },
              { kind: "action", label: text("columnAction"), actions: 2 },
            ]}
            onMove={(from, to) => {
              if (from !== to) reorder.mutate(reorderedPositions(list.data, from, to));
            }}
          >
            {list.data.map((group, index) => {
              const name = group.title[language];
              const broken = hasBrokenLink(group);
              return (
                <Table.Row
                  key={group.id}
                  index={index}
                  onOpen={owner ? () => setDialog({ editing: group }) : undefined}
                >
                  <Table.Grip
                    index={index}
                    label={text("moveGroup", name)}
                    disabled={!owner || reorder.isPending}
                  />
                  <Table.Cell kind="title">
                    <Table.Title title={name} />
                  </Table.Cell>
                  <Table.Cell>
                    {broken && <Table.Badge tone="warning">{text("navigationBroken")}</Table.Badge>}{" "}
                    {group.items.map((item) => item.label[language]).join(", ")}
                  </Table.Cell>
                  <Table.Actions>
                    <Button.Icon
                      label={text("navigationEdit", name)}
                      icon={<PencilSimpleIcon />}
                      disabled={!owner}
                      tabIndex={-1}
                      onClick={() => setDialog({ editing: group })}
                    />
                    <Button.Icon
                      label={text("navigationDelete", name)}
                      icon={<TrashIcon />}
                      tone="danger"
                      disabled={!owner}
                      onClick={() => setDialog({ deleting: group })}
                    />
                  </Table.Actions>
                </Table.Row>
              );
            })}
          </Table>
        )}
      </Card>
      {dialog && "editing" in dialog && (
        <NavigationEditor
          placement={placement}
          group={dialog.editing}
          sortOrder={nextSortOrder(list.data ?? [])}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog && "deleting" in dialog && (
        <NavigationDelete placement={placement} group={dialog.deleting} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

/**
 * A group of links in a dialog: its title in both languages, and its links,
 * each with its label, its target, its parent and whether it shows in the
 * language the dialog's switch has chosen.
 *
 * @param placement - Which navigation the group belongs to.
 * @param group - The group, or null for a new one.
 * @param sortOrder - The place a new group takes.
 * @param onClose - Closes the dialog, after a save as well.
 */
function NavigationEditor({
  placement,
  group,
  sortOrder,
  onClose,
}: {
  placement: NavigationPlacement;
  group: FooterNavigation | null;
  sortOrder: number;
  onClose: () => void;
}) {
  const { text, language } = useDashboardLanguage();
  const { notify, notifyError } = useNotify();
  const [title, setTitle] = useState(group?.title ?? { en: "", de: "" });
  const [items, setItems] = useState(() => draftItemsOf(group));
  const [invalid, setInvalid] = useState(false);
  const save = useSaveNavigation(placement, group, {
    onError: notifyError,
    onSuccess: () => {
      notify({ tone: "success", message: text("saved") });
      onClose();
    },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = navigationBodyOf(title, group?.sortOrder ?? sortOrder, items);
    setInvalid(body === null);
    if (body) save.mutate(body);
  };
  const updateItem = (key: string, change: Partial<DraftItem>) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)));
  return (
    <Translated>
      <CardDialog labelId="navigation-edit-title" onClose={onClose}>
        <Card.Header
          id="navigation-edit-title"
          title={group ? text("navigationEdit", group.title[language]) : text("navigationNew")}
          actions={<Translated.Switch />}
        />
        <Card.Body>
          <form id="navigation-edit" className="settings-form" onSubmit={submit} noValidate>
            <Translated.Field
              id="navigation-title"
              label={text("navigationTitle")}
              value={title}
              maxLength={MaxLength.Line}
              onChange={setTitle}
            />
            <Reorder.List onMove={(from, to) => setItems((current) => moveItem(current, from, to))}>
              {items.map((item, index) => (
                <Reorder.Item key={item.key} index={index}>
                  <NavigationItemFields
                    key={item.key}
                    item={item}
                    parents={items.filter((candidate) => candidate.key !== item.key && !candidate.parentId)}
                    hasChildren={items.some((candidate) => candidate.parentId === item.id)}
                    index={index}
                    length={items.length}
                    onChange={(change) => updateItem(item.key, change)}
                    onMove={(to) => setItems((current) => moveItem(current, index, to))}
                    onRemove={() => setItems((current) => withoutItem(current, item))}
                  />
                </Reorder.Item>
              ))}
            </Reorder.List>
            <Button
              icon={<PlusIcon />}
              disabled={items.length >= NAVIGATION_ITEMS_MAX}
              onClick={() => setItems((current) => [...current, newNavigationItem()])}
            >
              {text("navigationAddLink")}
            </Button>
            {invalid && (
              <p className="dashboard-error" role="alert">
                {text("navigationInvalid")}
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
                type="submit"
                form="navigation-edit"
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
    </Translated>
  );
}

function NavigationItemFields({
  item,
  index,
  length,
  parents,
  hasChildren,
  onChange,
  onMove,
  onRemove,
}: {
  item: DraftItem;
  index: number;
  length: number;
  parents: DraftItem[];
  hasChildren: boolean;
  onChange: (change: Partial<DraftItem>) => void;
  onMove: (index: number) => void;
  onRemove: () => void;
}) {
  const { text, language } = useDashboardLanguage();
  const textLanguage = useTextLanguage();
  const name = item.label[language] || String(index + 1);
  return (
    <div className="nav-manager__group settings-form">
      <Translated.Field
        id={`navigation-${item.key}`}
        label={text("navigationLabel")}
        value={item.label}
        maxLength={MaxLength.Line}
        onChange={(label) => onChange({ label })}
      />
      <NavigationTarget item={item} itemKey={item.key} onChange={onChange} />
      <Field label={text("navigationParent")} htmlFor={`navigation-${item.key}-parent`}>
        <Select
          id={`navigation-${item.key}-parent`}
          value={item.parentId ?? ""}
          disabled={hasChildren}
          options={[
            { value: "", label: text("navigationTopLevel") },
            ...parents.flatMap((parent) =>
              parent.id ? [{ value: parent.id, label: parent.label[language] || parent.id }] : [],
            ),
          ]}
          onChange={(event) => onChange({ parentId: event.target.value || null })}
        />
      </Field>
      <Field.Inline
        label={text("navigationVisible")}
        htmlFor={`navigation-${item.key}-visible-${textLanguage}`}
      >
        <Switch
          id={`navigation-${item.key}-visible-${textLanguage}`}
          aria-label={text("navigationVisible")}
          checked={item.visible[textLanguage]}
          onCheckedChange={(checked) => onChange({ visible: { ...item.visible, [textLanguage]: checked } })}
        />
      </Field.Inline>
      <div className="actions">
        <Reorder.Handle index={index} label={text("moveGroup", name)} />
        <Button.Icon
          label={text("navigationUp", name)}
          icon={<ArrowUpIcon />}
          disabled={index === 0}
          onClick={() => onMove(index - 1)}
        />
        <Button.Icon
          label={text("navigationDown", name)}
          icon={<ArrowDownIcon />}
          disabled={index === length - 1}
          onClick={() => onMove(index + 1)}
        />
        <Button.Icon
          label={text("navigationLinkRemove", name)}
          icon={<TrashIcon />}
          tone="danger"
          onClick={onRemove}
        />
      </div>
    </div>
  );
}

function NavigationDelete({
  placement,
  group,
  onClose,
}: {
  placement: NavigationPlacement;
  group: FooterNavigation;
  onClose: () => void;
}) {
  const { text, language } = useDashboardLanguage();
  const remove = useDeleteNavigation(placement, group, { onSuccess: () => onClose() });
  return (
    <ConfirmDialog
      title={text("navigationDelete", group.title[language])}
      busy={remove.isPending}
      error={remove.error}
      onConfirm={() => remove.mutate()}
      onClose={onClose}
    >
      <p>{text("navigationDeleteBody", group.items.length)}</p>
    </ConfirmDialog>
  );
}
