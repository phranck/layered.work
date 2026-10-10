import { z } from "zod";
import { navigationHref } from "./navigation.js";
import { body, MaxLength, sortOrder, text } from "./request.js";

/** Each slug has an unchanged Simple Icons mark in packages/ui/assets/brands. */
export const SOCIAL_PLATFORMS = ["mastodon", "github", "youtube", "instagram", "xing"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export const SOCIAL_PLATFORM_NAMES: Record<SocialPlatform, string> = {
  mastodon: "Mastodon",
  github: "GitHub",
  youtube: "YouTube",
  instagram: "Instagram",
  xing: "Xing",
};
export const saveSocialAccountBody = body({
  platform: z.enum(SOCIAL_PLATFORMS),
  handle: text(MaxLength.Line),
  href: navigationHref.refine((value) => /^https?:\/\//.test(value), "Use an HTTP(S) account address."),
  enabled: z.boolean(),
  sortOrder,
});
export type SaveSocialAccountBody = z.infer<typeof saveSocialAccountBody>;
export const socialAccount = saveSocialAccountBody.extend({ id: z.uuid() });
export const socialAccountList = z.array(socialAccount);
export type SocialAccount = z.infer<typeof socialAccount>;
