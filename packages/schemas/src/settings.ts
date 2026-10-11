import { z } from "zod";
import {
  CONTENT_LANGUAGES,
  type ContentLanguage,
  inBothLanguages,
  inEachLanguage,
  languagePath,
} from "./entries.js";
import { navigationHref } from "./navigation.js";
import { body, emailAddress, MaxLength, text, withoutControlCharacters } from "./request.js";

/**
 * What belongs to the site as a whole rather than to any entry.
 *
 * Each group is stored as one row of the `settings` table under its own key and
 * saved on its own: the site itself, the mail it sends, the analytics it
 * reports to, and how each of its two overviews is set up. Each group is declared here once, so the form that
 * edits it and the route that stores it accept exactly the same values.
 *
 * The SMTP2GO key is not among them. It is a secret, so it reaches the API as an
 * environment variable from the platform's secret store, and the dashboard is
 * only told whether it is there.
 */

/**
 * The site's own values: its name, its footer line, its language, its fallback
 * sharing picture and the mark its watermarked pictures carry.
 */
export const siteSettings = body({
  title: inBothLanguages(text(MaxLength.Line)),
  /** The line in the footer. Empty leaves the footer without one. */
  footerLine: inBothLanguages(z.string().trim().max(MaxLength.Paragraph)),
  /** The language a visitor gets when nothing else decides it. */
  defaultLanguage: z.enum(CONTENT_LANGUAGES),
  /** The picture a social card shows for an entry that has none of its own. */
  socialImageMediaId: z.uuid().nullable(),
  /**
   * The picture laid over every watermarked picture. Null is the site's wordmark.
   *
   * Defaulted rather than required, because a stored row written before the field
   * existed would otherwise fail to parse and the whole group would fall back to
   * its defaults.
   */
  watermarkMediaId: z.uuid().nullable().default(null),
});
export type SiteSettings = z.infer<typeof siteSettings>;

/** The site settings that name a library picture, which therefore count as uses of it. */
export const SITE_PICTURE_SETTINGS = ["socialImageMediaId", "watermarkMediaId"] as const;

/** One site setting that names a library picture. */
export type SitePictureSetting = (typeof SITE_PICTURE_SETTINGS)[number];
/** Only settings and enabled account links that visitors may see. */
export const publicSiteFrame = siteSettings.pick({ title: true, footerLine: true }).extend({
  social: z.array(z.object({ platform: z.string(), handle: z.string(), href: navigationHref })),
  socialImage: z.string().nullable().optional(),
});
export type PublicSiteFrame = z.infer<typeof publicSiteFrame>;

/**
 * A sender name, which becomes part of a mail header.
 *
 * Angle brackets, quotes, backslashes and control characters are refused,
 * because a name is written into `Name <address>` and any of them could close
 * that form and start another header.
 */
const senderName = text(MaxLength.Line, { pattern: /^[^<>"\\]+$/ }).refine(withoutControlCharacters);

/** Who mail comes from. The address has to be verified at SMTP2GO before anything sends from it. */
export const mailSettings = body({
  senderAddress: emailAddress.nullable(),
  senderName,
});
export type MailSettings = z.infer<typeof mailSettings>;

/**
 * The sender a mail goes out under, as its From line writes it, or null while
 * no sender address is saved. The API sends with it and the dashboard's mail
 * preview shows it.
 *
 * @param mail - The mail settings.
 */
export function mailSenderLine(mail: MailSettings): string | null {
  return mail.senderAddress ? `${mail.senderName} <${mail.senderAddress}>` : null;
}

/** The Umami website the site reports to. Null switches analytics off. */
export const analyticsSettings = body({
  umamiWebsiteId: z.uuid().nullable(),
});
export type AnalyticsSettings = z.infer<typeof analyticsSettings>;

/** The kinds of entry the site lists on an overview of their own. Pages have none. */
export const LISTED_KINDS = ["post", "project"] as const;
export type ListedKind = (typeof LISTED_KINDS)[number];

/**
 * Where each overview answers on the site, in each language. The import turns a
 * page found at one of these into that overview's introduction.
 */
export const LISTING_PATHS: Record<ListedKind, Record<ContentLanguage, string>> = {
  post: inEachLanguage((language) => languagePath(language, "posts")),
  project: inEachLanguage((language) => languagePath(language, "projects")),
};

/**
 * The slugs the site keeps for itself, for its overviews of posts, pages and
 * projects. Decided by phranck on 3 October 2026.
 */
export const RESERVED_SLUGS = ["posts", "pages", "projects"] as const;

/**
 * Every address a reserved slug makes, at the root and under each language.
 * No entry may hold one, and deleting an entry never marks one as gone, because
 * the address belongs to the site.
 */
export const RESERVED_PATHS: readonly string[] = RESERVED_SLUGS.flatMap((slug) =>
  ["/", "/en/", "/de/"].map((root) => `${root}${slug}/`),
);

/** The bounds an overview's figures are held to, so no setting can produce a page nobody can read. */
export const LISTING_BOUNDS = {
  pageSize: { min: 3, max: 60 },
  columns: { min: 1, max: 4 },
  previewLength: { min: 60, max: 600 },
} as const;

/** A whole number held to one of the bounds above. */
const bounded = ({ min, max }: { min: number; max: number }) => z.number().int().min(min).max(max);

/**
 * How one overview on the site is set up: posts or projects.
 *
 * An empty headline means the overview's own name, "Posts" or "Beiträge", and
 * an empty introduction means none. The introduction is written in the content
 * language, as an entry is.
 */
export const listingSettings = body({
  /** How many entries one page of the overview shows. */
  pageSize: bounded(LISTING_BOUNDS.pageSize),
  /** How many columns the grid has at most. It has fewer where the window is too narrow for them. */
  columns: bounded(LISTING_BOUNDS.columns),
  headline: inBothLanguages(z.string().trim().max(MaxLength.Line)),
  introduction: inBothLanguages(z.string().trim().max(MaxLength.Paragraph)),
  /** How many characters a card's preview text holds before it is shortened at a word. */
  previewLength: bounded(LISTING_BOUNDS.previewLength),
});
export type ListingSettings = z.infer<typeof listingSettings>;

/**
 * Each group of settings, by the key it is stored and saved under, and what it
 * holds. The API reads and stores each group through its schema here, and the
 * dashboard types each form from it.
 */
export const SETTINGS_SCHEMAS = {
  site: siteSettings,
  mail: mailSettings,
  analytics: analyticsSettings,
  postListing: listingSettings,
  projectListing: listingSettings,
} as const;

/** A group of settings, by its key. */
export type SettingsGroup = keyof typeof SETTINGS_SCHEMAS;

/** What each group of settings holds. */
export type SettingsValues = { [Group in SettingsGroup]: z.infer<(typeof SETTINGS_SCHEMAS)[Group]> };

/** What an overview nobody has set up uses. */
export const DEFAULT_LISTING: ListingSettings = {
  pageSize: 12,
  columns: 3,
  headline: { en: "", de: "" },
  introduction: { en: "", de: "" },
  previewLength: 220,
};

/** The settings group each overview is stored under. */
export const LISTING_GROUP = { post: "postListing", project: "projectListing" } as const satisfies Record<
  ListedKind,
  string
>;

/**
 * The Umami website id the site has reported to since before these settings
 * existed, which is what a settings table without an analytics row means.
 */
export const DEFAULT_UMAMI_WEBSITE_ID = "3e266ac6-8103-4bef-bedb-7d127ed75cc4";

/** What a site that nobody has configured yet uses. */
export const DEFAULT_SETTINGS = {
  site: {
    title: { en: "LAYERED.work", de: "LAYERED.work" },
    footerLine: { en: "", de: "" },
    defaultLanguage: "en",
    socialImageMediaId: null,
    watermarkMediaId: null,
  },
  mail: { senderAddress: null, senderName: "LAYERED.work" },
  analytics: { umamiWebsiteId: DEFAULT_UMAMI_WEBSITE_ID },
  postListing: DEFAULT_LISTING,
  projectListing: DEFAULT_LISTING,
} as const satisfies SettingsValues;

/** Everything the settings screens show, as the API answers it. */
export const settingsView = z.object({
  site: siteSettings,
  mail: mailSettings.extend({
    /** Whether an SMTP2GO key reached the API. The key itself is never sent. */
    apiKeyConfigured: z.boolean(),
  }),
  analytics: analyticsSettings,
  postListing: listingSettings,
  projectListing: listingSettings,
});
export type SettingsView = z.infer<typeof settingsView>;

/**
 * What SMTP2GO answered a test message with, passed on as it said it.
 *
 * `accepted` is true when SMTP2GO took the message for delivery. `answer` is the
 * provider's own words: its error where it refused, and the id it gave the
 * message where it took it.
 */
export const testMailResult = z.object({
  accepted: z.boolean(),
  answer: z.string(),
  /** The address the test went to, which is always the signed-in account's own. */
  recipient: z.email(),
});
export type TestMailResult = z.infer<typeof testMailResult>;
