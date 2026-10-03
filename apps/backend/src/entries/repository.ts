import {
  type ContentLanguage,
  type EmptiedBin,
  type EntryDetail,
  type EntryKind,
  type EntryList,
  type EntryTrashImpact,
  ErrorCode,
  RESERVED_PATHS,
  type SaveEntryBody,
  slugFromTitle,
} from "@layered/schemas";
import { and, desc, eq, inArray, isNotNull, ne, type SQLWrapper, sql } from "drizzle-orm";
import { mediaContentUrl, RASTER_MIME_TYPES } from "../account/repository.js";
import type { database } from "../db/connect.js";
import {
  auditLog,
  entries,
  entryTopics,
  entryTranslations,
  gonePaths,
  media,
  mediaReferences,
  navigationItems,
  paths,
  topics,
  topicTranslations,
} from "../db/schema/index.js";
import { HttpError } from "../http/response.js";

type Database = ReturnType<typeof database>;

/**
 * The names of an entry's topics, alphabetically, each in the given language
 * where the topic has a name in it and otherwise in whichever it has.
 *
 * The old site named its topics in English only, so a German translation would
 * otherwise list no topics at all until somebody writes the German names.
 *
 * @param entryId - The entry, as a column of the outer query.
 * @param language - The language to prefer, as a column of the outer query.
 */
export function topicNames(entryId: SQLWrapper, language: SQLWrapper) {
  return sql<string[]>`array(
    select ${assignedTopicName(language)} as "name"
    from ${entryTopics} as "assigned"
    where "assigned"."entry_id" = ${entryId}
    order by 1
  )`;
}

/**
 * The same topics with their ids, for a screen that links or changes them, and
 * whether each is named in the given language rather than borrowing the other.
 *
 * @param entryId - The entry, as a column of the outer query.
 * @param language - The language to prefer, as a column of the outer query.
 */
export function topicIdsAndNames(entryId: SQLWrapper, language: SQLWrapper) {
  return sql<{ id: string; name: string; named: boolean }[]>`coalesce((
    select json_agg(json_build_object('id', "named"."id", 'name', "named"."name", 'named', "named"."named") order by "named"."name")
    from (
      select "assigned"."topic_id" as "id", ${assignedTopicName(language)} as "name",
        exists (select 1 from ${topicTranslations} as "own"
          where "own"."topic_id" = "assigned"."topic_id" and "own"."language" = ${language}) as "named"
      from ${entryTopics} as "assigned"
      where "assigned"."entry_id" = ${entryId}
    ) as "named"
  ), '[]'::json)`;
}

/**
 * The name of the topic in `"assigned"`, in the given language where it has one
 * and otherwise in whichever it has. The one rule both readers above share.
 */
function assignedTopicName(language: SQLWrapper) {
  return sql`coalesce(
    (select "own"."name" from ${topicTranslations} as "own"
      where "own"."topic_id" = "assigned"."topic_id" and "own"."language" = ${language}),
    (select "other"."name" from ${topicTranslations} as "other"
      where "other"."topic_id" = "assigned"."topic_id" order by "other"."language" limit 1)
  )`;
}

/**
 * Every translation of every entry of one kind, newest first.
 *
 * One row per translation, because that is what the dashboard lists and opens.
 * The date is the publication date, or the entry's creation date for a
 * translation never published, so the list orders by when the writing appeared
 * rather than by when its row was written. The thumbnail is offered only for a
 * picture the dashboard can show, which is a raster image in the library.
 *
 * The list is not paged. It is one site's writing, and the dashboard filters it
 * in place so that its counts and its rows always describe the same set.
 *
 * @param db - The database.
 * @param kind - Posts, pages or projects.
 */
export async function listEntries(db: Database, kind: EntryKind): Promise<EntryList> {
  const date = sql<Date>`coalesce(${entryTranslations.publishedAt}, ${entries.createdAt})`;
  const rows = await db
    .select({
      id: entryTranslations.id,
      entryId: entries.id,
      title: entryTranslations.title,
      state: entryTranslations.state,
      language: entryTranslations.language,
      publishedAt: entryTranslations.publishedAt,
      createdAt: entries.createdAt,
      pictureId: media.id,
      // The other language of the same entry. The inner table is aliased, so the
      // bare table name inside the subquery still means the outer row.
      topics: topicNames(entries.id, entryTranslations.language),
      // A language in the bin is not a translation a reader can switch to.
      translated: sql<boolean>`exists (
        select 1 from ${entryTranslations} as "sibling"
        where "sibling"."entry_id" = ${entries.id} and "sibling"."id" <> ${entryTranslations.id}
          and "sibling"."trashed_at" is null
      )`,
      trashedAt: entryTranslations.trashedAt,
    })
    .from(entryTranslations)
    .innerJoin(entries, eq(entries.id, entryTranslations.entryId))
    .leftJoin(
      media,
      and(
        eq(media.id, entryTranslations.featuredMediaId),
        eq(media.kind, "image"),
        inArray(media.mimeType, RASTER_MIME_TYPES),
      ),
    )
    .where(eq(entries.kind, kind))
    .orderBy(desc(date), desc(entryTranslations.id));

  return rows.map((row) => ({
    id: row.id,
    entryId: row.entryId,
    title: row.title,
    state: row.state,
    language: row.language,
    date: (row.publishedAt ?? row.createdAt).toISOString(),
    thumbnailUrl: row.pictureId ? mediaContentUrl(row.pictureId) : null,
    translated: row.translated,
    topics: row.topics,
    trashed: row.trashedAt !== null,
  }));
}

/**
 * One translation, as the editor opens it.
 *
 * Read in any state, drafts included, because the editor is where a draft is
 * written. The caller is behind a session; what a reader may see is the public
 * snapshot's business, not this function's.
 *
 * @param db - The database.
 * @param id - The translation.
 * @throws `not_found` when there is no such translation.
 */
export async function readEntry(db: Database, id: string): Promise<EntryDetail> {
  const [row] = await db
    .select({
      id: entryTranslations.id,
      entryId: entries.id,
      kind: entries.kind,
      language: entryTranslations.language,
      title: entryTranslations.title,
      summary: entryTranslations.summary,
      body: entryTranslations.body,
      state: entryTranslations.state,
      readingWidth: entryTranslations.readingWidth,
      showInOtherLanguage: entryTranslations.showInOtherLanguage,
      publishedAt: entryTranslations.publishedAt,
      modifiedAt: entries.modifiedAt,
      pictureId: media.id,
      trashedAt: entryTranslations.trashedAt,
    })
    .from(entryTranslations)
    .innerJoin(entries, eq(entries.id, entryTranslations.entryId))
    .leftJoin(
      media,
      and(
        eq(media.id, entryTranslations.featuredMediaId),
        eq(media.kind, "image"),
        inArray(media.mimeType, RASTER_MIME_TYPES),
      ),
    )
    .where(eq(entryTranslations.id, id))
    .limit(1);
  if (!row) throw new HttpError(ErrorCode.NotFound, "There is no entry with this id.");

  const [current] = await db
    .select({ path: paths.path })
    .from(paths)
    .where(and(eq(paths.translationId, id), eq(paths.isCurrent, true)))
    .limit(1);

  const [other] = await db
    .select({
      id: entryTranslations.id,
      language: entryTranslations.language,
      title: entryTranslations.title,
      trashedAt: entryTranslations.trashedAt,
    })
    .from(entryTranslations)
    .where(and(eq(entryTranslations.entryId, row.entryId), ne(entryTranslations.id, id)))
    .limit(1);
  const counterpart = other && other.trashedAt === null ? other : undefined;

  const [named] = await db
    .select({ topics: topicIdsAndNames(entries.id, entryTranslations.language) })
    .from(entryTranslations)
    .innerJoin(entries, eq(entries.id, entryTranslations.entryId))
    .where(eq(entryTranslations.id, id));

  return {
    id: row.id,
    entryId: row.entryId,
    kind: row.kind,
    language: row.language,
    title: row.title,
    summary: row.summary,
    body: row.body,
    state: row.state,
    readingWidth: row.readingWidth,
    showInOtherLanguage: row.showInOtherLanguage,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    modifiedAt: row.modifiedAt.toISOString(),
    path: current?.path ?? null,
    slug: current?.path.split("/").filter(Boolean).at(-1) ?? slugFromTitle(row.title),
    pictureUrl: row.pictureId ? mediaContentUrl(row.pictureId) : null,
    topics: named?.topics ?? [],
    counterpart: counterpart
      ? { id: counterpart.id, language: counterpart.language, title: counterpart.title }
      : null,
    counterpartTrashed: other !== undefined && other.trashedAt !== null,
    trashed: row.trashedAt !== null,
  };
}

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * The address a translation answers at with its last segment replaced.
 *
 * Every segment before the last stays, because it follows from what the entry
 * is: its language prefix, or the section a migrated project sits in. A
 * translation without an address gets one carrying its language, as everything
 * written after the migration does.
 *
 * @param current - Its current address, or null where it has none.
 * @param language - Its language.
 * @param slug - The new last segment.
 */
export function addressWithSlug(current: string | null, language: ContentLanguage, slug: string): string {
  const parents = current ? current.split("/").filter(Boolean).slice(0, -1) : [language];
  return `/${[...parents, slug].join("/")}/`;
}

/**
 * Gives a translation the address its slug asks for, inside the transaction
 * that saves it.
 *
 * The address it leaves keeps its row as a former address, so the snapshot
 * turns it into a redirect. Taking back one of its own former addresses makes
 * that row current again. An address another translation holds, current or
 * former, is refused, because it would take a working link from that one, and
 * so is an overview's address, which the overview always answers at. An
 * address that answered 410 since its entry was deleted belongs to this one
 * from now on.
 *
 * @returns Whether the address changed, for the audit log.
 * @throws `conflict` where another translation holds the address.
 */
async function setAddress(
  tx: Transaction,
  translationId: string,
  language: ContentLanguage,
  slug: string,
): Promise<boolean> {
  const [current] = await tx
    .select({ id: paths.id, path: paths.path })
    .from(paths)
    .where(and(eq(paths.translationId, translationId), eq(paths.isCurrent, true)))
    .limit(1);
  const wanted = addressWithSlug(current?.path ?? null, language, slug);
  if (current?.path === wanted) return false;
  if (RESERVED_PATHS.includes(wanted)) {
    throw new HttpError(ErrorCode.Conflict, "This address belongs to an overview of the site.");
  }

  const [holder] = await tx
    .select({ id: paths.id, translationId: paths.translationId })
    .from(paths)
    .where(eq(paths.path, wanted))
    .limit(1);
  if (holder && holder.translationId !== translationId) {
    throw new HttpError(ErrorCode.Conflict, "This address belongs to another entry.");
  }

  // The current row steps back first, because a translation has one current
  // address at a time and the index holds it to that.
  if (current) await tx.update(paths).set({ isCurrent: false }).where(eq(paths.id, current.id));
  if (holder) await tx.update(paths).set({ isCurrent: true }).where(eq(paths.id, holder.id));
  else await tx.insert(paths).values({ translationId, path: wanted });
  await tx.delete(gonePaths).where(eq(gonePaths.path, wanted));
  return true;
}

/**
 * Sets which topics an entry carries, inside the transaction that saves it.
 *
 * @param tx - The save's transaction.
 * @param entryId - The entry.
 * @param topicIds - Every topic it carries afterwards.
 * @returns Whether the set changed, for the audit log.
 * @throws `invalid_request` where a topic does not exist.
 */
async function setEntryTopics(
  tx: Transaction,
  entryId: string,
  topicIds: readonly string[],
): Promise<boolean> {
  const wanted = [...new Set(topicIds)];
  if (wanted.length > 0) {
    const found = await tx.select({ id: topics.id }).from(topics).where(inArray(topics.id, wanted));
    if (found.length !== wanted.length) {
      throw new HttpError(ErrorCode.InvalidRequest, "One of these topics does not exist.");
    }
  }
  const current = (
    await tx
      .select({ topicId: entryTopics.topicId })
      .from(entryTopics)
      .where(eq(entryTopics.entryId, entryId))
  ).map((row) => row.topicId);
  const unchanged = current.length === wanted.length && current.every((topicId) => wanted.includes(topicId));
  if (unchanged) return false;

  await tx.delete(entryTopics).where(eq(entryTopics.entryId, entryId));
  if (wanted.length > 0) await tx.insert(entryTopics).values(wanted.map((topicId) => ({ entryId, topicId })));
  return true;
}

/**
 * Stores what the editor holds for one translation, and records the act.
 *
 * The first time a translation becomes public it gets its publication date,
 * and only then: a correction later is not a new publication. The entry's own
 * modification time moves with every save, because it is the entry that
 * changed. The audit log names which fields changed and never their values,
 * and a translation becoming public is its own line, because who published
 * what and when is the question that log exists to answer. The topics are the
 * entry's, so saving one language sets them for both. A changed slug moves the
 * translation to a new address and leaves the old one as a redirect.
 *
 * @param db - The database.
 * @param id - The translation.
 * @param value - The whole of what the editor holds, already validated.
 * @param actorUserId - The account that saved it.
 * @returns The translation as it now stands.
 */
export async function saveEntry(
  db: Database,
  id: string,
  value: SaveEntryBody,
  actorUserId: string,
): Promise<EntryDetail> {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        entryId: entryTranslations.entryId,
        title: entryTranslations.title,
        summary: entryTranslations.summary,
        body: entryTranslations.body,
        state: entryTranslations.state,
        readingWidth: entryTranslations.readingWidth,
        showInOtherLanguage: entryTranslations.showInOtherLanguage,
        publishedAt: entryTranslations.publishedAt,
        trashedAt: entryTranslations.trashedAt,
        language: entryTranslations.language,
      })
      .from(entryTranslations)
      .where(eq(entryTranslations.id, id))
      .limit(1);
    if (!current) throw new HttpError(ErrorCode.NotFound, "There is no entry with this id.");
    // A translation in the bin is restored before it is written to, so a save
    // can never publish something the reader believes is deleted.
    if (current.trashedAt) throw new HttpError(ErrorCode.Conflict, "This entry is in the bin.");

    const now = new Date();
    const becomesPublic = value.state === "public" && current.state !== "public";
    const { topicIds, slug, ...fields } = value;
    await tx
      .update(entryTranslations)
      .set({
        ...fields,
        publishedAt: becomesPublic && !current.publishedAt ? now : current.publishedAt,
      })
      .where(eq(entryTranslations.id, id));
    await tx.update(entries).set({ modifiedAt: now }).where(eq(entries.id, current.entryId));
    const topicsChanged = await setEntryTopics(tx, current.entryId, topicIds);

    const changedKeys: string[] = (Object.keys(fields) as (keyof typeof fields)[]).filter(
      (key) => current[key] !== fields[key],
    );
    if (topicsChanged) changedKeys.push("topicIds");
    if (await setAddress(tx, id, current.language, slug)) changedKeys.push("slug");
    if (changedKeys.length > 0) {
      await tx.insert(auditLog).values({
        actorUserId,
        action: "entry.updated",
        subjectType: "entry_translations",
        subjectId: id,
        detail: { changedKeys },
      });
    }
    if (becomesPublic) {
      await tx.insert(auditLog).values({
        actorUserId,
        action: "entry.published",
        subjectType: "entry_translations",
        subjectId: id,
      });
    }
  });
  return readEntry(db, id);
}

/** How many numbered alternatives an address tries before a new translation is refused. */
const ADDRESS_ATTEMPTS = 9;

/**
 * Creates the other language of an entry, or opens it where it already exists.
 *
 * The new translation starts as a draft holding the source's title, summary,
 * text, reading width and picture, because a translation is written by
 * rewriting what is there, and it stays a draft until somebody publishes it.
 * The topics and the kind belong to the entry and are shared without copying.
 *
 * Its address carries its language, `/de/…` or `/en/…`, as everything written
 * after the migration does. The segment is the source's own where it has an
 * address and otherwise one written from its title; a segment already taken is
 * numbered, and after `ADDRESS_ATTEMPTS` the request is refused rather than
 * given an address nobody chose.
 *
 * @param db - The database.
 * @param id - The translation it is made from.
 * @param actorUserId - The account that asked for it, for the audit log.
 * @returns The other language, as the editor opens it.
 * @throws `not_found` where the source does not exist, `conflict` where no address is free.
 */
export async function createTranslation(db: Database, id: string, actorUserId: string): Promise<EntryDetail> {
  const created = await db.transaction(async (tx) => {
    const [source] = await tx
      .select({
        entryId: entryTranslations.entryId,
        language: entryTranslations.language,
        title: entryTranslations.title,
        summary: entryTranslations.summary,
        body: entryTranslations.body,
        readingWidth: entryTranslations.readingWidth,
        featuredMediaId: entryTranslations.featuredMediaId,
      })
      .from(entryTranslations)
      .where(eq(entryTranslations.id, id))
      .limit(1);
    if (!source) throw new HttpError(ErrorCode.NotFound, "There is no entry with this id.");

    const language = source.language === "en" ? "de" : "en";
    const [existing] = await tx
      .select({ id: entryTranslations.id })
      .from(entryTranslations)
      .where(and(eq(entryTranslations.entryId, source.entryId), eq(entryTranslations.language, language)))
      .limit(1);
    if (existing) return existing.id;

    const [sourcePath] = await tx
      .select({ path: paths.path })
      .from(paths)
      .where(and(eq(paths.translationId, id), eq(paths.isCurrent, true)))
      .limit(1);
    const segment = sourcePath?.path.split("/").filter(Boolean).at(-1) ?? slugFromTitle(source.title);
    const candidates = Array.from(
      { length: ADDRESS_ATTEMPTS },
      (_, attempt) => `/${language}/${attempt === 0 ? segment : `${segment}-${attempt + 1}`}/`,
    );
    const taken = new Set([
      ...RESERVED_PATHS,
      ...(await tx.select({ path: paths.path }).from(paths).where(inArray(paths.path, candidates))).map(
        (row) => row.path,
      ),
    ]);
    const path = candidates.find((candidate) => !taken.has(candidate));
    if (!path) throw new HttpError(ErrorCode.Conflict, "Every address for this translation is taken.");

    const [translation] = await tx
      .insert(entryTranslations)
      .values({
        entryId: source.entryId,
        language,
        title: source.title,
        summary: source.summary,
        body: source.body,
        readingWidth: source.readingWidth,
        featuredMediaId: source.featuredMediaId,
        state: "draft",
      })
      .returning({ id: entryTranslations.id });
    if (!translation) throw new Error("The translation was not written.");
    await tx.insert(paths).values({ translationId: translation.id, path });
    await tx.update(entries).set({ modifiedAt: new Date() }).where(eq(entries.id, source.entryId));
    await tx.insert(auditLog).values({
      actorUserId,
      action: "entry.translated",
      subjectType: "entry_translations",
      subjectId: translation.id,
      detail: { from: id, language },
    });
    return translation.id;
  });
  return readEntry(db, created);
}

/**
 * What moving a translation to the bin will affect: the files it names, which
 * the bin keeps until it is emptied, and the navigation items pointing at its
 * entry.
 *
 * @param db - The database.
 * @param id - The translation.
 * @throws `not_found` where there is no such translation.
 */
export async function trashImpact(db: Database, id: string): Promise<EntryTrashImpact> {
  const [row] = await db
    .select({
      entryId: entryTranslations.entryId,
      mediaReferences: sql<number>`(
        select count(distinct "named"."media_id")::int from (
          select ${mediaReferences.mediaId} as "media_id" from ${mediaReferences}
            where ${mediaReferences.translationId} = ${entryTranslations.id}
          union select ${entryTranslations.featuredMediaId}
        ) as "named" where "named"."media_id" is not null
      )`,
      navigationItems: sql<number>`(
        select count(*)::int from ${navigationItems} where ${navigationItems.entryId} = ${entryTranslations.entryId}
      )`,
    })
    .from(entryTranslations)
    .where(eq(entryTranslations.id, id))
    .limit(1);
  if (!row) throw new HttpError(ErrorCode.NotFound, "There is no entry with this id.");
  return { mediaReferences: row.mediaReferences, navigationItems: row.navigationItems };
}

/**
 * Moves a translation to the bin, or takes it out again.
 *
 * Nothing but the mark changes, so a translation comes back with its state, its
 * addresses and its files exactly as it left. Moving one that is already where
 * it is asked to go changes nothing and logs nothing.
 *
 * @param db - The database.
 * @param id - The translation.
 * @param trashed - True to move it to the bin, false to restore it.
 * @param actorUserId - The account that asked, for the audit log.
 * @returns The translation as it now stands.
 * @throws `not_found` where there is no such translation.
 */
export async function setTrashed(
  db: Database,
  id: string,
  trashed: boolean,
  actorUserId: string,
): Promise<EntryDetail> {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ entryId: entryTranslations.entryId, trashedAt: entryTranslations.trashedAt })
      .from(entryTranslations)
      .where(eq(entryTranslations.id, id))
      .limit(1);
    if (!current) throw new HttpError(ErrorCode.NotFound, "There is no entry with this id.");
    if ((current.trashedAt !== null) === trashed) return;

    const now = new Date();
    await tx
      .update(entryTranslations)
      .set({ trashedAt: trashed ? now : null })
      .where(eq(entryTranslations.id, id));
    await tx.update(entries).set({ modifiedAt: now }).where(eq(entries.id, current.entryId));
    await tx.insert(auditLog).values({
      actorUserId,
      action: trashed ? "entry.trashed" : "entry.restored",
      subjectType: "entry_translations",
      subjectId: id,
    });
  });
  return readEntry(db, id);
}

/**
 * Deletes every translation of one kind that is in the bin, for good.
 *
 * Their addresses move to `gone_paths` first, so they answer 410 afterwards. The
 * rows go with everything that cascades from them, which is what releases the
 * files they named. An entry left with no translation at all goes as well,
 * because a piece of work in no language is nothing.
 *
 * @param db - The database.
 * @param kind - Posts, pages or projects, because the bin is a filter on one list.
 * @param actorUserId - The account that emptied it, for the audit log.
 * @returns How many translations were deleted.
 */
export async function emptyBin(db: Database, kind: EntryKind, actorUserId: string): Promise<EmptiedBin> {
  return db.transaction(async (tx) => {
    const binned = await tx
      .select({ id: entryTranslations.id, entryId: entryTranslations.entryId })
      .from(entryTranslations)
      .innerJoin(entries, eq(entries.id, entryTranslations.entryId))
      .where(and(eq(entries.kind, kind), isNotNull(entryTranslations.trashedAt)));
    if (binned.length === 0) return { deleted: 0 };
    const ids = binned.map((row) => row.id);

    // An overview's address belongs to the overview, so it goes on answering
    // with that rather than with 410.
    const addresses = (
      await tx.select({ path: paths.path }).from(paths).where(inArray(paths.translationId, ids))
    ).filter((row) => !RESERVED_PATHS.includes(row.path));
    if (addresses.length > 0) await tx.insert(gonePaths).values(addresses).onConflictDoNothing();

    await tx.delete(entryTranslations).where(inArray(entryTranslations.id, ids));
    const entryIds = [...new Set(binned.map((row) => row.entryId))];
    await tx
      .delete(entries)
      .where(
        and(
          inArray(entries.id, entryIds),
          sql`not exists (select 1 from ${entryTranslations} where ${entryTranslations.entryId} = ${entries.id})`,
        ),
      );
    await tx.insert(auditLog).values(
      ids.map((subjectId) => ({
        actorUserId,
        action: "entry.purged",
        subjectType: "entry_translations",
        subjectId,
      })),
    );
    return { deleted: ids.length };
  });
}
