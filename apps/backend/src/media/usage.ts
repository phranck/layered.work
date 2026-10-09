import { SITE_PICTURE_SETTINGS } from "@layered/schemas";
import { type SQL, sql } from "drizzle-orm";
import {
  entryTranslations,
  homeBlocks,
  media,
  mediaReferences,
  settingMediaReferences,
  settings,
  users,
} from "../db/schema/index.js";
import { HOME_PICTURE_KEYS } from "../home/blocks.js";

/**
 * Whether a home page block names this file in one of its picture settings.
 *
 * The keys come from the blocks' declarations, so a picture setting added there
 * is guarded here without another edit.
 *
 * @param mediaId - The file, as an id or as the column holding one.
 */
export function namesPictureInBlock(mediaId: string | SQL): SQL {
  if (HOME_PICTURE_KEYS.length === 0) return sql`false`;
  return sql`(${sql.join(
    HOME_PICTURE_KEYS.map((key) => sql`${homeBlocks.settings}->>${key} = ${mediaId}::text`),
    sql` or `,
  )})`;
}

/**
 * Whether the stored site settings name this file in one of their picture settings.
 *
 * The keys come from `SITE_PICTURE_SETTINGS`, so a picture setting added there
 * is guarded here without another edit.
 *
 * @param mediaId - The file, as an id or as the column holding one.
 */
export function namesSitePicture(mediaId: string | SQL): SQL {
  return sql`(${sql.join(
    SITE_PICTURE_SETTINGS.map((key) => sql`${settings.value}->>${key} = ${mediaId}::text`),
    sql` or `,
  )})`;
}

/** Every persisted use, including drafts, trash, portraits, site pictures and home page blocks. */
export function unusedMedia() {
  return sql`not exists (select 1 from ${mediaReferences} where ${mediaReferences.mediaId} = ${media.id})
    and not exists (select 1 from ${settingMediaReferences} where ${settingMediaReferences.mediaId} = ${media.id})
    and not exists (select 1 from ${entryTranslations} where ${entryTranslations.featuredMediaId} = ${media.id} or ${entryTranslations.socialCardMediaId} = ${media.id})
    and not exists (select 1 from ${users} where ${users.avatarMediaId} = ${media.id})
    and not exists (select 1 from ${settings} where ${settings.key} = 'site' and ${namesSitePicture(sql`${media.id}`)})
    and not exists (select 1 from ${homeBlocks} where ${namesPictureInBlock(sql`${media.id}`)})`;
}
