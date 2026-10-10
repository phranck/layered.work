import { eq } from "drizzle-orm";
import type { PgColumn, PgTable, PgUpdateSetSource } from "drizzle-orm/pg-core";
import type { database } from "./connect.js";
import { auditLog } from "./schema/index.js";

type Transaction = Parameters<Parameters<ReturnType<typeof database>["transaction"]>[0]>[0];

/** Where one row of an ordered list goes. */
export interface Position {
  id: string;
  sortOrder: number;
}

/**
 * Writes a list's new order and records every move in the audit log.
 *
 * The home blocks, the navigations and the social accounts are ordered the same
 * way, so they are written the same way here. Which rows may move differs per
 * list, so the caller locks and checks them first, in the same transaction.
 *
 * @param tx - The transaction that locked the rows.
 * @param table - The list's table, with an `id` and a `sort_order` column.
 * @param positions - Where each named row goes.
 * @param audit - Who moved them, and the action and subject the log records.
 */
export async function writePositions<Table extends PgTable & { id: PgColumn; sortOrder: PgColumn }>(
  tx: Transaction,
  table: Table,
  positions: readonly Position[],
  audit: { actorUserId: string; action: string; subjectType: string },
): Promise<void> {
  for (const position of positions) {
    await tx
      .update(table)
      .set({ sortOrder: position.sortOrder } as PgUpdateSetSource<Table>)
      .where(eq(table.id, position.id));
    await tx.insert(auditLog).values({
      actorUserId: audit.actorUserId,
      action: audit.action,
      subjectType: audit.subjectType,
      subjectId: position.id,
      detail: { sortOrder: position.sortOrder },
    });
  }
}
