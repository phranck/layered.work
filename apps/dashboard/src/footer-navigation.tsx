import {
  type FooterNavigation,
  MaxLength,
  type SaveFooterNavigationBody,
  saveFooterNavigationBody,
} from "@layered/schemas";
import { Button, Card, Field, Row, Select, Switch } from "@layered/ui";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  FloppyDiskIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from "@layered/ui/icons";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { ScreenTitle } from "./app-bar-slots.js";
import { useDashboardApi } from "./dashboard-context.js";
import { refreshCounts } from "./dashboard-counts.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { CardDialog, ConfirmDialog } from "./modal.js";
import { NavigationTarget } from "./navigation-target.js";
import { useNotify } from "./notifications.js";
import { Reorder } from "./reorder.js";
import type { DashboardArea } from "./routes.js";
import { useSession } from "./session-queries.js";
import { moveItem } from "./sidebar-order.js";
import { useTextLanguage } from "./text-language.js";
import { Translated } from "./translated.js";
import "./footer-navigation.css";

type Placement = "main" | "footer";
const listKey = (placement: Placement) => [`${placement}-navigation`] as const;
function refresh(client: QueryClient, placement: Placement) {
  void client.invalidateQueries({ queryKey: listKey(placement) });
  void refreshCounts(client);
}
type OpenDialog = { editing: FooterNavigation | null } | { deleting: FooterNavigation } | null;

export function FooterNavigationScreen({ area }: { area: DashboardArea }) {
  const placement: Placement = area.id === "main-nav" ? "main" : "footer";
  const api = useDashboardApi();
  const client = useQueryClient();
  const { text, language } = useDashboardLanguage();
  const session = useSession();
  const owner = session.data?.role === "owner";
  const list = useQuery({
    queryKey: listKey(placement),
    queryFn: () => api.fetchFooterNavigations(placement),
  });
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const { notifyError } = useNotify();
  const reorder = useMutation({
    mutationFn: (positions: { id: string; sortOrder: number }[]) =>
      api.reorderFooterNavigations(positions, placement),
    onSuccess: () => refresh(client, placement),
    onError: (error) => notifyError(error),
  });
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
        <Card.Body>
          {list.isError && <ErrorNotice error={list.error} />}
          {list.isPending && <p>{text("loading")}</p>}
          {list.isSuccess && list.data.length === 0 && (
            <p className="unfinished">{text("navigationEmpty")}</p>
          )}
          {!owner && <p>{text("ownerOnly")}</p>}
          <div className="nav-manager">
            {list.data?.map((group, index, groups) => {
              const name = group.title[language];
              const changeOrder = (to: number) =>
                reorder.mutate(
                  moveItem(groups, index, to).map((item, sortOrder) => ({ id: item.id, sortOrder })),
                );
              return (
                <div key={group.id} className="nav-manager__group">
                  <Row.Bare>
                    <Row.Text title={name} />
                    <Row.Meta>{group.items.length}</Row.Meta>
                    <Row.Actions>
                      <Button.Icon
                        label={text("navigationUp", name)}
                        icon={<ArrowUpIcon />}
                        disabled={!owner || index === 0 || reorder.isPending}
                        onClick={() => changeOrder(index - 1)}
                      />
                      <Button.Icon
                        label={text("navigationDown", name)}
                        icon={<ArrowDownIcon />}
                        disabled={!owner || index === groups.length - 1 || reorder.isPending}
                        onClick={() => changeOrder(index + 1)}
                      />
                      <Button.Icon
                        label={text("navigationEdit", name)}
                        icon={<PencilSimpleIcon />}
                        disabled={!owner}
                        onClick={() => setDialog({ editing: group })}
                      />
                      <Button.Icon
                        label={text("navigationDelete", name)}
                        icon={<TrashIcon />}
                        disabled={!owner}
                        onClick={() => setDialog({ deleting: group })}
                      />
                    </Row.Actions>
                  </Row.Bare>
                  <ul className="nav-manager__items" aria-label={name}>
                    {group.items.map((item) => (
                      <li key={item.id} className="chip">
                        {item.label[language]}
                        {!item.entryId && !item.topicId && !item.href && (
                          <span className="badge" data-status="draft">
                            {text("navigationBroken")}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </Card.Body>
      </Card>
      {dialog && "editing" in dialog && (
        <NavigationEditor
          placement={placement}
          group={dialog.editing}
          sortOrder={Math.max(-1, ...(list.data?.map((group) => group.sortOrder) ?? [])) + 1}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog && "deleting" in dialog && (
        <NavigationDelete placement={placement} group={dialog.deleting} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

type DraftItem = SaveFooterNavigationBody["items"][number] & { key: string };
function NavigationEditor({
  placement,
  group,
  sortOrder,
  onClose,
}: {
  placement: Placement;
  group: FooterNavigation | null;
  sortOrder: number;
  onClose: () => void;
}) {
  const api = useDashboardApi();
  const client = useQueryClient();
  const { text, language } = useDashboardLanguage();
  const { notify, notifyError } = useNotify();
  const [title, setTitle] = useState(group?.title ?? { en: "", de: "" });
  const [items, setItems] = useState<DraftItem[]>(
    () => group?.items.map((item) => ({ ...item, key: item.id })) ?? [],
  );
  const [invalid, setInvalid] = useState(false);
  const save = useMutation({
    mutationFn: (value: SaveFooterNavigationBody) =>
      group
        ? api.saveFooterNavigation(group.id, value, placement)
        : api.createFooterNavigation(value, placement),
    onSuccess: () => {
      refresh(client, placement);
      notify({ tone: "success", message: text("saved") });
      onClose();
    },
    onError: (error) => notifyError(error),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = saveFooterNavigationBody.safeParse({
      title,
      sortOrder: group?.sortOrder ?? sortOrder,
      items: items.map(({ key: _key, ...item }) => item),
    });
    setInvalid(!parsed.success);
    if (parsed.success) save.mutate(parsed.data);
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
            <Reorder.List
              count={items.length}
              onMove={(from, to) => setItems((current) => moveItem(current, from, to))}
            >
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
                    onRemove={() =>
                      setItems((current) =>
                        current
                          .filter((candidate) => candidate.key !== item.key)
                          .map((candidate) =>
                            candidate.parentId === item.id ? { ...candidate, parentId: null } : candidate,
                          ),
                      )
                    }
                  />
                </Reorder.Item>
              ))}
            </Reorder.List>
            <Button
              icon={<PlusIcon />}
              disabled={items.length >= 100}
              onClick={() =>
                setItems((current) => [
                  ...current,
                  {
                    key: crypto.randomUUID(),
                    id: crypto.randomUUID(),
                    label: { en: "", de: "" },
                    visible: { en: true, de: true },
                    href: null,
                    entryId: null,
                    topicId: null,
                    parentId: null,
                  },
                ])
              }
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
        <Button.Icon label={text("navigationLinkRemove", name)} icon={<TrashIcon />} onClick={onRemove} />
      </div>
    </div>
  );
}

function NavigationDelete({
  placement,
  group,
  onClose,
}: {
  placement: Placement;
  group: FooterNavigation;
  onClose: () => void;
}) {
  const api = useDashboardApi();
  const client = useQueryClient();
  const { text, language } = useDashboardLanguage();
  const remove = useMutation({
    mutationFn: () => api.deleteFooterNavigation(group.id, placement),
    onSuccess: () => {
      refresh(client, placement);
      onClose();
    },
  });
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
