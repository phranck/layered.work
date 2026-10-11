import {
  type FooterNavigation,
  MaxLength,
  NAVIGATION_ITEMS_MAX,
  type NavigationPlacement,
} from "@layered/schemas";
import { Badge, Field, Select, Switch } from "@layered/ui";
import { useState } from "react";
import { ActionButton } from "./action-button.js";
import { ScreenTitle } from "./app-bar-slots.js";
import { useDashboardLanguage } from "./language-context.js";
import { ListCard } from "./list-card.js";
import { moveItem, nextSortOrder, reorderedPositions } from "./list-order.js";
import { ConfirmDialog, FormDialog } from "./modal.js";
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
  const list = useNavigation(placement);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const { notifyError } = useNotify();
  const reorder = useReorderNavigation(placement, { onError: notifyError });
  return (
    <>
      <ScreenTitle title={text(area.labelKey)} />
      <ListCard
        title={text(area.labelKey)}
        query={list}
        newLabel={text("navigationNew")}
        onNew={() => setDialog({ editing: null })}
        empty={text("navigationEmpty")}
      >
        {(groups, owner) => (
          <Table
            columns={[
              { kind: "grip", label: "" },
              { kind: "title", label: text("columnName") },
              { kind: "text", label: text("columnLinks") },
              { kind: "action", label: text("columnAction"), actions: 2 },
            ]}
            onMove={(from, to) => {
              if (from !== to) reorder.mutate(reorderedPositions(groups, from, to));
            }}
          >
            {groups.map((group, index) => {
              const name = group.title[language];
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
                    {hasBrokenLink(group) && <Badge tone="warning">{text("navigationBroken")}</Badge>}{" "}
                    {group.items.map((item) => item.label[language]).join(", ")}
                  </Table.Cell>
                  <Table.Actions>
                    <ActionButton.Icon
                      action="edit"
                      label={text("navigationEdit", name)}
                      disabled={!owner}
                      tabIndex={-1}
                      onClick={() => setDialog({ editing: group })}
                    />
                    <ActionButton.Icon
                      action="delete"
                      label={text("navigationDelete", name)}
                      disabled={!owner}
                      onClick={() => setDialog({ deleting: group })}
                    />
                  </Table.Actions>
                </Table.Row>
              );
            })}
          </Table>
        )}
      </ListCard>
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
  const { notify } = useNotify();
  const [title, setTitle] = useState(group?.title ?? { en: "", de: "" });
  const [items, setItems] = useState(() => draftItemsOf(group));
  const [invalid, setInvalid] = useState(false);
  const save = useSaveNavigation(placement, group, {
    onSuccess: () => {
      notify({ tone: "success", message: text("saved") });
      onClose();
    },
  });
  const submit = () => {
    const body = navigationBodyOf(title, group?.sortOrder ?? sortOrder, items);
    setInvalid(body === null);
    if (body) save.mutate(body);
  };
  const updateItem = (key: string, change: Partial<DraftItem>) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)));
  return (
    <Translated>
      <FormDialog
        title={group ? text("navigationEdit", group.title[language]) : text("navigationNew")}
        headerActions={<Translated.Switch />}
        onSubmit={submit}
        onClose={onClose}
        busy={save.isPending}
        problem={invalid ? text("navigationInvalid") : null}
        error={save.error}
      >
        <Translated.Field
          id="navigation-title"
          label={text("navigationTitle")}
          value={title}
          maxLength={MaxLength.Line}
          onChange={setTitle}
        />
        <Reorder.List
          className="nav-links"
          onMove={(from, to) => setItems((current) => moveItem(current, from, to))}
        >
          {items.map((item, index) => (
            <Reorder.Item key={item.key} index={index}>
              <NavigationItemFields
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
        <ActionButton
          action="new"
          disabled={items.length >= NAVIGATION_ITEMS_MAX}
          onClick={() => setItems((current) => [...current, newNavigationItem()])}
        >
          {text("navigationAddLink")}
        </ActionButton>
      </FormDialog>
    </Translated>
  );
}

/**
 * One link of a group in its own box: a row with the grip it is moved by, its
 * name and the buttons that move it or remove it, and its fields beneath.
 *
 * @param item - The link.
 * @param index - Its position among the group's links.
 * @param length - How many links the group holds.
 * @param parents - The links it may stand under, which stand at the top level themselves.
 * @param hasChildren - Whether a link stands under this one, which keeps it at the top level.
 * @param onChange - Replaces part of the link.
 * @param onMove - Moves it to another position.
 * @param onRemove - Takes it out of the group.
 */
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
    <div className="nav-link">
      <div className="nav-link__head">
        <Reorder.Handle index={index} label={text("moveGroup", name)} />
        <span className="nav-link__name">{name}</span>
        <span className="actions">
          <ActionButton.Icon
            action="moveUp"
            label={text("navigationUp", name)}
            disabled={index === 0}
            onClick={() => onMove(index - 1)}
          />
          <ActionButton.Icon
            action="moveDown"
            label={text("navigationDown", name)}
            disabled={index === length - 1}
            onClick={() => onMove(index + 1)}
          />
          <ActionButton.Icon action="remove" label={text("navigationLinkRemove", name)} onClick={onRemove} />
        </span>
      </div>
      <div className="nav-link__fields">
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
      </div>
    </div>
  );
}

/**
 * The question before a group of links is deleted, saying how many links go with it.
 *
 * @param placement - Which navigation the group belongs to.
 * @param group - The group.
 * @param onClose - Closes the question, after the deletion as well.
 */
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
