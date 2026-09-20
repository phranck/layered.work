import { z } from "zod";
import { body, MaxLength, text } from "./request.js";

/** A language the editorial interface supports. */
const interfaceLanguage = z.enum(["de", "en"]);

/** The signed-in author's editable profile and immutable role. */
export const accountProfile = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  role: z.enum(["owner", "editor"]),
  interfaceLanguage,
  avatarMediaId: z.uuid().nullable(),
  avatarUrl: z.string().nullable(),
});

export type AccountProfile = z.infer<typeof accountProfile>;

/** Every editable account field, with unknown authority-bearing fields refused. */
export const updateAccountBody = body({
  displayName: text(MaxLength.Line),
  email: z.string().trim().toLowerCase().pipe(z.email().max(MaxLength.Line)),
  interfaceLanguage,
  avatarMediaId: z.uuid().nullable(),
});

export type UpdateAccountBody = z.infer<typeof updateAccountBody>;

/** One raster image offered by the account portrait chooser. */
export const accountMediaItem = z.object({
  id: z.uuid(),
  slug: z.string(),
  url: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export type AccountMediaItem = z.infer<typeof accountMediaItem>;

/** A page from the portrait chooser. */
export const accountMediaPage = z.object({
  items: z.array(accountMediaItem),
  page: z.number().int().positive(),
  hasMore: z.boolean(),
});

export type AccountMediaPage = z.infer<typeof accountMediaPage>;

/** Search and page selection accepted by the portrait chooser. */
export const accountMediaQuery = z.object({
  search: z.string().trim().max(MaxLength.Line).default(""),
  page: z.coerce.number().int().positive().max(10_000).default(1),
});

export type AccountMediaQuery = z.infer<typeof accountMediaQuery>;
