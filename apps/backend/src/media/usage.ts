import { sql } from "drizzle-orm";
import {
  entryTranslations,
  media,
  mediaReferences,
  settingMediaReferences,
  settings,
  users,
} from "../db/schema/index.js";

/** Every persisted use, including drafts, trash, portraits and site sharing. */
export function unusedMedia() {
  return sql`not exists (select 1 from ${mediaReferences} where ${mediaReferences.mediaId} = ${media.id})
    and not exists (select 1 from ${settingMediaReferences} where ${settingMediaReferences.mediaId} = ${media.id})
    and not exists (select 1 from ${entryTranslations} where ${entryTranslations.featuredMediaId} = ${media.id} or ${entryTranslations.socialCardMediaId} = ${media.id})
    and not exists (select 1 from ${users} where ${users.avatarMediaId} = ${media.id})
    and not exists (select 1 from ${settings} where ${settings.key} = 'site' and ${settings.value}->>'socialImageMediaId' = ${media.id}::text)`;
}
