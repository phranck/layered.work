import {
  CONTENT_LANGUAGES,
  type FooterNavigation,
  MaxLength,
  type SaveFooterNavigationBody,
  saveFooterNavigationBody,
} from "@layered/schemas";
import { Button, Card, Field, Input, Row } from "@layered/ui";
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
import { LANGUAGE_TEXT } from "./entry-list.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { CardDialog } from "./modal.js";
import { useNotify } from "./notifications.js";
import type { DashboardArea } from "./routes.js";
import { useSession } from "./session-queries.js";
import { moveItem } from "./sidebar-order.js";
import "./footer-navigation.css";

const listKey = ["footer-navigation"] as const;
function refresh(client: QueryClient) {
  void client.invalidateQueries({ queryKey: listKey });
  void client.invalidateQueries({ queryKey: ["dashboard-counts"] });
}
type OpenDialog = { editing: FooterNavigation | null } | { deleting: FooterNavigation } | null;

export function FooterNavigationScreen({ area }: { area: DashboardArea }) {
  const api = useDashboardApi();
  const client = useQueryClient();
  const { text, language } = useDashboardLanguage();
  const session = useSession();
  const owner = session.data?.role === "owner";
  const list = useQuery({ queryKey: listKey, queryFn: api.fetchFooterNavigations });
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const { notifyError } = useNotify();
  const reorder = useMutation({
    mutationFn: api.reorderFooterNavigations,
    onSuccess: () => refresh(client),
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
          group={dialog.editing}
          sortOrder={Math.max(-1, ...(list.data?.map((group) => group.sortOrder) ?? [])) + 1}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog && "deleting" in dialog && (
        <NavigationDelete group={dialog.deleting} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

type DraftItem = SaveFooterNavigationBody["items"][number] & { key: string };
function NavigationEditor({
  group,
  sortOrder,
  onClose,
}: {
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
      group ? api.saveFooterNavigation(group.id, value) : api.createFooterNavigation(value),
    onSuccess: () => {
      refresh(client);
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
    <CardDialog labelId="navigation-edit-title" onClose={onClose}>
      <Card.Header
        id="navigation-edit-title"
        title={group ? text("navigationEdit", group.title[language]) : text("navigationNew")}
      />
      <Card.Body>
        <form id="navigation-edit" className="settings-form" onSubmit={submit} noValidate>
          <div className="settings-form__pair">
            {CONTENT_LANGUAGES.map((code) => (
              <Field
                key={code}
                label={text("navigationTitle", text(LANGUAGE_TEXT[code]))}
                htmlFor={`navigation-title-${code}`}
              >
                <Input
                  id={`navigation-title-${code}`}
                  lang={code}
                  value={title[code]}
                  maxLength={MaxLength.Line}
                  onChange={(event) => setTitle((current) => ({ ...current, [code]: event.target.value }))}
                />
              </Field>
            ))}
          </div>
          {items.map((item, index) => (
            <NavigationItemFields
              key={item.key}
              item={item}
              index={index}
              length={items.length}
              onChange={(change) => updateItem(item.key, change)}
              onMove={(to) => setItems((current) => moveItem(current, index, to))}
              onRemove={() =>
                setItems((current) => current.filter((candidate) => candidate.key !== item.key))
              }
            />
          ))}
          <Button
            icon={<PlusIcon />}
            disabled={items.length >= 100}
            onClick={() =>
              setItems((current) => [
                ...current,
                {
                  key: crypto.randomUUID(),
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
  );
}

function NavigationItemFields({
  item,
  index,
  length,
  onChange,
  onMove,
  onRemove,
}: {
  item: DraftItem;
  index: number;
  length: number;
  onChange: (change: Partial<DraftItem>) => void;
  onMove: (index: number) => void;
  onRemove: () => void;
}) {
  const { text, language } = useDashboardLanguage();
  const name = item.label[language] || String(index + 1);
  return (
    <div className="nav-manager__group settings-form">
      <div className="settings-form__pair">
        {CONTENT_LANGUAGES.map((code) => (
          <Field
            key={code}
            label={text("navigationLabel", text(LANGUAGE_TEXT[code]))}
            htmlFor={`navigation-${item.key}-${code}`}
          >
            <Input
              id={`navigation-${item.key}-${code}`}
              lang={code}
              value={item.label[code]}
              maxLength={MaxLength.Line}
              onChange={(event) => onChange({ label: { ...item.label, [code]: event.target.value } })}
            />
          </Field>
        ))}
      </div>
      <Field label={text("navigationAddress")} htmlFor={`navigation-${item.key}-href`}>
        <Input
          id={`navigation-${item.key}-href`}
          value={item.href ?? ""}
          disabled={Boolean(item.entryId || item.topicId)}
          maxLength={2048}
          onChange={(event) => onChange({ href: event.target.value || null })}
        />
      </Field>
      <div className="actions">
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

function NavigationDelete({ group, onClose }: { group: FooterNavigation; onClose: () => void }) {
  const api = useDashboardApi();
  const client = useQueryClient();
  const { text, language } = useDashboardLanguage();
  const { notifyError } = useNotify();
  const remove = useMutation({
    mutationFn: () => api.deleteFooterNavigation(group.id),
    onSuccess: () => {
      refresh(client);
      onClose();
    },
    onError: (error) => notifyError(error),
  });
  return (
    <CardDialog labelId="navigation-delete-title" onClose={onClose}>
      <Card.Header id="navigation-delete-title" title={text("navigationDelete", group.title[language])} />
      <Card.Body>
        <p>{text("navigationDeleteBody", group.items.length)}</p>
        {remove.isError && <ErrorNotice error={remove.error} />}
      </Card.Body>
      <Card.Footer
        actions={
          <>
            <Button icon={<XIcon />} onClick={onClose} autoFocus>
              {text("cancel")}
            </Button>
            <Button
              tone="danger"
              icon={<TrashIcon />}
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {text("navigationDelete", group.title[language])}
            </Button>
          </>
        }
      />
    </CardDialog>
  );
}
