import {
  type AnalyticsSettings,
  analyticsSettings,
  DEFAULT_SETTINGS,
  ErrorCode,
  type MailSettings,
  mailSettings,
  type SettingsView,
  type SiteSettings,
  siteSettings,
} from "@layered/schemas";
import { and, eq, inArray } from "drizzle-orm";
import { mediaContentUrl, RASTER_MIME_TYPES } from "../account/repository.js";
import { config } from "../config.js";
import type { database } from "../db/connect.js";
import { auditLog, media, settings } from "../db/schema/index.js";
import { HttpError } from "../http/response.js";

type Database = ReturnType<typeof database>;

/**
 * The site's settings, one row per group.
 *
 * A group nobody has saved yet reads as its default, so the screens always have
 * something to show and the site always has something to use. A stored value
 * is read through the same schema it was written through: one that no longer
 * matches it, because the declaration moved on, falls back to the default
 * rather than reaching a screen in a shape nothing expects.
 */

/** What a group holds, by its key. */
type GroupValue = { site: SiteSettings; mail: MailSettings; analytics: AnalyticsSettings };

/** A group of settings by its key. */
export type SettingsGroup = keyof GroupValue;

/** Each group's declaration, and what it is without a row. */
const GROUPS: {
  [Group in SettingsGroup]: {
    schema: { safeParse(value: unknown): { success: true; data: GroupValue[Group] } | { success: false } };
    fallback: GroupValue[Group];
  };
} = {
  site: { schema: siteSettings, fallback: DEFAULT_SETTINGS.site },
  mail: { schema: mailSettings, fallback: DEFAULT_SETTINGS.mail },
  analytics: { schema: analyticsSettings, fallback: DEFAULT_SETTINGS.analytics },
};

/** One group's stored value, or its default where it has none or one that no longer fits. */
function readGroup<Group extends SettingsGroup>(
  group: Group,
  stored: Map<string, unknown>,
): GroupValue[Group] {
  const { schema, fallback } = GROUPS[group];
  const parsed = schema.safeParse(stored.get(group));
  return parsed.success ? parsed.data : fallback;
}

/**
 * Every group, as the settings screens show it.
 *
 * @param db - The database.
 * @returns The values, the address of the sharing picture, and whether a mail
 *   key is configured, which is all the dashboard is told about the key.
 */
export async function readSettings(db: Database): Promise<SettingsView> {
  const rows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, Object.keys(GROUPS)));
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  const site = readGroup("site", stored);
  return {
    site: {
      ...site,
      socialImageUrl: site.socialImageMediaId ? mediaContentUrl(site.socialImageMediaId) : null,
    },
    mail: { ...readGroup("mail", stored), apiKeyConfigured: Boolean(config.SMTP2GO_API_KEY) },
    analytics: readGroup("analytics", stored),
  };
}

/**
 * Stores one group and records who changed what, without recording the values.
 *
 * @param db - The database.
 * @param group - Which group.
 * @param value - The whole group, already validated against its schema.
 * @param actorUserId - The account that saved it.
 * @returns Every group as the screens show it, so the caller can replace what it holds.
 */
export async function saveSettings<Group extends SettingsGroup>(
  db: Database,
  group: Group,
  value: GroupValue[Group],
  actorUserId: string,
): Promise<SettingsView> {
  if (group === "site") await requireSharingPicture((value as SiteSettings).socialImageMediaId, db);

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, group))
      .limit(1);
    const before = readGroup(group, new Map([[group, current?.value]]));
    const changedKeys = Object.keys(value).filter(
      (key) =>
        JSON.stringify((before as Record<string, unknown>)[key]) !==
        JSON.stringify((value as Record<string, unknown>)[key]),
    );

    await tx
      .insert(settings)
      .values({ key: group, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } });

    if (changedKeys.length > 0) {
      await tx.insert(auditLog).values({
        actorUserId,
        action: "settings.updated",
        subjectType: "settings",
        detail: { group, changedKeys },
      });
    }
  });

  return readSettings(db);
}

/**
 * Refuses a sharing picture that is not a raster image in the library, because
 * a social card can show nothing else.
 */
async function requireSharingPicture(mediaId: string | null, db: Database): Promise<void> {
  if (!mediaId) return;
  const [picture] = await db
    .select({ id: media.id })
    .from(media)
    .where(and(eq(media.id, mediaId), eq(media.kind, "image"), inArray(media.mimeType, RASTER_MIME_TYPES)))
    .limit(1);
  if (!picture) {
    throw new HttpError(ErrorCode.InvalidRequest, "Choose an existing raster image for the sharing picture.");
  }
}
