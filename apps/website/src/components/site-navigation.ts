import type { BrandName } from "@layered/ui";

export interface SiteNavigationItem {
  label: string;
  href: string;
}

export interface SiteFooterData {
  description?: string;
  navigation?: { title: string; items: SiteNavigationItem[] }[];
  social?: { name: string; href: string; brand?: BrandName }[];
  baseline?: string;
  note?: string;
}

/**
 * The site's main navigation in one language.
 *
 * The two things this site is: what was built and what was written about it.
 * Topics is a way through those rather than a third kind of thing, so it sits in
 * the footer, where it still answers the /tags/ addresses the old site published.
 *
 * @param language - The language of the page.
 */
export function siteNavigation(language: "en" | "de"): SiteNavigationItem[] {
  const root = language === "de" ? "/de/" : "/";
  const de = language === "de";
  return [
    { label: de ? "Projekte" : "Projects", href: `${root}projects/` },
    { label: de ? "Beiträge" : "Posts", href: `${root}posts/` },
  ];
}

/**
 * The site's footer in one language.
 *
 * @param language - The language of the page.
 */
export function siteFooter(language: "en" | "de"): SiteFooterData {
  const root = language === "de" ? "/de/" : "/";
  const de = language === "de";
  return {
    description: de
      ? "Gehäuse, Platinen und Software, Schicht für Schicht."
      : "Enclosures, circuit boards and software, made layer by layer.",
    navigation: [
      {
        title: de ? "Entdecken" : "Explore",
        items: [...siteNavigation(language), { label: de ? "Themen" : "Topics", href: `${root}topics/` }],
      },
      {
        title: de ? "Abonnieren" : "Subscribe",
        items: [
          { label: "RSS", href: "/feed.xml" },
          { label: "JSON Feed", href: "/feed.json" },
        ],
      },
    ],
    baseline: "LAYERED.work · Bregenz, Austria",
  };
}

/** Compare complete route segments, so /posts-old never selects /posts. */
export function isCurrentPath(pathname: string, href: string): boolean {
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  const path = pathname.replace(/\/$/, "") || "/";
  const target = href.split(/[?#]/)[0]?.replace(/\/$/, "") || "/";
  return (
    path === target ||
    (target !== "/" && target !== "/de" && target !== "/en" && path.startsWith(`${target}/`))
  );
}
