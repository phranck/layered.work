import {
  CONTENT_LANGUAGES,
  ErrorCode,
  type FooterNavigation,
  type NavigationPlacement,
  type SaveFooterNavigationBody,
} from "@layered/schemas";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "../db/connect.js";
import { type Position, writePositions } from "../db/positions.js";
import {
  auditLog,
  entries,
  navigationItems,
  navigationItemTranslations,
  navigations,
  navigationTranslations,
  topics,
} from "../db/schema/index.js";
import { HttpError } from "../http/response.js";

/** Groups for one placement, their bilingual titles and links, in stored order. */
export async function listFooterNavigations(
  db: Database,
  placement: NavigationPlacement = "footer",
): Promise<FooterNavigation[]> {
  const groups = await db
    .select()
    .from(navigations)
    .where(eq(navigations.placement, placement))
    .orderBy(asc(navigations.sortOrder), asc(navigations.id));
  if (!groups.length) return [];
  const ids = groups.map((group) => group.id);
  const titles = await db
    .select()
    .from(navigationTranslations)
    .where(inArray(navigationTranslations.navigationId, ids));
  const items = await db
    .select()
    .from(navigationItems)
    .where(inArray(navigationItems.navigationId, ids))
    .orderBy(asc(navigationItems.sortOrder), asc(navigationItems.id));
  const labels = items.length
    ? await db
        .select()
        .from(navigationItemTranslations)
        .where(
          inArray(
            navigationItemTranslations.itemId,
            items.map((item) => item.id),
          ),
        )
    : [];
  return groups.map((group) => ({
    id: group.id,
    sortOrder: group.sortOrder,
    title: {
      en: titles.find((row) => row.navigationId === group.id && row.language === "en")?.title ?? "",
      de: titles.find((row) => row.navigationId === group.id && row.language === "de")?.title ?? "",
    },
    items: items
      .filter((item) => item.navigationId === group.id)
      .map((item) => {
        const en = labels.find((row) => row.itemId === item.id && row.language === "en");
        const de = labels.find((row) => row.itemId === item.id && row.language === "de");
        return {
          id: item.id,
          parentId: item.parentId,
          entryId: item.entryId,
          topicId: item.topicId,
          href: item.href,
          label: { en: en?.label ?? "", de: de?.label ?? "" },
          visible: { en: en?.visible ?? false, de: de?.visible ?? false },
        };
      }),
  }));
}

/** Stores one group atomically; existing ids must belong to it, new ids enable same-save nesting. */
export async function saveFooterNavigation(
  db: Database,
  id: string | null,
  value: SaveFooterNavigationBody,
  actorUserId: string,
  placement: NavigationPlacement = "footer",
): Promise<FooterNavigation> {
  const savedId = await db.transaction(async (tx) => {
    let navigationId = id;
    if (navigationId) {
      const [existing] = await tx
        .select({ id: navigations.id })
        .from(navigations)
        .where(and(eq(navigations.id, navigationId), eq(navigations.placement, placement)))
        .for("update");
      if (!existing) throw new HttpError(ErrorCode.NotFound, "That navigation does not exist.");
      await tx
        .update(navigations)
        .set({ sortOrder: value.sortOrder })
        .where(eq(navigations.id, navigationId));
    } else {
      const [created] = await tx
        .insert(navigations)
        .values({ placement, sortOrder: value.sortOrder })
        .returning({ id: navigations.id });
      if (!created) throw new Error("Navigation insert returned no id");
      navigationId = created.id;
    }
    const owned = await tx
      .select()
      .from(navigationItems)
      .where(eq(navigationItems.navigationId, navigationId));
    const ownedById = new Map(owned.map((item) => [item.id, item]));
    const wantedIds = value.items.flatMap((item) => (item.id ? [item.id] : []));
    const existingIds = wantedIds.length
      ? await tx
          .select({ id: navigationItems.id, navigationId: navigationItems.navigationId })
          .from(navigationItems)
          .where(inArray(navigationItems.id, wantedIds))
      : [];
    if (
      new Set(wantedIds).size !== wantedIds.length ||
      existingIds.some((item) => item.navigationId !== navigationId)
    )
      throw new HttpError(ErrorCode.InvalidRequest, "An item does not belong to this navigation.");
    for (const item of value.items) {
      if (
        item.parentId &&
        (!wantedIds.includes(item.parentId) ||
          item.parentId === item.id ||
          value.items.find((parent) => parent.id === item.parentId)?.parentId)
      )
        throw new HttpError(
          ErrorCode.InvalidRequest,
          "Navigation nesting is limited to one level within its own group.",
        );
      const previous = item.id ? ownedById.get(item.id) : undefined;
      if (
        !item.entryId &&
        !item.topicId &&
        !item.href &&
        (!previous || previous.entryId || previous.topicId || previous.href)
      )
        throw new HttpError(ErrorCode.InvalidRequest, "Choose a target for every new link.");
      for (const [target, table] of [
        [item.entryId, entries],
        [item.topicId, topics],
      ] as const) {
        if (target && !(await tx.select({ id: table.id }).from(table).where(eq(table.id, target))).length)
          throw new HttpError(ErrorCode.InvalidRequest, "The link target no longer exists.");
      }
    }
    const removed = owned.filter((item) => !wantedIds.includes(item.id)).map((item) => item.id);
    // Detach retained children before the parent deletion can cascade over them.
    for (const item of value.items) {
      if (
        item.id &&
        ownedById.get(item.id)?.parentId &&
        removed.includes(ownedById.get(item.id)?.parentId ?? "")
      )
        await tx.update(navigationItems).set({ parentId: null }).where(eq(navigationItems.id, item.id));
    }
    if (removed.length) await tx.delete(navigationItems).where(inArray(navigationItems.id, removed));
    for (const language of CONTENT_LANGUAGES) {
      await tx
        .insert(navigationTranslations)
        .values({ navigationId, language, title: value.title[language] })
        .onConflictDoUpdate({
          target: [navigationTranslations.navigationId, navigationTranslations.language],
          set: { title: value.title[language] },
        });
    }
    // Insert roots before children so client-generated parent ids satisfy the FK.
    const ordered = [...value.items.entries()].sort(
      (a, b) => Number(Boolean(a[1].parentId)) - Number(Boolean(b[1].parentId)),
    );
    for (const [sortOrder, item] of ordered) {
      const fields = {
        entryId: item.entryId,
        topicId: item.topicId,
        href: item.href,
        parentId: item.parentId,
        sortOrder,
      };
      let itemId = item.id;
      if (itemId && ownedById.has(itemId))
        await tx.update(navigationItems).set(fields).where(eq(navigationItems.id, itemId));
      else {
        const [created] = await tx
          .insert(navigationItems)
          .values({ ...fields, navigationId, ...(itemId ? { id: itemId } : {}) })
          .returning({ id: navigationItems.id });
        if (!created) throw new Error("Navigation item insert returned no id");
        itemId = created.id;
      }
      for (const language of CONTENT_LANGUAGES) {
        await tx
          .insert(navigationItemTranslations)
          .values({ itemId, language, label: item.label[language], visible: item.visible[language] })
          .onConflictDoUpdate({
            target: [navigationItemTranslations.itemId, navigationItemTranslations.language],
            set: { label: item.label[language], visible: item.visible[language] },
          });
      }
    }
    await tx.insert(auditLog).values({
      actorUserId,
      action: id ? "navigation.updated" : "navigation.created",
      subjectType: "navigations",
      subjectId: navigationId,
      detail: { placement, itemCount: value.items.length },
    });
    return navigationId;
  });
  const saved = (await listFooterNavigations(db, placement)).find((group) => group.id === savedId);
  if (!saved) throw new Error("Saved navigation could not be read");
  return saved;
}

/** Deletes only the requested placement group and records the size of the cascade. */
export async function deleteFooterNavigation(
  db: Database,
  id: string,
  actorUserId: string,
  placement: NavigationPlacement = "footer",
): Promise<void> {
  await db.transaction(async (tx) => {
    const [group] = await tx
      .select({ id: navigations.id })
      .from(navigations)
      .where(and(eq(navigations.id, id), eq(navigations.placement, placement)))
      .for("update");
    if (!group) throw new HttpError(ErrorCode.NotFound, "That navigation does not exist.");
    const items = await tx
      .select({ id: navigationItems.id })
      .from(navigationItems)
      .where(eq(navigationItems.navigationId, id));
    await tx.delete(navigations).where(eq(navigations.id, id));
    await tx.insert(auditLog).values({
      actorUserId,
      action: "navigation.deleted",
      subjectType: "navigations",
      subjectId: id,
      detail: { placement, itemCount: items.length },
    });
  });
}

/** Reordering is one transaction, so two lists cannot be left at half of a swap. */
export async function reorderFooterNavigations(
  db: Database,
  positions: readonly Position[],
  actorUserId: string,
  placement: NavigationPlacement = "footer",
): Promise<FooterNavigation[]> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: navigations.id })
      .from(navigations)
      .where(
        and(
          eq(navigations.placement, placement),
          inArray(
            navigations.id,
            positions.map((item) => item.id),
          ),
        ),
      )
      .orderBy(asc(navigations.id))
      .for("update");
    if (rows.length !== positions.length)
      throw new HttpError(ErrorCode.NotFound, "A navigation no longer exists.");
    await writePositions(tx, navigations, positions, {
      actorUserId,
      action: "navigation.reordered",
      subjectType: "navigations",
    });
  });
  return listFooterNavigations(db, placement);
}
