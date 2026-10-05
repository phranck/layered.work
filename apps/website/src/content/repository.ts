import { COMPONENT_NAMES } from "@layered/content";
import {
  DEFAULT_LISTING,
  type HomeBlock,
  homeBlockSchema,
  homeBlockTypes,
  isKnownHomeBlock,
  type ListedKind,
  listingSettings,
  publicFooterNavigation,
  publicForm,
  publicMainNavigation,
  publicSiteFrame,
  READING_WIDTHS,
  unknownHomeBlocks,
} from "@layered/schemas";
import { z } from "zod";

/** Only canonical site-relative paths can be stored or used as redirects. */
const path = z
  .string()
  .max(512)
  .regex(/^\/(?:[a-zA-Z0-9_-]+\/)*$/);
const slug = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9_-]+$/);
const language = z.enum(["en", "de"]);
const instant = z.string().refine((value) => Number.isFinite(Date.parse(value)), "Invalid date");
const entrySchema = z.object({
  id: z.union([z.number().int(), z.string()]),
  title: z.string(),
  slug,
  path,
  language,
  visibility: z.enum(["public", "hidden", "draft", "trashed"]),
  kind: z.enum(["post", "page", "project"]),
  createdAt: instant.optional(),
  publishedAt: instant.nullable(),
  updatedAt: instant.nullable(),
  summary: z.string().nullish(),
  body: z.string(),
  topics: z.array(z.union([z.number().int(), z.string()]).transform(String)),
  featuredImage: slug.nullish(),
  socialImage: slug.nullish(),
  translationPath: path.nullish(),
  featured: z.boolean().default(false),
  onHomePage: z.boolean().default(true),
  readingWidth: z.enum(READING_WIDTHS).default("normal"),
  /** Listed in the other language as well whilst that language has no version a reader can open. */
  showInOtherLanguage: z.boolean().default(false),
  /**
   * What an entry states about itself beside its prose, as the author's own
   * pairs rather than as fixed fields.
   *
   * A board project names its manufacturing and its electronics; a woodworking
   * one names its timber and its finish. Fixed columns would fit one of those
   * and be empty for the other, so the entry carries what it has and the band
   * shows exactly that.
   *
   * Bounded because the band lays the pairs out in one row per screen width. A
   * ninth pair is a paragraph rather than a specification.
   */
  specs: z
    .array(z.object({ label: z.string().min(1).max(40), value: z.string().min(1).max(80) }))
    .max(8)
    .default([]),
});
const mediaSchema = z.object({
  slug,
  /**
   * The file's storage key with a slash in front, such as `/migration/cover.webp`
   * or `/uploads/tl_WnGQ4duhWJVeRjRqMmQ`, which is where it answers below the
   * media origin. A snapshot written from the export says `/media/…`, which is
   * where the same files lie in `public/`.
   */
  src: z.string().regex(/^\/[a-z]+\/(?!.*\.\.)[a-zA-Z0-9_./-]+$/),
  alt: z.string().optional(),
  caption: z.string().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  srcSet: z.string().optional(),
  mime: z.string().optional(),
  filename: z.string().optional(),
  placeholder: z
    .string()
    .regex(/^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/)
    .optional(),
});
const topicTranslation = z.object({ slug, name: z.string() });
const topicId = z.union([z.number().int(), z.string()]).transform(String);
const topicSchema = z.union([
  z.object({
    id: topicId,
    translations: z
      .object({ en: topicTranslation.nullable(), de: topicTranslation.nullable() })
      .refine((translations) => translations.en !== null || translations.de !== null),
  }),
  // An old backend can answer during the rollout of the new snapshot shape.
  z.object({ id: topicId, slug, name: z.string() }).transform((topic) => ({
    id: topic.id,
    translations: { en: { slug: topic.slug, name: topic.name }, de: null },
  })),
]);
const snapshotSchema = z.object({
  footerNavigation: publicFooterNavigation.optional(),
  mainNavigation: publicMainNavigation.optional(),
  siteFrame: publicSiteFrame.optional(),
  entries: z.array(entrySchema),
  forms: z.array(publicForm).default([]),
  topics: z.array(topicSchema),
  media: z.array(mediaSchema),
  redirects: z.array(z.object({ source: path, target: path })),
  /** Addresses of entries that were deleted, which answer 410 rather than 404. */
  gone: z.array(path).default([]),
  /**
   * How the overviews of posts and projects are set up in the dashboard. A
   * snapshot without them, such as the one committed from the export, uses
   * the defaults.
   */
  listings: z
    .object({ post: listingSettings, project: listingSettings })
    .default({ post: DEFAULT_LISTING, project: DEFAULT_LISTING }),
  homeBlocks: z.array(homeBlockSchema).optional(),
});
export type Language = z.infer<typeof language>;
export type Entry = z.infer<typeof entrySchema>;
export type Media = z.infer<typeof mediaSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type { HomeBlock };

/** A topic as one language of the site presents it. */
export interface TopicView {
  id: string;
  slug: string;
  name: string;
  sourceLanguage: Language;
  untranslated: boolean;
}

/**
 * All collection readers share this publication predicate.
 *
 * A public entry is listed in its own language, and in the other one as well
 * where its author asked for that and the other language has no version a
 * reader can open, which is what an empty `translationPath` says. Once that
 * version is public, it is what the other language lists instead.
 */
export function isListed(entry: Entry, locale: Language): boolean {
  if (entry.visibility !== "public") return false;
  return entry.language === locale || (entry.showInOtherLanguage && !entry.translationPath);
}
/** Query parsing happens once, before values reach output or collection queries. */
export function parseListingQuery(params: URLSearchParams) {
  return z
    .object({
      page: z
        .string()
        .regex(/^[1-9]\d{0,3}$/)
        .transform(Number)
        .default(1),
      query: z
        .string()
        .max(120)
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Reject control characters at the request boundary.
        .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "Control character")
        .default(""),
    })
    .parse({ page: params.get("page") ?? undefined, query: params.get("q") ?? undefined });
}
/**
 * A body with its component calls taken out, so what is left is prose.
 *
 * The names come from the content register rather than from a pattern of their
 * own, so a component added there is removed here without anybody remembering
 * to. A call may carry arguments across several lines, and the closing bracket
 * is matched without regard for one inside a quoted string, which is enough for
 * a summary and would not be for a parser.
 */
function withoutComponents(source: string): string {
  const names = COMPONENT_NAMES.join("|");
  return source.replace(new RegExp(`\\b(?:${names})\\s*\\([^()]*\\)\\s*`, "g"), "");
}

/**
 * An entry's preview text: its summary, or its first paragraph of prose, as
 * plain text and shortened at a word.
 *
 * @param entry - The entry.
 * @param length - The most characters it holds, which an overview's settings
 *   decide for its cards; everywhere else the default.
 */
export function summaryOf(entry: Entry, length: number = DEFAULT_LISTING.previewLength): string {
  const source =
    entry.summary?.trim() ||
    entry.body.split(/\n\s*\n/).find((part) => !/^\s*(?:#|```|[A-Z]\w*\()/.test(part)) ||
    "";
  const plain = withoutComponents(source)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length <= length ? plain : `${plain.slice(0, length).replace(/\s+\S*$/, "")}…`;
}
export function readingTime(entry: Entry): number {
  return Math.max(1, Math.ceil(entry.body.split(/\s+/).length / 220));
}
export function dateLabel(entry: Entry): string {
  return entry.publishedAt
    ? new Intl.DateTimeFormat(entry.language === "de" ? "de-AT" : "en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Europe/Vienna",
      }).format(new Date(entry.publishedAt))
    : "";
}
export function languageRoot(locale: Language): string {
  return locale === "de" ? "/de/" : "/";
}
export function topicPath(locale: Language, topic: string): string {
  return `${languageRoot(locale)}topics/${topic}/`;
}

/**
 * One entry as the overlay sees it.
 *
 * `text` is the same text the listing searches, folded to lower case once here
 * so the overlay can match a keystroke without folding a hundred bodies again.
 * Nothing in it is shown to a reader, which is why the body may sit in it
 * whole.
 */
export interface SearchIndexEntry {
  path: string;
  title: string;
  kind: Entry["kind"];
  text: string;
}

/**
 * Where the media actually are, when they are not beside the site.
 *
 * The database's snapshot records every asset by its storage key, as `/<key>`,
 * and the bucket answers each object at its key below `MEDIA_ORIGIN`, so the
 * address is the two put together. The snapshot committed from the export,
 * which the site falls back to, records `/media/<file>` instead, and that file
 * lies below `migration/` in the bucket.
 *
 * Unset means the path is already the address, which is the local case: the
 * development server answers a key from the directory the backend reads, and
 * `public/` answers the export's `/media/…` paths.
 *
 * Read per call rather than once, so a test can set it and so the value cannot
 * be captured before the environment is complete.
 *
 * @param path - The path as the snapshot records it, `/<storage key>`.
 * @returns The address a browser should ask for.
 */
function mediaUrl(path: string): string {
  const origin = process.env.MEDIA_ORIGIN?.replace(/\/+$/, "");
  if (!origin) return path;
  // A path from the export names the file where the export left it. In the
  // bucket that file lies below the prefix the upload wrote it to.
  return path.startsWith(EXPORT_MEDIA_PREFIX)
    ? `${origin}/${BUCKET_MIGRATION_PREFIX}${path.slice(EXPORT_MEDIA_PREFIX.length)}`
    : `${origin}${path}`;
}

/** Where the export's snapshot says a migrated file is. */
const EXPORT_MEDIA_PREFIX = "/media/";

/**
 * Where `scripts/publii/upload.mjs` put every migrated file in the bucket, which
 * is also the start of its storage key in the database.
 */
const BUCKET_MIGRATION_PREFIX = "migration/";

/**
 * The same, for a `srcset`, which is a list of `<url> <width>w` pairs.
 *
 * @param srcSet - The attribute as the snapshot records it.
 */
function mediaSrcSet(srcSet: string): string {
  return srcSet
    .split(",")
    .map((candidate) => {
      const [url, descriptor] = candidate.trim().split(/\s+/);
      return [mediaUrl(url ?? ""), descriptor].filter(Boolean).join(" ");
    })
    .join(", ");
}

/** Validated read model shared by the migration snapshot and future database adapter. */
export function createRepository(input: unknown) {
  const parsed = snapshotSchema.parse(input);
  const topicIdByEnglishSlug = new Map(
    parsed.topics.flatMap((topic) =>
      topic.translations.en ? [[topic.translations.en.slug, topic.id] as const] : [],
    ),
  );
  const topicIds = new Set(parsed.topics.map((topic) => topic.id));
  const data = {
    ...parsed,
    entries: parsed.entries.map((entry) => ({
      ...entry,
      // Older backend snapshots used English slugs. Resolve them once at the
      // boundary so every collection below compares stable ids.
      topics: entry.topics.map((ref) => (topicIds.has(ref) ? ref : (topicIdByEnglishSlug.get(ref) ?? ref))),
    })),
  };
  const entries = new Map<string, Entry>();
  for (const item of data.entries) {
    if (entries.has(item.path)) throw new Error(`Duplicate entry path: ${item.path}`);
    entries.set(item.path, item);
  }
  const media = new Map(data.media.map((item) => [item.slug, item]));
  if (media.size !== data.media.length) throw new Error("Duplicate media slug");
  const forms = new Map(data.forms.map((item) => [item.slug, item]));
  if (forms.size !== data.forms.length) throw new Error("Duplicate form slug");
  const redirects = new Map(data.redirects.map((item) => [item.source, item.target]));
  const gone = new Set(data.gone);
  for (const source of redirects.keys()) {
    const seen = new Set([source]);
    let target = redirects.get(source);
    while (target && redirects.has(target)) {
      if (seen.has(target)) throw new Error("Redirect cycle");
      seen.add(target);
      target = redirects.get(target);
    }
  }
  const ordered = [...data.entries].sort(
    (a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || a.path.localeCompare(b.path),
  );
  const publicEntries = (locale: Language) => ordered.filter((entry) => isListed(entry, locale));
  const topicById = new Map(data.topics.map((topic) => [topic.id, topic]));
  const topic = (id: string, locale: Language): TopicView | undefined => {
    const found = topicById.get(id);
    if (!found) return undefined;
    const translation = found.translations[locale] ?? found.translations.en ?? found.translations.de;
    if (!translation) return undefined;
    const sourceLanguage = found.translations[locale] ? locale : locale === "en" ? "de" : "en";
    return {
      id,
      ...translation,
      sourceLanguage,
      untranslated: sourceLanguage !== locale,
    };
  };
  const topicBySlug = (locale: Language, wanted: string): TopicView | undefined => {
    const found = data.topics.find(
      (item) => (item.translations[locale] ?? item.translations.en ?? item.translations.de)?.slug === wanted,
    );
    return found ? topic(found.id, locale) : undefined;
  };
  /**
   * Everything a search looks at, for one entry.
   *
   * The listing and the overlay index both read this, so a word found in one is
   * found in the other. Topic names are part of it because a reader looking for
   * "Hardware" means the topic as much as the word in a sentence.
   */
  const searchText = (entry: Entry, locale: Language) =>
    `${entry.title} ${summaryOf(entry)} ${entry.body} ${entry.topics
      .map((id) => topic(id, locale)?.name ?? id)
      .join(" ")}`;
  /**
   * Every block the snapshot declares, known or not, enabled or not.
   *
   * Read by `blocks` and by `unknownBlocks`, so the page and the report are
   * always talking about the same set.
   */
  const declaredBlocks = (): HomeBlock[] =>
    data.homeBlocks?.length
      ? data.homeBlocks
      : homeBlockTypes.map((type, sortOrder) => ({ type, sortOrder, enabled: true, settings: {} }));
  return {
    data,
    footerNavigation: (locale: Language) => data.footerNavigation?.[locale],
    mainNavigation: (locale: Language) => data.mainNavigation?.[locale],
    siteFrame: () => data.siteFrame,
    contentUrl: (url: string) => {
      const path = url.split(/[?#]/, 1)[0] ?? "";
      if (!/^\/(?:media|migration|uploads)\/(?!.*\.\.)[a-zA-Z0-9_./-]+$/.test(path)) return url;
      return `${mediaUrl(path)}${url.slice(path.length)}`;
    },
    media: (name: string) => {
      const asset = media.get(name);
      if (!asset) return undefined;
      return {
        ...asset,
        src: mediaUrl(asset.src),
        ...(asset.srcSet ? { srcSet: mediaSrcSet(asset.srcSet) } : {}),
        sizes: "(max-width: 719px) 100vw, (max-width: 1179px) 92vw, 1092px",
      };
    },
    entry: (name: string) => {
      const entry = entries.get(name);
      return entry && ["public", "hidden"].includes(entry.visibility) ? entry : undefined;
    },
    form: (name: string) => forms.get(name),
    redirect: (name: string) => redirects.get(name),
    /** How the overview of one kind is set up. */
    listing: (kind: ListedKind) => data.listings[kind],
    /** Whether an address belonged to an entry that was deleted. */
    gone: (name: string) => gone.has(name),
    publicEntries,
    topic,
    topicBySlug,
    entryTopics: (entry: Entry, locale: Language): TopicView[] =>
      entry.topics.flatMap((id) => {
        const found = topic(id, locale);
        return found ? [found] : [];
      }),
    list({
      language: locale,
      kind,
      topic,
      query = "",
      page = 1,
    }: {
      language: Language;
      kind?: Entry["kind"];
      topic?: string;
      query?: string;
      page?: number;
    }) {
      // A topic or a search lists posts and projects together, and takes the
      // posts' page size, because posts are most of what it finds.
      const pageSize = data.listings[kind === "project" ? "project" : "post"].pageSize;
      const matches = publicEntries(locale).filter(
        (entry) =>
          (!kind || entry.kind === kind) &&
          (!topic || entry.topics.includes(topic)) &&
          (!query ||
            searchText(entry, locale).toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale))),
      );
      return {
        entries: matches.slice((page - 1) * pageSize, page * pageSize),
        total: matches.length,
        pages: Math.ceil(matches.length / pageSize),
        page,
      };
    },
    /**
     * The overlay's index for one language.
     *
     * Built from `publicEntries`, so a hidden, draft or trashed entry cannot
     * reach it: a body nobody may read must not be searchable
     * either, which is what would happen if this filtered anywhere else.
     */
    searchIndex(locale: Language): SearchIndexEntry[] {
      return publicEntries(locale).map((entry) => ({
        path: entry.path,
        title: entry.title,
        kind: entry.kind,
        text: searchText(entry, locale).toLocaleLowerCase(locale),
      }));
    },
    /**
     * The neighbours of an entry: everything else of its kind, newest first.
     *
     * Distinct from `related`, which answers what an entry has in common with
     * others. A project page closes with the other projects whether or not they
     * share a topic, because the reader is browsing the work rather than
     * following a subject.
     *
     * @param entry - The entry being read, which never appears in the result.
     * @param limit - The most entries to return.
     */
    otherEntries(entry: Entry, limit = 3) {
      return publicEntries(entry.language)
        .filter((other) => other.kind === entry.kind && other.path !== entry.path)
        .slice(0, limit);
    },
    related(entry: Entry) {
      const topics = new Set(entry.topics);
      return publicEntries(entry.language)
        .filter((other) => other.path !== entry.path && other.topics.some((topic) => topics.has(topic)))
        .slice(0, 3);
    },
    topics(locale: Language) {
      return data.topics.flatMap((item) => {
        const localized = topic(item.id, locale);
        if (!localized) return [];
        const count = publicEntries(locale).filter((entry) => entry.topics.includes(item.id)).length;
        return count > 0 ? [{ ...localized, count }] : [];
      });
    },
    /**
     * The home page's blocks, enabled and in order, and only the ones this build renders.
     *
     * A snapshot carrying no blocks at all is a site nobody has arranged in the
     * dashboard yet, so every type appears once on its defaults. That is the
     * current state, and the reason this is never empty.
     */
    blocks(): HomeBlock[] {
      return declaredBlocks()
        .filter((block) => block.enabled && isKnownHomeBlock(block))
        .sort((a, b) => a.sortOrder - b.sortOrder);
    },
    /**
     * The block types in the snapshot that this build cannot render, each once.
     *
     * Empty in the ordinary case. Anything in it means the snapshot names a block
     * this site has never heard of, and the page is quietly shorter than whoever
     * arranged it expects. Returned rather than logged, because only the caller
     * knows where a report belongs.
     */
    unknownBlocks(): string[] {
      return unknownHomeBlocks(declaredBlocks());
    },
  };
}
export type ContentRepository = ReturnType<typeof createRepository>;
