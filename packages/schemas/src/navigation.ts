import { z } from "zod";
import { inBothLanguages } from "./entries.js";
import { body, MaxLength, sortOrder, text } from "./request.js";

/** Where a navigation appears: the header holds one, the footer several, each with its own heading. */
export const NAVIGATION_PLACEMENTS = ["main", "footer"] as const;

/** One place a navigation appears. */
export type NavigationPlacement = (typeof NAVIGATION_PLACEMENTS)[number];

/**
 * How long a link's address may be, in a navigation and in a social account
 * alike, so the field that takes one can stop where the API would refuse.
 */
export const NAVIGATION_HREF_MAX_LENGTH = 2048;

/** How many links one navigation may hold. */
export const NAVIGATION_ITEMS_MAX = 100;

/** Links are site-relative or HTTP(S); active schemes and ambiguous origins are refused. */
export const navigationHref = z
  .string()
  .trim()
  .max(NAVIGATION_HREF_MAX_LENGTH)
  .refine((value) => {
    if (/\s|\\/.test(value)) return false;
    if (value.startsWith("/") && !value.startsWith("//")) return true;
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  });
const itemFields = {
  label: inBothLanguages(text(MaxLength.Line)),
  visible: inBothLanguages(z.boolean()),
  entryId: z.uuid().nullable(),
  topicId: z.uuid().nullable(),
  href: navigationHref.nullable(),
  parentId: z.uuid().nullable().default(null),
};
const savedItem = body({ id: z.uuid().optional(), ...itemFields }).refine((item) => {
  const count = [item.entryId, item.topicId, item.href].filter((value) => value !== null).length;
  return count === 1 || (count === 0 && item.id !== undefined);
}, "Choose one target for a navigation item.");
export const saveFooterNavigationBody = body({
  title: inBothLanguages(text(MaxLength.Line)),
  sortOrder,
  items: z.array(savedItem).max(NAVIGATION_ITEMS_MAX),
});
export type SaveFooterNavigationBody = z.infer<typeof saveFooterNavigationBody>;
export const footerNavigation = z.object({
  id: z.uuid(),
  title: inBothLanguages(z.string()),
  sortOrder: z.number().int(),
  items: z.array(z.object({ ...itemFields, id: z.uuid(), label: inBothLanguages(z.string()) })),
});
export const footerNavigationList = z.array(footerNavigation);
export type FooterNavigation = z.infer<typeof footerNavigation>;
const publicNavigationLink = z.object({ label: z.string(), href: navigationHref });
export const publicNavigationItem = publicNavigationLink.extend({
  children: z.array(publicNavigationLink).optional(),
});
export const publicNavigationGroup = z.object({ title: z.string(), items: z.array(publicNavigationItem) });
export const publicFooterNavigation = inBothLanguages(z.array(publicNavigationGroup));
export const publicMainNavigation = inBothLanguages(z.array(publicNavigationItem));
export type PublicMainNavigation = z.infer<typeof publicMainNavigation>;
export type PublicFooterNavigation = z.infer<typeof publicFooterNavigation>;
