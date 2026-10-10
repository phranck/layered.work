import {
  type AddHomeBlockBody,
  ErrorCode,
  HOME_BLOCKS,
  type HomeBlockType,
  homeBlockSettings,
  homeBlockSettingsSchema,
  homeBlockTypes,
  type SaveHomeBlockBody,
  type StoredHomeBlock,
} from "@layered/schemas";
import { asc, eq, sql } from "drizzle-orm";
import { mediaContentUrl } from "../account/repository.js";
import type { Database, Transaction } from "../db/connect.js";
import { type Position, writePositions } from "../db/positions.js";
import { auditLog, homeBlocks } from "../db/schema/index.js";
import { HttpError } from "../http/response.js";
import { holdLibraryPicture } from "../media/pictures.js";

/**
 * The blocks the home page is assembled from, as the dashboard edits them.
 *
 * What a block can be set to is its type's declaration in `@layered/schemas`,
 * which this module reads and never restates. The one rule of its own here is
 * the locked block: the hero opens the page, so it stays first, exists once and
 * cannot be removed.
 */

type Row = typeof homeBlocks.$inferSelect;

/** Every setting key, across all types, that names a picture in the library. */
export const HOME_PICTURE_KEYS: readonly string[] = [
  ...new Set(
    homeBlockTypes.flatMap((type) =>
      HOME_BLOCKS[type].settings
        .filter((setting) => setting.kind === "picture")
        .map((setting) => setting.key),
    ),
  ),
];

/** One row as the dashboard reads it, every declared setting present. */
function stored(row: Row): StoredHomeBlock {
  const settings = homeBlockSettings(row.type, row.settings);
  const pictureUrls = Object.fromEntries(
    HOME_PICTURE_KEYS.flatMap((key) =>
      typeof settings[key] === "string" ? [[key, mediaContentUrl(settings[key])]] : [],
    ),
  );
  return {
    id: row.id,
    type: row.type,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    settings,
    pictureUrls,
  };
}

/** The ids of the library pictures a block's settings name. */
export function pictureIdsOf(type: HomeBlockType, settings: unknown): string[] {
  const values = homeBlockSettings(type, settings);
  return HOME_BLOCKS[type].settings
    .filter((setting) => setting.kind === "picture")
    .map((setting) => values[setting.key])
    .filter((value): value is string => typeof value === "string");
}

/**
 * Writes the declared set of blocks into an empty table, once.
 *
 * The site shows every type on its defaults while nothing is stored, so the
 * first time the dashboard asks, the same arrangement becomes rows it can edit,
 * and the page does not change. The table is locked against a second writer
 * before it is checked again, so two first visits write one set.
 */
async function arrangeOnce(db: Database): Promise<void> {
  const [existing] = await db.select({ id: homeBlocks.id }).from(homeBlocks).limit(1);
  if (existing) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`lock table ${homeBlocks} in share row exclusive mode`);
    const [written] = await tx.select({ id: homeBlocks.id }).from(homeBlocks).limit(1);
    if (written) return;
    await tx.insert(homeBlocks).values(homeBlockTypes.map((type, sortOrder) => ({ type, sortOrder })));
  });
}

/**
 * Every block, in the order of the page.
 *
 * @param db - The database.
 */
export async function listHomeBlocks(db: Database): Promise<StoredHomeBlock[]> {
  await arrangeOnce(db);
  const rows = await db
    .select()
    .from(homeBlocks)
    .orderBy(asc(homeBlocks.sortOrder), asc(homeBlocks.createdAt));
  return rows.map(stored);
}

/** The row, locked for the rest of the transaction, or a refusal naming the block as gone. */
async function lockedRow(tx: Transaction, id: string): Promise<Row> {
  const [row] = await tx.select().from(homeBlocks).where(eq(homeBlocks.id, id)).for("update");
  if (!row) throw new HttpError(ErrorCode.NotFound, "That block is no longer on the home page.");
  return row;
}

/**
 * A new block of one type at the end of the page, on its defaults.
 *
 * @param db - The database.
 * @param value - The type.
 * @param actorUserId - Who added it.
 * @throws When the type is locked, because a locked block exists once.
 */
export async function addHomeBlock(
  db: Database,
  value: AddHomeBlockBody,
  actorUserId: string,
): Promise<StoredHomeBlock> {
  if (HOME_BLOCKS[value.type].locked)
    throw new HttpError(ErrorCode.Conflict, "This block opens the page and exists once.");
  await arrangeOnce(db);
  const row = await db.transaction(async (tx) => {
    const [last] = await tx
      .select({ sortOrder: sql<number>`coalesce(max(${homeBlocks.sortOrder}), -1)` })
      .from(homeBlocks);
    const [created] = await tx
      .insert(homeBlocks)
      .values({ type: value.type, sortOrder: (last?.sortOrder ?? -1) + 1 })
      .returning();
    if (!created) throw new HttpError(ErrorCode.Internal, "The block could not be added.");
    await tx.insert(auditLog).values({
      actorUserId,
      action: "home_block.created",
      subjectType: "home_blocks",
      subjectId: created.id,
      detail: { type: value.type },
    });
    return created;
  });
  return stored(row);
}

/**
 * Stores whether a block is on the page and what it is set to.
 *
 * The settings are checked against the stored block's own declaration, so a
 * save cannot set what its type does not declare, and the first setting that
 * fails is named in the refusal. Every picture they name is held until the save
 * commits.
 *
 * @param db - The database.
 * @param id - The block.
 * @param value - Whether it is enabled, and its settings.
 * @param actorUserId - Who saved it.
 */
export async function saveHomeBlock(
  db: Database,
  id: string,
  value: SaveHomeBlockBody,
  actorUserId: string,
): Promise<StoredHomeBlock> {
  const row = await db.transaction(async (tx) => {
    const current = await lockedRow(tx, id);
    const parsed = homeBlockSettingsSchema(current.type).safeParse(value.settings);
    if (!parsed.success) {
      const [issue] = parsed.error.issues;
      const key = String(issue?.path[0] ?? "settings");
      throw new HttpError(
        ErrorCode.InvalidRequest,
        `The setting ${key} is not valid for this block: ${issue?.message ?? "it does not match its declaration"}.`,
      );
    }
    for (const pictureId of pictureIdsOf(current.type, parsed.data))
      await holdLibraryPicture(tx, pictureId, "Choose an existing raster image for this block.");

    const before = homeBlockSettings(current.type, current.settings);
    const changedKeys = Object.keys(parsed.data).filter(
      (key) => JSON.stringify(before[key]) !== JSON.stringify(parsed.data[key]),
    );
    const [saved] = await tx
      .update(homeBlocks)
      .set({ enabled: value.enabled, settings: parsed.data })
      .where(eq(homeBlocks.id, id))
      .returning();
    if (!saved) throw new HttpError(ErrorCode.NotFound, "That block is no longer on the home page.");
    if (changedKeys.length > 0 || current.enabled !== value.enabled)
      await tx.insert(auditLog).values({
        actorUserId,
        action: "home_block.updated",
        subjectType: "home_blocks",
        subjectId: id,
        detail: { type: current.type, enabled: value.enabled, changedKeys },
      });
    return saved;
  });
  return stored(row);
}

/**
 * Puts the blocks in a new order.
 *
 * @param db - The database.
 * @param positions - Where each named block goes. Blocks not named keep theirs.
 * @param actorUserId - Who moved them.
 * @throws When a block is gone, or when a locked block would no longer be first.
 */
export async function reorderHomeBlocks(
  db: Database,
  positions: readonly Position[],
  actorUserId: string,
): Promise<StoredHomeBlock[]> {
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(homeBlocks).orderBy(asc(homeBlocks.id)).for("update");
    const byId = new Map(rows.map((row) => [row.id, row]));
    if (positions.some((position) => !byId.has(position.id)))
      throw new HttpError(ErrorCode.NotFound, "A block is no longer on the home page.");

    const order = new Map(rows.map((row) => [row.id, row.sortOrder]));
    for (const position of positions) order.set(position.id, position.sortOrder);
    for (const row of rows.filter((candidate) => HOME_BLOCKS[candidate.type].locked)) {
      const own = order.get(row.id) ?? 0;
      if (rows.some((other) => other.id !== row.id && (order.get(other.id) ?? 0) <= own))
        throw new HttpError(ErrorCode.Conflict, "The block that opens the page cannot be moved.");
    }

    await writePositions(tx, homeBlocks, positions, {
      actorUserId,
      action: "home_block.reordered",
      subjectType: "home_blocks",
    });
  });
  return listHomeBlocks(db);
}

/**
 * Takes a block off the page for good. Switching it off keeps it instead.
 *
 * @param db - The database.
 * @param id - The block.
 * @param actorUserId - Who removed it.
 * @throws When the block is locked.
 */
export async function deleteHomeBlock(db: Database, id: string, actorUserId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockedRow(tx, id);
    if (HOME_BLOCKS[row.type].locked)
      throw new HttpError(ErrorCode.Conflict, "The block that opens the page cannot be removed.");
    await tx.delete(homeBlocks).where(eq(homeBlocks.id, id));
    await tx.insert(auditLog).values({
      actorUserId,
      action: "home_block.deleted",
      subjectType: "home_blocks",
      subjectId: id,
      detail: { type: row.type },
    });
  });
}
