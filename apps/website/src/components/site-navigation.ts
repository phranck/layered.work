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
