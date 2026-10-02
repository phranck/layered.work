import { z } from "zod";
import { CONTENT_LANGUAGES } from "./entries.js";
import { body, MaxLength, text } from "./request.js";

/**
 * What belongs to the site as a whole rather than to any entry.
 *
 * Three groups, each stored as one row of the `settings` table under its own
 * key and each saved on its own: the site itself, the mail it sends, and the
 * analytics it reports to. Each group is declared here once, so the form that
 * edits it and the route that stores it accept exactly the same values.
 *
 * The SMTP2GO key is not among them. It is a secret, so it reaches the API as an
 * environment variable from the platform's secret store, and the dashboard is
 * only told whether it is there.
 */

/** A value written in both languages of the site. */
const inBothLanguages = <Schema extends z.ZodType>(value: Schema) => z.strictObject({ en: value, de: value });

/** The site's own values: its name, its footer line, its language and its fallback sharing picture. */
export const siteSettings = body({
  title: inBothLanguages(text(MaxLength.Line)),
  /** The line in the footer. Empty leaves the footer without one. */
  footerLine: inBothLanguages(z.string().trim().max(MaxLength.Paragraph)),
  /** The language a visitor gets when nothing else decides it. */
  defaultLanguage: z.enum(CONTENT_LANGUAGES),
  /** The picture a social card shows for an entry that has none of its own. */
  socialImageMediaId: z.uuid().nullable(),
});
export type SiteSettings = z.infer<typeof siteSettings>;

/**
 * A sender name, which becomes part of a mail header.
 *
 * Angle brackets, quotes and control characters are refused, because a name is
 * written into `Name <address>` and any of them could close that form and start
 * another header.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: Control characters are what this refuses.
const SENDER_NAME = /^[^<>"\\\u0000-\u001f\u007f]+$/;

/** Who mail comes from. The address has to be verified at SMTP2GO before anything sends from it. */
export const mailSettings = body({
  senderAddress: z.string().trim().toLowerCase().pipe(z.email().max(MaxLength.Line)).nullable(),
  senderName: text(MaxLength.Line, { pattern: SENDER_NAME }),
});
export type MailSettings = z.infer<typeof mailSettings>;

/** The Umami website the site reports to. Null switches analytics off. */
export const analyticsSettings = body({
  umamiWebsiteId: z.uuid().nullable(),
});
export type AnalyticsSettings = z.infer<typeof analyticsSettings>;

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
  },
  mail: { senderAddress: null, senderName: "LAYERED.work" },
  analytics: { umamiWebsiteId: DEFAULT_UMAMI_WEBSITE_ID },
} as const satisfies { site: SiteSettings; mail: MailSettings; analytics: AnalyticsSettings };

/** Everything the settings screens show, as the API answers it. */
export const settingsView = z.object({
  site: siteSettings.extend({
    /** Where the sharing picture can be shown from, when one is chosen. */
    socialImageUrl: z.string().nullable(),
  }),
  mail: mailSettings.extend({
    /** Whether an SMTP2GO key reached the API. The key itself is never sent. */
    apiKeyConfigured: z.boolean(),
  }),
  analytics: analyticsSettings,
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
