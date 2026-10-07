import {
  HOME_BLOCKS,
  type HomeBlockSettings,
  type HomeBlockType,
  homeBlockSettingsSchema,
  homeBlockTypes,
  type StoredHomeBlock,
} from "@layered/schemas";
import { Button, Card, Editor, Row, Switch } from "@layered/ui";
import {
  CardsIcon,
  CropIcon,
  FloppyDiskIcon,
  type IconProps,
  LockSimpleIcon,
  PlusIcon,
  SquaresFourIcon,
  StarIcon,
  TagIcon,
  TrashIcon,
} from "@layered/ui/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ComponentType, useState } from "react";
import { ScreenTitle } from "./app-bar-slots.js";
import { useDashboardApi } from "./dashboard-context.js";
import { refreshCounts } from "./dashboard-counts.js";
import { ErrorNotice } from "./error-notice.js";
import { blockSummary, blockTypeKey, settingKey } from "./home-block-labels.js";
import { HomeBlockSettingsFields } from "./home-block-settings.js";
import { useDashboardLanguage } from "./language-context.js";
import { ConfirmDialog } from "./modal.js";
import { useNotify } from "./notifications.js";
import { Reorder } from "./reorder.js";
import type { DashboardArea } from "./routes.js";
import { useSaveShortcut } from "./save-shortcut.js";
import { useSession } from "./session-queries.js";
import { moveItem } from "./sidebar-order.js";
import { Translated } from "./translated.js";
import "./footer-navigation.css";
import "./home-blocks.css";

/**
 * The home page, assembled from blocks: the list of them beside the settings of
 * the one that is open.
 *
 * Arranging and adjusting are one task here, because a block is moved to see
 * where it belongs and then set up for that place, so the list and the panel
 * stand side by side in the same `Editor` the writing screen uses. Every
 * account sees the arrangement; only the owner changes it.
 */

/** The query the list and the panel share, so a save in one shows in the other. */
const BLOCKS_KEY = ["home-blocks"] as const;

/** The mark of each kind of block, as the prototype draws it. */
const BLOCK_ICONS: Record<HomeBlockType, ComponentType<IconProps>> = {
  hero: CropIcon,
  featured_entry: StarIcon,
  project_grid: SquaresFourIcon,
  post_grid: CardsIcon,
  topic_bar: TagIcon,
};

/** The types a block can be added as. A locked block exists once and is already there. */
const ADDABLE = homeBlockTypes.filter((type) => !HOME_BLOCKS[type].locked);

/**
 * Where a block dragged to `to` may actually go: never above a locked block,
 * which opens the page.
 *
 * @param blocks - The list in its current order.
 * @param to - Where the block was dropped.
 */
function allowedTarget(blocks: readonly StoredHomeBlock[], to: number): number {
  const firstMovable = blocks.findIndex((block) => !HOME_BLOCKS[block.type].locked);
  return Math.max(to, firstMovable === -1 ? 0 : firstMovable);
}

/** The blocks screen. */
export function HomeBlocksScreen({ area }: { area: DashboardArea }) {
  const api = useDashboardApi();
  const client = useQueryClient();
  const { text, language } = useDashboardLanguage();
  const { notifyError } = useNotify();
  const owner = useSession().data?.role === "owner";
  const blocks = useQuery({ queryKey: BLOCKS_KEY, queryFn: api.fetchHomeBlocks });
  const [openId, setOpenId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<StoredHomeBlock | null>(null);
  const list = blocks.data ?? [];
  const open = list.find((block) => block.id === openId) ?? list[0];

  const refresh = () => {
    void client.invalidateQueries({ queryKey: BLOCKS_KEY });
    void refreshCounts(client);
  };
  const toggle = useMutation({
    mutationFn: (block: StoredHomeBlock) =>
      api.saveHomeBlock(block.id, { enabled: !block.enabled, settings: block.settings }),
    onSuccess: refresh,
    onError: (error) => notifyError(error),
  });
  const reorder = useMutation({
    mutationFn: api.reorderHomeBlocks,
    onSuccess: (ordered) => client.setQueryData(BLOCKS_KEY, ordered),
    onError: (error) => notifyError(error),
  });
  const add = useMutation({
    mutationFn: (type: HomeBlockType) => api.addHomeBlock({ type }),
    onSuccess: (added) => {
      setOpenId(added.id);
      refresh();
    },
    onError: (error) => notifyError(error),
  });

  return (
    <>
      <ScreenTitle title={text(area.labelKey)} />
      <Editor>
        <Editor.Main>
          <Card>
            <Card.Header title={text("homeBlocksTitle")} meta={list.length} />
            <Card.Body>
              {blocks.isError && <ErrorNotice error={blocks.error} />}
              {blocks.isPending && <p>{text("loading")}</p>}
              <Reorder.List
                count={list.length}
                onMove={(from, to) => {
                  const target = allowedTarget(list, to);
                  if (from !== target)
                    reorder.mutate(
                      moveItem(list, from, target).map((block, sortOrder) => ({ id: block.id, sortOrder })),
                    );
                }}
              >
                {list.map((block, index) => {
                  const name = text(blockTypeKey(block.type));
                  const locked = HOME_BLOCKS[block.type].locked;
                  const Icon = BLOCK_ICONS[block.type];
                  return (
                    <Reorder.Item index={index} key={block.id}>
                      <Row data-active={block.id === open?.id || undefined}>
                        <Reorder.Handle
                          index={index}
                          label={text("moveGroup", name)}
                          disabled={!owner || locked || reorder.isPending}
                        />
                        <Row.Tile>
                          <Icon aria-hidden="true" />
                        </Row.Tile>
                        <button
                          type="button"
                          className="home-block__select"
                          aria-pressed={block.id === open?.id}
                          onClick={() => setOpenId(block.id)}
                        >
                          <Row.Text title={name} note={blockSummary(text, block, language)} />
                        </button>
                        <Row.Actions>
                          {locked ? (
                            <span className="chip">
                              <LockSimpleIcon aria-hidden="true" />
                              {text("homeBlockLocked")}
                            </span>
                          ) : (
                            <Button.Icon
                              label={text("homeBlockRemove", name)}
                              icon={<TrashIcon />}
                              disabled={!owner}
                              onClick={() => setRemoving(block)}
                            />
                          )}
                          <Switch
                            aria-label={text("homeBlockEnabled", name)}
                            checked={block.enabled}
                            disabled={!owner || toggle.isPending}
                            onCheckedChange={() => toggle.mutate(block)}
                          />
                        </Row.Actions>
                      </Row>
                    </Reorder.Item>
                  );
                })}
              </Reorder.List>
            </Card.Body>
            <Card.Footer
              note={text("homeBlockPickHint")}
              actions={
                <div className="home-block__add">
                  {ADDABLE.map((type) => (
                    <Button
                      key={type}
                      icon={<PlusIcon />}
                      aria-label={text("homeBlockAdd", text(blockTypeKey(type)))}
                      disabled={!owner || add.isPending}
                      onClick={() => add.mutate(type)}
                    >
                      {text(blockTypeKey(type))}
                    </Button>
                  ))}
                </div>
              }
            />
          </Card>
        </Editor.Main>
        {open && (
          <BlockPanel key={`${open.id}:${JSON.stringify(open.settings)}`} block={open} editable={owner} />
        )}
      </Editor>
      {removing && (
        <RemoveBlock
          block={removing}
          onClose={(removed) => {
            if (removed && removing.id === open?.id) setOpenId(null);
            setRemoving(null);
          }}
        />
      )}
    </>
  );
}

/**
 * The settings of the open block, with a save that stores them.
 *
 * The draft is checked against the block's declaration before anything is
 * sent, and the setting that fails is named. The API checks it again.
 */
function BlockPanel({ block, editable }: { block: StoredHomeBlock; editable: boolean }) {
  const api = useDashboardApi();
  const client = useQueryClient();
  const { text } = useDashboardLanguage();
  const { notify, notifyError } = useNotify();
  const [draft, setDraft] = useState<HomeBlockSettings>(block.settings);
  const [problem, setProblem] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(block.settings);
  const save = useMutation({
    mutationFn: (settings: HomeBlockSettings) =>
      api.saveHomeBlock(block.id, { enabled: block.enabled, settings }),
    onSuccess: (saved) => {
      client.setQueryData<StoredHomeBlock[]>(BLOCKS_KEY, (current) =>
        current?.map((item) => (item.id === saved.id ? saved : item)),
      );
      notify({ tone: "success", message: text("saved") });
    },
    onError: (error) => notifyError(error),
  });
  const canSave = editable && dirty && !save.isPending;

  const submit = () => {
    if (!canSave) return;
    const parsed = homeBlockSettingsSchema(block.type).safeParse(draft);
    if (!parsed.success) {
      const key = String(parsed.error.issues[0]?.path[0] ?? "");
      setProblem(text("homeBlockInvalid", text(settingKey(key))));
      return;
    }
    save.mutate(parsed.data);
  };

  useSaveShortcut(submit);

  // No form element around the fields: each field has to be a direct child of
  // the panel's stack, where `editor.css` gives it the band across the card.
  return (
    <Translated>
      <Editor.Panel
        eyebrow={text("landing")}
        title={text(blockTypeKey(block.type))}
        headerActions={<Translated.Switch />}
        note={editable ? undefined : text("ownerOnly")}
        actions={
          <Button tone="primary" disabled={!canSave} icon={<FloppyDiskIcon />} onClick={submit}>
            {save.isPending ? text("savePending") : text("save")}
          </Button>
        }
      >
        <HomeBlockSettingsFields
          type={block.type}
          draft={draft}
          editable={editable}
          pictureUrls={block.pictureUrls}
          onChange={(key, value) => {
            setDraft((current) => ({ ...current, [key]: value }));
            setProblem(null);
          }}
        />
        {problem && (
          <p role="alert" className="dashboard-error">
            {problem}
          </p>
        )}
      </Editor.Panel>
    </Translated>
  );
}

/** Asks before a block and its settings are deleted, and says that switching it off keeps both. */
function RemoveBlock({ block, onClose }: { block: StoredHomeBlock; onClose: (removed: boolean) => void }) {
  const api = useDashboardApi();
  const client = useQueryClient();
  const { text } = useDashboardLanguage();
  const remove = useMutation({
    mutationFn: () => api.deleteHomeBlock(block.id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: BLOCKS_KEY });
      void refreshCounts(client);
      onClose(true);
    },
  });
  return (
    <ConfirmDialog
      title={text("homeBlockRemove", text(blockTypeKey(block.type)))}
      busy={remove.isPending}
      error={remove.error}
      onConfirm={() => remove.mutate()}
      onClose={() => onClose(false)}
    >
      <p>{text("homeBlockRemoveBody")}</p>
    </ConfirmDialog>
  );
}
