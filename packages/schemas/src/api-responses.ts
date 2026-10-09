import { z } from "zod";
import { ENTRY_KINDS, READING_WIDTHS } from "./entries.js";
import { publicForm } from "./forms.js";
import { focalPoint, mediaDescriptions } from "./media.js";
import { publicFooterNavigation, publicMainNavigation } from "./navigation.js";
import { listingSettings, publicSiteFrame } from "./settings.js";
import { mediaCredit } from "./unsplash.js";

export const healthAlive = z.object({ service: z.literal("backend"), alive: z.literal(true) });
const readinessCheck = z.object({ ok: z.boolean(), detail: z.string() });
export const healthReady = z.object({
  service: z.literal("backend"),
  ready: z.boolean(),
  checks: z.object({ tables: readinessCheck, privileges: readinessCheck, migrations: readinessCheck }),
  configured: z.object({
    database: z.boolean(),
    bucket: z.boolean(),
    bucketCredentials: z.boolean(),
    sessionSecret: z.boolean(),
    mail: z.boolean(),
    unsplash: z.boolean(),
  }),
});
export const signedOut = z.object({ signedOut: z.literal(true) });
export const formChallenge = z.object({ challenge: z.string() });
export const formSubmitted = z.object({ successMessage: z.string() });
export const deletionResult = z.object({ deleted: z.literal(true) });
export const uploadReceived = z.object({ received: z.literal(true) });
export const binaryContent = z.string().meta({ format: "binary" });

const publicEntry = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  path: z.string(),
  language: z.enum(["en", "de"]),
  visibility: z.enum(["public", "hidden"]),
  kind: z.enum(ENTRY_KINDS),
  createdAt: z.iso.datetime(),
  publishedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime().nullable(),
  summary: z.string().nullable(),
  body: z.string(),
  topics: z.array(z.string()),
  featuredImage: z.string().nullable(),
  socialImage: z.string().nullable().optional(),
  translationPath: z.string().nullable(),
  featured: z.boolean(),
  onHomePage: z.boolean(),
  readingWidth: z.enum(READING_WIDTHS),
  showInOtherLanguage: z.boolean(),
});
const publicMedia = z.object({
  slug: z.string(),
  src: z.string(),
  mime: z.string(),
  filename: z.string(),
  source: z.string(),
  bytes: z.number().int().nonnegative(),
  sha256: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
  alt: z.string().optional(),
  caption: z.string().optional(),
  translations: mediaDescriptions.optional(),
  srcSet: z.string().optional(),
  placeholder: z.string().optional(),
  focalPoint: focalPoint.optional(),
  /** Who took a picture that comes from Unsplash, which every page showing it credits. */
  credit: mediaCredit.optional(),
});
const translatedTopic = z.object({ slug: z.string(), name: z.string() }).nullable();
export const publicSnapshot = z.object({
  footerNavigation: publicFooterNavigation,
  mainNavigation: publicMainNavigation.optional(),
  siteFrame: publicSiteFrame,
  entries: z.array(publicEntry),
  forms: z.array(publicForm),
  topics: z.array(
    z.object({ id: z.string(), translations: z.object({ en: translatedTopic, de: translatedTopic }) }),
  ),
  media: z.array(publicMedia),
  redirects: z.array(z.object({ source: z.string(), target: z.string() })),
  gone: z.array(z.string()),
  listings: z.object({ post: listingSettings, project: listingSettings }),
  homeBlocks: z.array(
    z.object({
      type: z.string(),
      enabled: z.boolean(),
      sortOrder: z.number().int(),
      settings: z.record(z.string(), z.unknown()),
    }),
  ),
});

/** The API description endpoint describes its own document as well. */
export const openApiDocument = z.object({
  openapi: z.literal("3.1.0"),
  info: z.object({ title: z.string(), version: z.string() }),
  paths: z.record(z.string(), z.record(z.string(), z.unknown())),
});
