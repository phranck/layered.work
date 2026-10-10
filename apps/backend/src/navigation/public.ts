import {
  CONTENT_LANGUAGES,
  type ContentLanguage,
  languagePath,
  type NavigationPlacement,
  navigationHref,
  type PublicFooterNavigation,
  type PublicMainNavigation,
} from "@layered/schemas";
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../db/connect.js";
import {
  navigationItems,
  navigationItemTranslations,
  navigations,
  navigationTranslations,
} from "../db/schema/index.js";

/** Project stored main groups without confusing missing configuration with an empty saved group. */
export function mainNavigationFromGroups(groups: PublicFooterNavigation): PublicMainNavigation | undefined {
  if (groups.en.length === 0 && groups.de.length === 0) return undefined;
  return {
    en: groups.en.flatMap((group) => group.items),
    de: groups.de.flatMap((group) => group.items),
  };
}

/** Resolve stored targets only against published addresses in the requested language. */
export async function readPublicNavigation(
  db: Database,
  entries: readonly { entryId: string; language: ContentLanguage; path: string }[],
  topics: readonly {
    id: string;
    translations: { en: { slug: string } | null; de: { slug: string } | null };
  }[],
  placement: NavigationPlacement,
): Promise<PublicFooterNavigation> {
  const result: PublicFooterNavigation = { en: [], de: [] };
  for (const language of CONTENT_LANGUAGES) {
    const groups = await db
      .select({ id: navigations.id, title: navigationTranslations.title })
      .from(navigations)
      .leftJoin(
        navigationTranslations,
        and(
          eq(navigationTranslations.navigationId, navigations.id),
          eq(navigationTranslations.language, language),
        ),
      )
      .where(eq(navigations.placement, placement))
      .orderBy(asc(navigations.sortOrder), asc(navigations.id));
    const items = await db
      .select({
        id: navigationItems.id,
        navigationId: navigationItems.navigationId,
        parentId: navigationItems.parentId,
        entryId: navigationItems.entryId,
        topicId: navigationItems.topicId,
        href: navigationItems.href,
        label: navigationItemTranslations.label,
      })
      .from(navigationItems)
      .innerJoin(navigations, eq(navigations.id, navigationItems.navigationId))
      .innerJoin(
        navigationItemTranslations,
        and(
          eq(navigationItemTranslations.itemId, navigationItems.id),
          eq(navigationItemTranslations.language, language),
          eq(navigationItemTranslations.visible, true),
        ),
      )
      .where(eq(navigations.placement, placement))
      .orderBy(asc(navigationItems.sortOrder), asc(navigationItems.id));
    const addresses = new Map(
      entries.filter((entry) => entry.language === language).map((entry) => [entry.entryId, entry.path]),
    );
    const topicAddresses = new Map(
      topics.flatMap((topic) => {
        const translation = topic.translations[language];
        return translation ? [[topic.id, languagePath(language, "topics", translation.slug)] as const] : [];
      }),
    );
    const resolved = new Map(
      items.flatMap((item) => {
        const href = item.entryId
          ? addresses.get(item.entryId)
          : item.topicId
            ? topicAddresses.get(item.topicId)
            : item.href;
        return href && item.label.trim() && navigationHref.safeParse(href).success
          ? [[item.id, { label: item.label, href }] as const]
          : [];
      }),
    );
    result[language] = groups
      .filter((group) => placement === "main" || group.title?.trim())
      .map((group) => ({
        title: group.title ?? "",
        items:
          placement === "main"
            ? items
                .filter((item) => item.navigationId === group.id && !item.parentId)
                .flatMap((item) => {
                  const link = resolved.get(item.id);
                  if (!link) return [];
                  const children = items
                    .filter((child) => child.navigationId === group.id && child.parentId === item.id)
                    .flatMap((child) => {
                      const target = resolved.get(child.id);
                      return target ? [target] : [];
                    });
                  return [{ ...link, ...(children.length ? { children } : {}) }];
                })
            : items
                .filter(
                  (item) => item.navigationId === group.id && (!item.parentId || resolved.has(item.parentId)),
                )
                .flatMap((item) => {
                  const link = resolved.get(item.id);
                  return link ? [link] : [];
                }),
      }));
  }
  return result;
}
