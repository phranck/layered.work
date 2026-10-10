import {
  CONTENT_LANGUAGES,
  type ContentLanguage,
  type CreateTopicBody,
  ErrorCode,
  numberedSlug,
  type SaveTopicBody,
  slugFromTitle,
  type TopicList,
  type TopicListItem,
} from "@layered/schemas";
import { and, eq, inArray, sql } from "drizzle-orm";
import { auditActor } from "../auth/audit-actor.js";
import type { Database, Transaction } from "../db/connect.js";
import {
  auditLog,
  entryTopics,
  formerTopicSlugs,
  navigationItems,
  topics,
  topicTranslations,
} from "../db/schema/index.js";
import { HttpError } from "../http/response.js";

/**
 * Topics as the dashboard manages them: listed with their use, created while
 * writing, renamed, merged and deleted.
 *
 * Every change that would leave an address behind leaves it in
 * `former_topic_slugs` instead, so the public snapshot can turn it into a
 * redirect. Every change is written to the audit log under the account that
 * made it.
 */

/** How many numbered alternatives a new topic's address tries before the request is refused. */
const SLUG_ATTEMPTS = 9;

/**
 * Every topic, with its name and address in each language it has one in, and
 * how many entries carry it.
 *
 * Ordered by the English name where there is one and the German otherwise,
 * because that is the name the migrated topics all have.
 *
 * @param db - The database.
 */
export async function listTopics(db: Database): Promise<TopicList> {
  const rows = await db
    .select({
      id: topics.id,
      language: topicTranslations.language,
      name: topicTranslations.name,
      slug: topicTranslations.slug,
      entryCount: sql<number>`(select count(*)::int from ${entryTopics} where ${entryTopics.topicId} = ${topics.id})`,
    })
    .from(topics)
    .leftJoin(topicTranslations, eq(topicTranslations.topicId, topics.id));

  const byId = new Map<string, TopicListItem>();
  for (const row of rows) {
    const item = byId.get(row.id) ?? { id: row.id, en: null, de: null, entryCount: row.entryCount };
    if (row.language && row.name !== null && row.slug !== null) {
      item[row.language] = { name: row.name, slug: row.slug };
    }
    byId.set(row.id, item);
  }
  const sortName = (item: TopicListItem) => (item.en ?? item.de)?.name ?? "";
  return [...byId.values()].sort((first, second) => sortName(first).localeCompare(sortName(second), "en"));
}

/**
 * One topic as the list shows it.
 *
 * @throws `not_found` where there is no such topic.
 */
async function readTopic(db: Database, id: string): Promise<TopicListItem> {
  const topic = (await listTopics(db)).find((item) => item.id === id);
  if (!topic) throw new HttpError(ErrorCode.NotFound, "There is no topic with this id.");
  return topic;
}

/**
 * Whether an address in one language is free for a topic: held neither by
 * another topic nor as the former address of another topic.
 *
 * A former address of the same topic is free, because taking it back is what
 * undoing a change of slug looks like.
 */
async function slugIsFree(
  tx: Transaction,
  language: ContentLanguage,
  slug: string,
  topicId: string | null,
): Promise<boolean> {
  const [current] = await tx
    .select({ topicId: topicTranslations.topicId })
    .from(topicTranslations)
    .where(and(eq(topicTranslations.language, language), eq(topicTranslations.slug, slug)))
    .limit(1);
  if (current && current.topicId !== topicId) return false;
  const [former] = await tx
    .select({ topicId: formerTopicSlugs.topicId })
    .from(formerTopicSlugs)
    .where(and(eq(formerTopicSlugs.language, language), eq(formerTopicSlugs.slug, slug)))
    .limit(1);
  return !former || former.topicId === topicId;
}

/**
 * Creates a topic from a name typed while writing, or returns the one that
 * already has that name.
 *
 * A name that differs only in case is the same topic, so a second "hardware"
 * is not created beside "Hardware". The address is written from the name and
 * numbered where the plain one is taken.
 *
 * @param db - The database.
 * @param value - The name and the language it is written in.
 * @param actorUserId - The account that created it, for the audit log.
 * @throws `conflict` where no address is free.
 */
export async function createTopic(
  db: Database,
  value: CreateTopicBody,
  actorUserId: string,
  actorTokenId?: string,
): Promise<TopicListItem> {
  const id = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ topicId: topicTranslations.topicId })
      .from(topicTranslations)
      .where(
        and(
          eq(topicTranslations.language, value.language),
          sql`lower(${topicTranslations.name}) = lower(${value.name})`,
        ),
      )
      .limit(1);
    if (existing) return existing.topicId;

    const base = slugFromTitle(value.name);
    let slug: string | undefined;
    for (let attempt = 0; attempt < SLUG_ATTEMPTS && !slug; attempt += 1) {
      const candidate = numberedSlug(base, attempt);
      if (await slugIsFree(tx, value.language, candidate, null)) slug = candidate;
    }
    if (!slug) throw new HttpError(ErrorCode.Conflict, "Every address for this topic is taken.");

    const [created] = await tx.insert(topics).values({}).returning({ id: topics.id });
    if (!created) throw new Error("The topic was not written.");
    await tx
      .insert(topicTranslations)
      .values({ topicId: created.id, language: value.language, name: value.name, slug });
    await tx.insert(auditLog).values({
      ...auditActor(actorUserId, actorTokenId),
      action: "topic.created",
      subjectType: "topics",
      subjectId: created.id,
      detail: { language: value.language },
    });
    return created.id;
  });
  return readTopic(db, id);
}

/**
 * Stores a topic's names and addresses in both languages.
 *
 * A language sent as `null` loses its name and its address. An address that
 * changes, or disappears, is kept as a former address so links to it go on
 * working.
 *
 * @param db - The database.
 * @param id - The topic.
 * @param value - Both languages.
 * @param actorUserId - The account that saved it, for the audit log.
 * @throws `not_found` where there is no such topic, `conflict` where an address is taken.
 */
export async function saveTopic(
  db: Database,
  id: string,
  value: SaveTopicBody,
  actorUserId: string,
  actorTokenId?: string,
): Promise<TopicListItem> {
  await db.transaction(async (tx) => {
    const [topic] = await tx.select({ id: topics.id }).from(topics).where(eq(topics.id, id)).limit(1);
    if (!topic) throw new HttpError(ErrorCode.NotFound, "There is no topic with this id.");

    const current = await tx
      .select({
        language: topicTranslations.language,
        name: topicTranslations.name,
        slug: topicTranslations.slug,
      })
      .from(topicTranslations)
      .where(eq(topicTranslations.topicId, id));

    const changedKeys: string[] = [];
    for (const language of CONTENT_LANGUAGES) {
      const before = current.find((row) => row.language === language);
      const after = value[language];
      if (before?.name === after?.name && before?.slug === after?.slug) continue;
      changedKeys.push(language);

      if (after && !(await slugIsFree(tx, language, after.slug, id))) {
        throw new HttpError(ErrorCode.Conflict, "This address belongs to another topic.");
      }
      if (before && before.slug !== after?.slug) {
        await tx.insert(formerTopicSlugs).values({ topicId: id, language, slug: before.slug });
      }
      if (after) {
        // Taking back one of its own former addresses ends that redirect.
        await tx
          .delete(formerTopicSlugs)
          .where(
            and(
              eq(formerTopicSlugs.topicId, id),
              eq(formerTopicSlugs.language, language),
              eq(formerTopicSlugs.slug, after.slug),
            ),
          );
        await tx
          .insert(topicTranslations)
          .values({ topicId: id, language, name: after.name, slug: after.slug })
          .onConflictDoUpdate({
            target: [topicTranslations.topicId, topicTranslations.language],
            set: { name: after.name, slug: after.slug },
          });
      } else {
        await tx
          .delete(topicTranslations)
          .where(and(eq(topicTranslations.topicId, id), eq(topicTranslations.language, language)));
      }
    }

    if (changedKeys.length > 0) {
      await tx.insert(auditLog).values({
        ...auditActor(actorUserId, actorTokenId),
        action: "topic.updated",
        subjectType: "topics",
        subjectId: id,
        detail: { changedKeys },
      });
    }
  });
  return readTopic(db, id);
}

/**
 * Moves every entry of one topic to another and removes the first.
 *
 * Its addresses, current and former, become former addresses of the topic that
 * remains, so every link to it arrives there. A navigation item pointing at it
 * points at the remaining topic afterwards rather than at nothing.
 *
 * @param db - The database.
 * @param id - The topic that disappears.
 * @param into - The topic that remains.
 * @param actorUserId - The account that merged them, for the audit log.
 * @returns The topic that remains.
 * @throws `not_found` where either does not exist, `invalid_request` where both are the same.
 */
export async function mergeTopic(
  db: Database,
  id: string,
  into: string,
  actorUserId: string,
  actorTokenId?: string,
): Promise<TopicListItem> {
  if (id === into) throw new HttpError(ErrorCode.InvalidRequest, "A topic cannot be merged into itself.");
  await db.transaction(async (tx) => {
    const found = await tx
      .select({ id: topics.id })
      .from(topics)
      .where(inArray(topics.id, [id, into]));
    if (found.length !== 2) throw new HttpError(ErrorCode.NotFound, "There is no topic with this id.");

    const carried = await tx
      .select({ entryId: entryTopics.entryId })
      .from(entryTopics)
      .where(eq(entryTopics.topicId, id));
    if (carried.length > 0) {
      await tx
        .insert(entryTopics)
        .values(carried.map((row) => ({ entryId: row.entryId, topicId: into })))
        .onConflictDoNothing();
    }

    await tx.update(formerTopicSlugs).set({ topicId: into }).where(eq(formerTopicSlugs.topicId, id));
    const addresses = await tx
      .select({ language: topicTranslations.language, slug: topicTranslations.slug })
      .from(topicTranslations)
      .where(eq(topicTranslations.topicId, id));
    // The rows go first, because the former address takes the same slug.
    await tx.delete(topicTranslations).where(eq(topicTranslations.topicId, id));
    if (addresses.length > 0) {
      await tx.insert(formerTopicSlugs).values(addresses.map((row) => ({ ...row, topicId: into })));
    }

    await tx.update(navigationItems).set({ topicId: into }).where(eq(navigationItems.topicId, id));
    await tx.delete(topics).where(eq(topics.id, id));
    await tx.insert(auditLog).values({
      ...auditActor(actorUserId, actorTokenId),
      action: "topic.merged",
      subjectType: "topics",
      subjectId: into,
      detail: { from: id, entries: carried.length },
    });
  });
  return readTopic(db, into);
}

/**
 * Removes a topic. The entries that carried it keep everything else, and its
 * addresses stop answering.
 *
 * @param db - The database.
 * @param id - The topic.
 * @param actorUserId - The account that deleted it, for the audit log.
 * @throws `not_found` where there is no such topic.
 */
export async function deleteTopic(
  db: Database,
  id: string,
  actorUserId: string,
  actorTokenId?: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [carried] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(entryTopics)
      .where(eq(entryTopics.topicId, id));
    const deleted = await tx.delete(topics).where(eq(topics.id, id)).returning({ id: topics.id });
    if (deleted.length === 0) throw new HttpError(ErrorCode.NotFound, "There is no topic with this id.");
    await tx.insert(auditLog).values({
      ...auditActor(actorUserId, actorTokenId),
      action: "topic.deleted",
      subjectType: "topics",
      subjectId: id,
      detail: { entries: carried?.count ?? 0 },
    });
  });
}
