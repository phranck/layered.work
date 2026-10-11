import {
  HOME_BLOCKS,
  type HomeBlockSettings,
  type HomeBlockType,
  type StoredHomeBlock,
} from "@layered/schemas";
import { Card, Editor, Switch } from "@layered/ui";
import {
  CardsIcon,
  CropIcon,
  type IconProps,
  LockSimpleIcon,
  SquaresFourIcon,
  StarIcon,
  TagIcon,
} from "@layered/ui/icons";
import { type ComponentType, useState } from "react";
import { ActionButton } from "./action-button.js";
import { ScreenTitle } from "./app-bar-slots.js";
import { ErrorNotice } from "./error-notice.js";
import { blockSummary, blockTypeKey, settingKey } from "./home-block-labels.js";
import { HomeBlockSettingsFields } from "./home-block-settings.js";
import {
  ADDABLE_BLOCKS,
  allowedTarget,
  checkedBlockSettings,
  useAddHomeBlock,
  useDeleteHomeBlock,
  useHomeBlocks,
  useReorderHomeBlocks,
  useSaveHomeBlock,
  useToggleHomeBlock,
} from "./home-blocks-query.js";
import { useDashboardLanguage } from "./language-context.js";
import { reorderedPositions } from "./list-order.js";
import { ConfirmDialog } from "./modal.js";
import { useNotify } from "./notifications.js";
import { QueryStates } from "./query-states.js";
import type { DashboardArea } from "./routes.js";
import { useSaveShortcut } from "./save-shortcut.js";
import { useSession } from "./session-queries.js";
import { sameValue, useStoredRevision } from "./stored-draft.js";
import { Table } from "./table.js";
import { Translated } from "./translated.js";
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

/** The mark of each kind of block, as the prototype draws it. */
const BLOCK_ICONS: Record<HomeBlockType, ComponentType<IconProps>> = {
  hero: CropIcon,
  featured_entry: StarIcon,
  project_grid: SquaresFourIcon,
  post_grid: CardsIcon,
  topic_bar: TagIcon,
};

/** The blocks screen. */
export function HomeBlocksScreen({ area }: { area: DashboardArea }) {
  const { text, language } = useDashboardLanguage();
  const { notifyError } = useNotify();
  const owner = useSession().data?.role === "owner";
  const blocks = useHomeBlocks();
  const [openId, setOpenId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<StoredHomeBlock | null>(null);
  const list = blocks.data ?? [];
  const open = list.find((block) => block.id === openId) ?? list[0];
  // The panel starts again from the open block's settings whenever what is
  // stored changes, and keeps its draft while the blocks are only reordered.
  const revision = useStoredRevision(open?.settings);

  const toggle = useToggleHomeBlock({ onError: notifyError });
  const reorder = useReorderHomeBlocks({ onError: notifyError });
  const add = useAddHomeBlock({ onError: notifyError, onSuccess: (added) => setOpenId(added.id) });

  return (
    <>
      <ScreenTitle title={text(area.labelKey)} />
      <Editor>
        <Editor.Main>
          <Card>
            <Card.Header title={text("homeBlocksTitle")} meta={list.length} />
            <QueryStates query={blocks}>
              {() => (
                <Table
                  columns={[
                    { kind: "grip", label: "" },
                    { kind: "title", label: text("columnName") },
                    { kind: "text", label: text("columnContent") },
                    { kind: "switch", label: text("navigationVisible") },
                    { kind: "action", label: text("columnAction") },
                  ]}
                  onMove={(from, to) => {
                    const target = allowedTarget(list, to);
                    if (from !== target) reorder.mutate(reorderedPositions(list, from, target));
                  }}
                >
                  {list.map((block, index) => {
                    const name = text(blockTypeKey(block.type));
                    const locked = HOME_BLOCKS[block.type].locked;
                    const Icon = BLOCK_ICONS[block.type];
                    return (
                      <Table.Row
                        key={block.id}
                        index={index}
                        active={block.id === open?.id}
                        onOpen={() => setOpenId(block.id)}
                      >
                        <Table.Grip
                          index={index}
                          label={text("moveGroup", name)}
                          disabled={!owner || locked || reorder.isPending}
                        />
                        <Table.Cell kind="title">
                          <Table.Title title={name} tile={<Icon aria-hidden="true" />} />
                        </Table.Cell>
                        <Table.Cell>{blockSummary(text, block, language)}</Table.Cell>
                        <Table.Control kind="switch">
                          <Switch
                            aria-label={text("homeBlockEnabled", name)}
                            checked={block.enabled}
                            disabled={!owner || toggle.isPending}
                            onCheckedChange={() => toggle.mutate(block)}
                          />
                        </Table.Control>
                        <Table.Actions>
                          {locked ? (
                            <Table.Mark label={text("homeBlockLocked")}>
                              <LockSimpleIcon />
                            </Table.Mark>
                          ) : (
                            <ActionButton.Icon
                              action="remove"
                              label={text("homeBlockRemove", name)}
                              disabled={!owner}
                              onClick={() => setRemoving(block)}
                            />
                          )}
                        </Table.Actions>
                      </Table.Row>
                    );
                  })}
                </Table>
              )}
            </QueryStates>
            <Card.Footer
              note={text("homeBlockPickHint")}
              actions={
                <div className="home-block__add">
                  {ADDABLE_BLOCKS.map((type) => {
                    const Icon = BLOCK_ICONS[type];
                    return (
                      <button
                        key={type}
                        type="button"
                        className="chip"
                        aria-label={text("homeBlockAdd", text(blockTypeKey(type)))}
                        disabled={!owner || add.isPending}
                        onClick={() => add.mutate(type)}
                      >
                        <Icon aria-hidden="true" />
                        {text(blockTypeKey(type))}
                      </button>
                    );
                  })}
                </div>
              }
            />
          </Card>
        </Editor.Main>
        {open && <BlockPanel key={`${open.id}:${revision}`} block={open} editable={owner} />}
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
  const { text } = useDashboardLanguage();
  const { notify, notifyError } = useNotify();
  const [draft, setDraft] = useState<HomeBlockSettings>(block.settings);
  const [problem, setProblem] = useState<string | null>(null);
  const dirty = !sameValue(draft, block.settings);
  const save = useSaveHomeBlock(block, {
    onError: notifyError,
    onSuccess: () => notify({ tone: "success", message: text("saved") }),
  });
  const canSave = editable && dirty && !save.isPending;

  const submit = () => {
    if (!canSave) return;
    const checked = checkedBlockSettings(block.type, draft);
    if ("invalidKey" in checked) {
      setProblem(text("homeBlockInvalid", text(settingKey(checked.invalidKey))));
      return;
    }
    save.mutate(checked.value);
  };

  useSaveShortcut(submit);

  return (
    <Translated>
      <Editor.Panel
        eyebrow={text("landing")}
        title={text(blockTypeKey(block.type))}
        headerActions={<Translated.Switch />}
        note={editable ? undefined : text("ownerOnly")}
        actions={
          <ActionButton action="save" tone="primary" disabled={!canSave} onClick={submit}>
            {save.isPending ? text("savePending") : text("save")}
          </ActionButton>
        }
      >
        <HomeBlockSettingsFields
          type={block.type}
          draft={draft}
          editable={editable}
          onChange={(key, value) => {
            setDraft((current) => ({ ...current, [key]: value }));
            setProblem(null);
          }}
        />
        {problem && <ErrorNotice message={problem} />}
      </Editor.Panel>
    </Translated>
  );
}

/** Asks before a block and its settings are deleted, and says that switching it off keeps both. */
function RemoveBlock({ block, onClose }: { block: StoredHomeBlock; onClose: (removed: boolean) => void }) {
  const { text } = useDashboardLanguage();
  const remove = useDeleteHomeBlock(block, { onSuccess: () => onClose(true) });
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
