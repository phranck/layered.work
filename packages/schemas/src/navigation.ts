import { z } from "zod";
import { body, MaxLength, text } from "./request.js";

const bilingual = <Schema extends z.ZodType>(schema: Schema) => body({ en: schema, de: schema });

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
  label: bilingual(text(MaxLength.Line)),
  visible: bilingual(z.boolean()),
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
  title: bilingual(text(MaxLength.Line)),
  sortOrder: z.number().int().min(0).max(10000),
  items: z.array(savedItem).max(NAVIGATION_ITEMS_MAX),
});
export type SaveFooterNavigationBody = z.infer<typeof saveFooterNavigationBody>;
export const footerNavigation = z.object({
  id: z.uuid(),
  title: bilingual(z.string()),
  sortOrder: z.number().int(),
  items: z.array(z.object({ ...itemFields, id: z.uuid(), label: bilingual(z.string()) })),
});
export const footerNavigationList = z.array(footerNavigation);
export const navigationIdParam = z.object({ id: z.uuid() });
export type FooterNavigation = z.infer<typeof footerNavigation>;
const publicNavigationLink = z.object({ label: z.string(), href: navigationHref });
export const publicNavigationItem = publicNavigationLink.extend({
  children: z.array(publicNavigationLink).optional(),
});
export const publicNavigationGroup = z.object({ title: z.string(), items: z.array(publicNavigationItem) });
export const publicFooterNavigation = bilingual(z.array(publicNavigationGroup));
export const publicMainNavigation = bilingual(z.array(publicNavigationItem));
export type PublicMainNavigation = z.infer<typeof publicMainNavigation>;
export type PublicFooterNavigation = z.infer<typeof publicFooterNavigation>;
export const reorderFooterNavigationBody = body({
  positions: z
    .array(body({ id: z.uuid(), sortOrder: z.number().int().min(0).max(10000) }))
    .min(1)
    .max(100),
}).refine(
  (value) => new Set(value.positions.map((item) => item.id)).size === value.positions.length,
  "Each navigation may be listed once.",
);
