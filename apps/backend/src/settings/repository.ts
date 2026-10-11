import {
  DEFAULT_SETTINGS,
  LISTING_GROUP,
  type ListedKind,
  type ListingSettings,
  navigationHref,
  type PublicSiteFrame,
  SETTINGS_SCHEMAS,
  type SettingsGroup,
  type SettingsValues,
  type SettingsView,
  SITE_PICTURE_SETTINGS,
  type SiteSettings,
} from "@layered/schemas";
import { asc, eq, inArray } from "drizzle-orm";
import type { ZodType } from "zod";
import { config } from "../config.js";
import type { Database } from "../db/connect.js";
import { auditLog, media, mediaVariants, settings, socialAccounts } from "../db/schema/index.js";
import { deliveredFile } from "../media/delivery.js";
import { holdLibraryPicture } from "../media/pictures.js";
import { queueWatermarkedMedia } from "../media/queue.js";
import { replaceSettingMediaReferences } from "../media/references.js";
import { SITE_PICTURES } from "./site-pictures.js";

/**
 * The site's settings, one row per group.
 *
 * A group nobody has saved yet reads as its default, so the screens always have
 * something to show and the site always has something to use. A stored value
 * is read through the same schema it was written through: one that no longer
 * matches it, because the declaration moved on, falls back to the default
 * rather than reaching a screen in a shape nothing expects.
 */

/** Each group's schema, typed by what the group holds, so a group read by its key has its own type. */
const SCHEMAS: { [Group in SettingsGroup]: ZodType<SettingsValues[Group]> } = SETTINGS_SCHEMAS;

/** What each group is until somebody saves it. */
const DEFAULTS: SettingsValues = DEFAULT_SETTINGS;

/** One group's stored value, or its default where it has none or one that no longer fits. */
function readGroup<Group extends SettingsGroup>(
  group: Group,
  stored: Map<string, unknown>,
): SettingsValues[Group] {
  const parsed = SCHEMAS[group].safeParse(stored.get(group));
  return parsed.success ? parsed.data : DEFAULTS[group];
}

/**
 * Every group, as the settings screens show it.
 *
 * @param db - The database.
 * @returns The values, and whether a mail key is configured, which is all the
 *   dashboard is told about the key.
 */
export async function readSettings(db: Database): Promise<SettingsView> {
  const rows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, Object.keys(SETTINGS_SCHEMAS)));
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  return {
    site: readGroup("site", stored),
    mail: { ...readGroup("mail", stored), apiKeyConfigured: Boolean(config.SMTP2GO_API_KEY) },
    analytics: readGroup("analytics", stored),
    postListing: readGroup("postListing", stored),
    projectListing: readGroup("projectListing", stored),
  };
}

/**
 * The site group on its own, as it is stored or as its default.
 *
 * @param db - The database.
 */
export async function readSiteSettings(db: Pick<Database, "select">): Promise<SiteSettings> {
  const rows = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "site"));
  return readGroup("site", new Map([["site", rows[0]?.value]]));
}

/** Public site values are read separately from mail and analytics settings. */
export async function readPublicSiteFrame(db: Pick<Database, "select">): Promise<PublicSiteFrame> {
  const site = await readSiteSettings(db);
  const [picture] = site.socialImageMediaId
    ? await db.select().from(media).where(eq(media.id, site.socialImageMediaId)).limit(1)
    : [];
  const sizes = picture
    ? await db.select().from(mediaVariants).where(eq(mediaVariants.mediaId, picture.id))
    : [];
  const accounts = await db
    .select({ platform: socialAccounts.platform, handle: socialAccounts.handle, href: socialAccounts.href })
    .from(socialAccounts)
    .where(eq(socialAccounts.enabled, true))
    .orderBy(asc(socialAccounts.sortOrder), asc(socialAccounts.id));
  return {
    title: site.title,
    footerLine: site.footerLine,
    socialImage: picture ? `/${deliveredFile(picture, sizes).storageKey}` : null,
    social: accounts.filter((account) => navigationHref.safeParse(account.href).success),
  };
}

/**
 * How the site's two overviews are set up, for the public snapshot.
 *
 * Only these two groups leave the database towards the site. The others hold
 * nothing a reader sees or, like the mail sender, nothing a reader may.
 *
 * @param db - The database.
 */
export async function readListingSettings(
  db: Pick<Database, "select">,
): Promise<Record<ListedKind, ListingSettings>> {
  const rows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, Object.values(LISTING_GROUP)));
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  return { post: readGroup("postListing", stored), project: readGroup("projectListing", stored) };
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
  value: SettingsValues[Group],
  actorUserId: string,
): Promise<SettingsView> {
  await db.transaction(async (tx) => {
    if (group === "site") await requireSitePictures(value as SiteSettings, tx);
    const [current] = await tx
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, group))
      .limit(1);
    const before = readGroup(group, new Map([[group, current?.value]]));
    // Every watermarked picture carries the mark in its derived sizes, so a new mark means new sizes.
    if (
      group === "site" &&
      (before as SiteSettings).watermarkMediaId !== (value as SiteSettings).watermarkMediaId
    )
      await queueWatermarkedMedia(tx);
    const changedKeys = Object.keys(value).filter(
      (key) =>
        JSON.stringify((before as Record<string, unknown>)[key]) !==
        JSON.stringify((value as Record<string, unknown>)[key]),
    );

    await tx
      .insert(settings)
      .values({ key: group, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } });

    if (group === "postListing" || group === "projectListing")
      await replaceSettingMediaReferences(tx, group, (value as ListingSettings).introduction);

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
 * Refuses a site picture that is not a raster image stored in the library, and
 * holds each one until the settings are saved.
 *
 * Stored, because the watermark's bytes are read here and the sharing picture's
 * address is built from its storage key, and a picture from Unsplash has neither.
 */
async function requireSitePictures(site: SiteSettings, db: Pick<Database, "select">): Promise<void> {
  for (const key of SITE_PICTURE_SETTINGS) {
    const mediaId = site[key];
    if (mediaId) await holdLibraryPicture(db, mediaId, SITE_PICTURES[key].refusal, { storedHere: true });
  }
}
