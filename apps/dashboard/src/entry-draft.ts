import { type EntryDetail, entrySpecs, type SaveEntryBody, saveEntryBody } from "@layered/schemas";
import { isSavableSlug } from "./address.js";

/**
 * The rules the entry editor holds a draft by: what it changes, when it differs
 * from what is stored, and when it may be saved or saves itself.
 *
 * A draft saves itself while it is a draft, because nothing a reader sees
 * depends on it. Anything already public or hidden is saved by hand, because a
 * save there changes what readers get, and half a sentence must not reach them
 * by itself.
 */

/** How long typing has to pause before a draft is saved by itself, in milliseconds. */
export const AUTOSAVE_DELAY_MS = 2000;

/**
 * What the editor changes, taken out of what it opened.
 *
 * @param entry - The translation as the API returned it.
 */
export function draftOf(entry: EntryDetail): SaveEntryBody {
  return {
    title: entry.title,
    summary: entry.summary,
    body: entry.body,
    state: entry.state,
    readingWidth: entry.readingWidth,
    showInOtherLanguage: entry.showInOtherLanguage,
    topicIds: entry.topics.map((topic) => topic.id),
    specs: entry.specs,
    slug: entry.slug,
  };
}

/**
 * Whether two drafts say the same thing. Compared field by field, never by
 * serializing: the topics as a set, because their order means nothing, and the
 * specification pair by pair, because its order is what the page shows.
 *
 * @param first - One draft.
 * @param second - The other.
 */
export function sameDraft(first: SaveEntryBody, second: SaveEntryBody): boolean {
  const { topicIds: firstTopics, specs: firstSpecs, ...firstFields } = first;
  const { topicIds: secondTopics, specs: secondSpecs, ...secondFields } = second;
  const secondTopicIds = new Set(secondTopics);
  return (
    (Object.keys(firstFields) as (keyof typeof firstFields)[]).every(
      (key) => firstFields[key] === secondFields[key],
    ) &&
    firstTopics.length === secondTopics.length &&
    firstTopics.every((id) => secondTopicIds.has(id)) &&
    firstSpecs.length === secondSpecs.length &&
    firstSpecs.every(
      (pair, index) => pair.label === secondSpecs[index]?.label && pair.value === secondSpecs[index]?.value,
    )
  );
}

/**
 * The draft as a save would store it.
 *
 * The API trims a title, a summary, an address and every specification pair,
 * so a draft holding a trailing space differs from what its own save returns.
 * Compared as written, it would stay unsaved after every save, and a draft
 * would save itself again every two seconds for as long as it stays open. The
 * schema the API reads is applied here as well. A draft it refuses stays as it
 * is, which differs from anything stored.
 *
 * @param draft - The draft as the editor holds it.
 */
export function asStored(draft: SaveEntryBody): SaveEntryBody {
  const parsed = saveEntryBody.safeParse(draft);
  return parsed.success ? parsed.data : draft;
}

/** What the editor's buttons and its autosave may do with a draft. */
export interface DraftAbilities {
  /** The Save button and Command-S may store it. */
  savable: boolean;
  /** The Publish button may store it as public. */
  publishReady: boolean;
}

/**
 * What may be done with a draft as it stands.
 *
 * Nothing is saved for an entry in the trash. An address still being typed,
 * such as one ending in a hyphen, is not saved by any of the ways a save starts,
 * and neither is a specification pair still missing its label or its value.
 * Content the validator refuses may still be kept as a draft, but never made
 * public.
 *
 * @param entry - The translation as it is stored.
 * @param draft - What the editor holds.
 * @param publishable - Whether the body passes the content validator.
 */
export function draftAbilities(
  entry: EntryDetail,
  draft: SaveEntryBody,
  publishable: boolean,
): DraftAbilities {
  const writable = !entry.trashed && isSavableSlug(draft.slug) && entrySpecs.safeParse(draft.specs).success;
  return {
    savable: writable && (draft.state === "draft" || publishable),
    publishReady: writable && publishable,
  };
}

/**
 * Whether the draft saves itself once typing pauses: only when both what is
 * stored and what is being written are drafts, so choosing "public" is never
 * saved by waiting.
 *
 * @param saved - What is stored.
 * @param draft - What the editor holds.
 * @param savable - Whether a save by hand would be allowed now.
 * @param dirty - Whether the two differ.
 */
export function savesItself(
  saved: SaveEntryBody,
  draft: SaveEntryBody,
  savable: boolean,
  dirty: boolean,
): boolean {
  return savable && saved.state === "draft" && draft.state === "draft" && dirty;
}
