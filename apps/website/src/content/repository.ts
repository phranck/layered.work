import { COMPONENT_NAMES } from "@layered/content";
import {
  type HomeBlock,
  homeBlockSchema,
  homeBlockTypes,
  isKnownHomeBlock,
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
  publishedAt: instant.nullable(),
  updatedAt: instant.nullable(),
  summary: z.string().nullish(),
  body: z.string(),
  topics: z.array(slug),
  featuredImage: slug.nullish(),
  translationPath: path.nullish(),
  featured: z.boolean().default(false),
  onHomePage: z.boolean().default(true),
  readingWidth: z.enum(["narrow", "normal", "wide"]).default("normal"),
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
  src: z.string().regex(/^\/media\/[a-zA-Z0-9_./-]+$/),
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
const snapshotSchema = z.object({
  entries: z.array(entrySchema),
  topics: z.array(z.object({ id: z.union([z.number(), z.string()]), slug, name: z.string() })),
  media: z.array(mediaSchema),
  redirects: z.array(z.object({ source: path, target: path })),
  homeBlocks: z.array(homeBlockSchema).optional(),
});
export type Language = z.infer<typeof language>;
export type Entry = z.infer<typeof entrySchema>;
export type Media = z.infer<typeof mediaSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type { HomeBlock };

/** All collection readers share this publication predicate. */
export function isListed(entry: Entry, locale: Language): boolean {
  return entry.visibility === "public" && entry.language === locale;
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

export function summaryOf(entry: Entry): string {
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
  return plain.length <= 220 ? plain : `${plain.slice(0, 220).replace(/\s+\S*$/, "")}…`;
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
 * The snapshot records every asset as `/media/<file>`, which is where they sit
 * on the machine that produced it. A deployment has no such directory: the
 * files live in the object storage, and `MEDIA_ORIGIN` names the prefix they
 * answer under there. Unset means the paths are already right, which is the
 * local case.
 *
 * Read per call rather than once, so a test can set it and so the value cannot
 * be captured before the environment is complete.
 *
 * @param path - The `/media/...` path as the snapshot records it.
 * @returns The address a browser should ask for.
 */
function mediaUrl(path: string): string {
  const origin = process.env.MEDIA_ORIGIN?.replace(/\/+$/, "");
  return origin ? `${origin}${path.slice("/media".length)}` : path;
}

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
  const data = snapshotSchema.parse(input);
  const entries = new Map<string, Entry>();
  for (const item of data.entries) {
    if (entries.has(item.path)) throw new Error(`Duplicate entry path: ${item.path}`);
    entries.set(item.path, item);
  }
  const media = new Map(data.media.map((item) => [item.slug, item]));
  if (media.size !== data.media.length) throw new Error("Duplicate media slug");
  const redirects = new Map(data.redirects.map((item) => [item.source, item.target]));
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
  const topicNames = new Map(data.topics.map((topic) => [topic.slug, topic.name]));
  /**
   * Everything a search looks at, for one entry.
   *
   * The listing and the overlay index both read this, so a word found in one is
   * found in the other. Topic names are part of it because a reader looking for
   * "Hardware" means the topic as much as the word in a sentence.
   */
  const searchText = (entry: Entry) =>
    `${entry.title} ${summaryOf(entry)} ${entry.body} ${entry.topics
      .map((slug) => topicNames.get(slug) ?? slug)
      .join(" ")}`;
  /**
   * Every block the snapshot declares, known or not, enabled or not.
   *
   * Read by `blocks` and by `unknownBlocks`, so the page and the report are
   * always talking about the same set.
   */
  const declaredBlocks = (): HomeBlock[] =>
    data.homeBlocks ??
    homeBlockTypes.map((type, sortOrder) => ({ type, sortOrder, enabled: true, settings: {} }));
  return {
    data,
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
    redirect: (name: string) => redirects.get(name),
    publicEntries,
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
      const matches = publicEntries(locale).filter(
        (entry) =>
          (!kind || entry.kind === kind) &&
          (!topic || entry.topics.includes(topic)) &&
          (!query || searchText(entry).toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale))),
      );
      return {
        entries: matches.slice((page - 1) * 12, page * 12),
        total: matches.length,
        pages: Math.ceil(matches.length / 12),
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
        text: searchText(entry).toLocaleLowerCase(locale),
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
      return data.topics
        .map((topic) => ({
          ...topic,
          count: publicEntries(locale).filter((entry) => entry.topics.includes(topic.slug)).length,
        }))
        .filter((topic) => topic.count > 0);
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
