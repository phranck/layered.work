import { z } from "zod";
import type { ContentLanguage } from "./entries.js";
import { focalPoint, mediaProcessingState } from "./media.js";
import { body, emailAddress, MaxLength, text } from "./request.js";

/**
 * The languages the editorial interface speaks, German first, as the account
 * dialog offers them.
 */
// Every one is a language the site is written in, which is what lets the
// accounts table store it in the same column type as an entry's language.
export const INTERFACE_LANGUAGES = ["de", "en"] as const satisfies readonly ContentLanguage[];

/** A language the editorial interface speaks. */
export type InterfaceLanguage = (typeof INTERFACE_LANGUAGES)[number];

/** A language the editorial interface supports. */
export const interfaceLanguage = z.enum(INTERFACE_LANGUAGES);

/**
 * What an account may do. The owner changes the site's settings, and an editor
 * writes. There is one account today, and it is the owner.
 */
export const USER_ROLES = ["owner", "editor"] as const;

/** The signed-in author's editable profile and immutable role. */
export const accountProfile = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  role: z.enum(USER_ROLES),
  interfaceLanguage,
  avatarMediaId: z.uuid().nullable(),
  avatarUrl: z.string().nullable(),
});

export type AccountProfile = z.infer<typeof accountProfile>;

/** Every editable account field, with unknown authority-bearing fields refused. */
export const updateAccountBody = body({
  displayName: text(MaxLength.Line),
  email: emailAddress,
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
  processingState: mediaProcessingState.optional(),
  focalPoint: focalPoint.optional(),
});

export type AccountMediaItem = z.infer<typeof accountMediaItem>;
