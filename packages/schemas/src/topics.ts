import { z } from "zod";
import { CONTENT_LANGUAGES } from "./entries.js";
import { body, MaxLength, text } from "./request.js";
import { SLUG_PATTERN } from "./slug.js";

/**
 * Topics as the dashboard manages them.
 *
 * A topic is named once per language and answers at one address per language,
 * so everything here comes in pairs keyed by language. A missing language is
 * `null` rather than a copy of the other one, because a topic without a German
 * name has to be visible as such on the screen that would fix it.
 */

/** What a topic is called, and where it answers, in one language. */
export const topicName = z.object({
  name: z.string(),
  slug: z.string(),
});
export type TopicName = z.infer<typeof topicName>;

/** One topic as the topics screen lists it. */
export const topicListItem = z.object({
  id: z.uuid(),
  en: topicName.nullable(),
  de: topicName.nullable(),
  /** How many entries carry it, whatever their state. */
  entryCount: z.number().int().nonnegative(),
});
export type TopicListItem = z.infer<typeof topicListItem>;

/** Every topic, alphabetically by whichever name it has. */
export const topicList = z.array(topicListItem);
export type TopicList = z.infer<typeof topicList>;

/**
 * What creating a topic while writing sends: the name typed into the field, in
 * the language of the entry being written. The address is written from it.
 */
export const createTopicBody = body({
  language: z.enum(CONTENT_LANGUAGES),
  name: text(MaxLength.Line),
});
export type CreateTopicBody = z.infer<typeof createTopicBody>;

/** A name and an address in one language, as the topics screen saves them. */
const savedTopicName = body({
  name: text(MaxLength.Line),
  slug: text(MaxLength.Handle, { pattern: SLUG_PATTERN }),
});

/**
 * What saving a topic sends: both languages, each either named or left out.
 *
 * At least one has to be named, because a topic with no name in any language
 * cannot be shown or found.
 */
export const saveTopicBody = body({
  en: savedTopicName.nullable(),
  de: savedTopicName.nullable(),
}).refine((value) => value.en !== null || value.de !== null, { message: "A topic needs a name." });
export type SaveTopicBody = z.infer<typeof saveTopicBody>;

/** What merging sends: the topic that remains. */
export const mergeTopicBody = body({ into: z.uuid() });
export type MergeTopicBody = z.infer<typeof mergeTopicBody>;
