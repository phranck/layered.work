import { z } from "zod";
import type { ContentLanguage } from "./entries.js";
import { body, MaxLength } from "./request.js";

/**
 * Every kind of block the home page can be built from.
 *
 * One list, read by the database enum that constrains what may be stored and by
 * the snapshot schema the website parses. They were written out separately once
 * and four of the five names had already drifted apart, which nothing could see:
 * the website renders a block it does not recognise as nothing at all, so the
 * page simply arrives shorter than it should.
 *
 * Adding a type here is half the work. The website has to render it, and
 * `unknownHomeBlocks` is what says so when it does not.
 */
export const homeBlockTypes = ["hero", "featured_entry", "project_grid", "post_grid", "topic_bar"] as const;

/** One kind of home page block, as a type. */
export type HomeBlockType = (typeof homeBlockTypes)[number];

/** A text in each of the site's languages. */
export type BilingualText = Record<ContentLanguage, string>;

/** How many entries a grid may show. */
export const HOME_GRID_LIMIT = { min: 1, max: 24 } as const;

/**
 * The shape the site gives a picture a setting names, which the dashboard shows
 * the picture in.
 *
 * - `sharing`: the card of a shared link, 1200 by 630, which the platforms crop
 *   around the middle whatever the picture's focal point says.
 * - `home-plate`: the plate the home page's hero shows, cropped around the
 *   picture's focal point.
 * - `whole`: the picture uncropped, as a watermark is laid into a picture.
 */
export type PictureShape = "sharing" | "home-plate" | "whole";

/**
 * One setting a block declares: its key, what kind of value it holds, and what
 * the block does without one.
 *
 * The kind is what the dashboard draws a control from and what the API checks a
 * value against, so a setting added here appears in the dashboard and is
 * validated with no other code. A text is written in both languages, and an
 * empty one shows `fallback`, which the dashboard offers as the field's
 * placeholder. A picture names the shape the site shows it in.
 */
export type HomeBlockSetting =
  | { key: string; kind: "line"; fallback: BilingualText }
  | { key: string; kind: "paragraph"; fallback: BilingualText }
  | { key: string; kind: "number"; min: number; max: number; default: number }
  | { key: string; kind: "flag"; default: boolean }
  | { key: string; kind: "choice"; options: readonly [string, ...string[]]; default: string }
  | { key: string; kind: "picture"; shape: PictureShape };

/**
 * Whether the countdown's sky of nodes is drawn behind a block.
 *
 * Every kind of block declares it, and it is off unless somebody switches it on,
 * so a page arranged before it existed looks as it did.
 */
const SKY_SETTING: HomeBlockSetting = { key: "sky", kind: "flag", default: false };

/** What one kind of block is and what it can be set to. */
export interface HomeBlockDeclaration {
  /**
   * The block opens the page: it stays first, cannot be moved, removed or added
   * a second time, and is always present.
   */
  locked: boolean;
  settings: readonly HomeBlockSetting[];
}

/**
 * What each kind of block can be set to.
 *
 * The fallback texts are the ones the site showed before any of this could be
 * set, so a block on its defaults reads as it always has.
 */
export const HOME_BLOCKS: Readonly<Record<HomeBlockType, HomeBlockDeclaration>> = {
  hero: {
    locked: true,
    settings: [
      { key: "eyebrow", kind: "line", fallback: { en: "Bregenz, Vorarlberg", de: "Bregenz, Vorarlberg" } },
      {
        key: "title",
        kind: "line",
        fallback: {
          en: "Enclosures, circuit boards and software, made layer by layer.",
          de: "Gehäuse, Platinen und Software, die Schicht für Schicht entsteht.",
        },
      },
      {
        key: "description",
        kind: "paragraph",
        fallback: {
          en: "Small recreations of NeXT hardware, 3D-printed Raspberry Pi enclosures and the software made along the way. Documented so you can build them, too.",
          de: "Nachbauten der NeXT-Hardware in klein, Raspberry-Pi-Gehäuse aus dem eigenen Drucker und das, was beim Bauen an Software anfällt. Alles dokumentiert, damit es jemand nachbauen kann.",
        },
      },
      { key: "showPicture", kind: "flag", default: true },
      { key: "picture", kind: "picture", shape: "home-plate" },
      SKY_SETTING,
    ],
  },
  featured_entry: {
    locked: false,
    settings: [
      {
        key: "title",
        kind: "line",
        fallback: { en: "From the workbench", de: "Woran gerade gearbeitet wird" },
      },
      { key: "source", kind: "choice", options: ["featured", "newest"], default: "featured" },
      SKY_SETTING,
    ],
  },
  project_grid: {
    locked: false,
    settings: [
      {
        key: "title",
        kind: "line",
        fallback: { en: "Built, printed, soldered", de: "Gebaut, gedruckt, gelötet" },
      },
      { key: "limit", kind: "number", ...HOME_GRID_LIMIT, default: 6 },
      { key: "order", kind: "choice", options: ["newest", "oldest", "title"], default: "newest" },
      SKY_SETTING,
    ],
  },
  post_grid: {
    locked: false,
    settings: [
      {
        key: "title",
        kind: "line",
        fallback: { en: "Notes from the workshop", de: "Notizen aus der Werkstatt" },
      },
      { key: "limit", kind: "number", ...HOME_GRID_LIMIT, default: 6 },
      { key: "order", kind: "choice", options: ["newest", "oldest", "title"], default: "newest" },
      { key: "excludeFeatured", kind: "flag", default: false },
      SKY_SETTING,
    ],
  },
  topic_bar: {
    locked: false,
    settings: [
      { key: "title", kind: "line", fallback: { en: "Browse by topic", de: "Themen im Archiv" } },
      { key: "showCounts", kind: "flag", default: true },
      SKY_SETTING,
    ],
  },
};

/** The longest text each kind of text setting accepts. */
const TEXT_LIMIT = { line: MaxLength.Line, paragraph: MaxLength.Paragraph } as const;

/**
 * What one setting's value has to look like.
 *
 * A picture is saved as the id of a file in the library, and the snapshot hands
 * it to the site as that file's slug, because the site knows its files by slug.
 * Reading accepts either; saving accepts the id only.
 *
 * @param setting - The declaration.
 * @param saving - Whether the value is about to be stored rather than read.
 */
function settingSchema(setting: HomeBlockSetting, saving: boolean): z.ZodType {
  switch (setting.kind) {
    case "line":
    case "paragraph": {
      const text = z.string().trim().max(TEXT_LIMIT[setting.kind]);
      return body({ en: text, de: text });
    }
    case "number":
      return z.number().int().min(setting.min).max(setting.max);
    case "flag":
      return z.boolean();
    case "choice":
      return z.enum(setting.options);
    case "picture":
      return saving ? z.uuid().nullable() : z.string().min(1).max(MaxLength.Line).nullable();
  }
}

/** A setting's value when nothing is stored, or what is stored no longer fits. */
function emptyValue(setting: HomeBlockSetting): unknown {
  switch (setting.kind) {
    case "line":
    case "paragraph":
      return { en: "", de: "" };
    case "picture":
      return null;
    default:
      return setting.default;
  }
}

/** The values of a block's settings, by key. */
export type HomeBlockSettings = Record<string, unknown>;

/**
 * Every setting a type declares, each one required, and nothing else.
 *
 * What the API checks a save against and what the dashboard checks a draft
 * against before sending it, so the two refuse the same values.
 *
 * @param type - The block's type.
 */
export function homeBlockSettingsSchema(type: HomeBlockType) {
  return body(
    Object.fromEntries(
      HOME_BLOCKS[type].settings.map((setting) => [setting.key, settingSchema(setting, true)]),
    ),
  );
}

/**
 * A block's settings with every declared key present.
 *
 * A key that is missing, or that holds a value its declaration no longer
 * accepts, takes its empty value, so a block stored before a setting existed
 * reads as one on its defaults. Keys the declaration does not name are left
 * out.
 *
 * @param type - The block's type.
 * @param stored - What the database or the snapshot holds.
 */
export function homeBlockSettings(type: HomeBlockType, stored: unknown): HomeBlockSettings {
  const values = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  return Object.fromEntries(
    HOME_BLOCKS[type].settings.map((setting) => {
      const parsed = settingSchema(setting, false).safeParse(values[setting.key]);
      return [setting.key, parsed.success ? parsed.data : emptyValue(setting)];
    }),
  );
}

/**
 * The declaration of one setting of one type.
 *
 * @throws When the type declares no such key, which is a mistake in the code
 *   reading it rather than in anything stored.
 */
function declaration(type: HomeBlockType, key: string): HomeBlockSetting {
  const found = HOME_BLOCKS[type].settings.find((setting) => setting.key === key);
  if (!found) throw new Error(`The ${type} block declares no setting ${key}.`);
  return found;
}

/**
 * A text setting as the site shows it in one language: what was written, or
 * the fallback where nothing was.
 *
 * @param type - The block's type.
 * @param settings - The block's settings, from `homeBlockSettings`.
 * @param key - A `line` or `paragraph` setting.
 * @param language - The page's language.
 */
export function homeBlockText(
  type: HomeBlockType,
  settings: HomeBlockSettings,
  key: string,
  language: keyof BilingualText,
): string {
  const setting = declaration(type, key);
  if (setting.kind !== "line" && setting.kind !== "paragraph") throw new Error(`${key} is not a text.`);
  const written = (settings[key] as BilingualText | undefined)?.[language]?.trim();
  return written || setting.fallback[language];
}

/**
 * One block of the home page, as the snapshot carries it.
 *
 * `type` stays a plain string rather than an enum, because a snapshot written by
 * a newer dashboard may name a block this build has never heard of. Refusing the
 * whole snapshot over one unknown block would take the site down to keep one
 * section off it, so the unknown ones are separated out and reported instead.
 *
 * @property enabled - A block the dashboard has switched off, kept so its settings survive.
 * @property sortOrder - Ascending, and the order the page is assembled in.
 * @property settings - Whatever the block's type declares, read through `homeBlockSettings`.
 */
export const homeBlockSchema = z.object({
  type: z.string(),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int(),
  settings: z.record(z.string(), z.unknown()).default({}),
});

/** One block of the home page, whether or not this build can render it. */
export type HomeBlock = z.infer<typeof homeBlockSchema>;

/**
 * Whether a block names a type this build knows how to render.
 *
 * @param block - Any block from the snapshot.
 */
export function isKnownHomeBlock(block: HomeBlock): block is HomeBlock & { type: HomeBlockType } {
  return (homeBlockTypes as readonly string[]).includes(block.type);
}

/**
 * The type names among the given blocks that this build cannot render, each once.
 *
 * Returned rather than logged, so the caller decides what to do with them: the
 * website writes them to its log, and a dashboard that lets somebody order these
 * blocks can say which of them will not appear.
 *
 * @param blocks - The blocks from the snapshot, enabled or not.
 * @returns The unknown type names, sorted, with no duplicates.
 */
export function unknownHomeBlocks(blocks: readonly HomeBlock[]): string[] {
  return [...new Set(blocks.filter((block) => !isKnownHomeBlock(block)).map((block) => block.type))].sort();
}

/** One stored block, as the dashboard reads and edits it. */
export const homeBlock = z.object({
  id: z.uuid(),
  type: z.enum(homeBlockTypes),
  enabled: z.boolean(),
  sortOrder: z.number().int(),
  settings: z.record(z.string(), z.unknown()),
});
export type StoredHomeBlock = z.infer<typeof homeBlock>;
export const homeBlockList = z.array(homeBlock);

/** A new block of one type, which arrives on its defaults at the end of the page. */
export const addHomeBlockBody = body({ type: z.enum(homeBlockTypes) });
export type AddHomeBlockBody = z.infer<typeof addHomeBlockBody>;

/**
 * What a save sends: whether the block is on the page, and its settings.
 *
 * The settings are checked against the stored block's own declaration by the
 * API, which knows the type, and against `homeBlockSettingsSchema` by the
 * dashboard before sending. The type itself cannot change.
 */
export const saveHomeBlockBody = body({
  enabled: z.boolean(),
  settings: z.record(z.string(), z.unknown()),
});
export type SaveHomeBlockBody = z.infer<typeof saveHomeBlockBody>;
