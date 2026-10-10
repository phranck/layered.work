import {
  type DashboardCounts,
  type EntryKind,
  LISTED_KINDS,
  LISTING_GROUP,
  type ListedKind,
} from "@layered/schemas";
import {
  ArticleIcon,
  BracketsCurlyIcon,
  ChartLineIcon,
  CodeIcon,
  EnvelopeSimpleIcon,
  FilesIcon,
  GearIcon,
  type IconProps,
  ImagesIcon,
  ListDashesIcon,
  ListIcon,
  PaperPlaneTiltIcon,
  ShareNetworkIcon,
  StackSimpleIcon,
  TagIcon,
  TextboxIcon,
  TrayIcon,
  WrenchIcon,
} from "@layered/ui/icons";
import type { ComponentType } from "react";
import type { DashboardStringKey } from "./dashboard-i18n.js";

export type CountKey = keyof DashboardCounts;

/** The settings group one of the site's overviews is stored under. */
type ListingGroup = (typeof LISTING_GROUP)[ListedKind];

export interface DashboardArea {
  id: string;
  path: string;
  labelKey: DashboardStringKey;
  countKey?: CountKey;
  icon: ComponentType<IconProps>;
  /** The kind of entry this area lists, for the areas that are an entry list. */
  entryKind?: EntryKind;
}

export interface DashboardGroup {
  id: string;
  labelKey: DashboardStringKey;
  areas: DashboardArea[];
}

export const dashboardGroups: DashboardGroup[] = [
  {
    id: "content",
    labelKey: "content",
    areas: [
      {
        id: "posts",
        path: "posts",
        labelKey: "posts",
        countKey: "posts",
        icon: ArticleIcon,
        entryKind: "post",
      },
      {
        id: "pages",
        path: "pages",
        labelKey: "pages",
        countKey: "pages",
        icon: FilesIcon,
        entryKind: "page",
      },
      {
        id: "projects",
        path: "projects",
        labelKey: "projects",
        countKey: "projects",
        icon: WrenchIcon,
        entryKind: "project",
      },
      { id: "tags", path: "tags", labelKey: "tags", countKey: "tags", icon: TagIcon },
      { id: "media", path: "media", labelKey: "media", countKey: "media", icon: ImagesIcon },
      { id: "values", path: "values", labelKey: "values", countKey: "values", icon: BracketsCurlyIcon },
    ],
  },
  {
    id: "landing",
    labelKey: "landing",
    areas: [{ id: "blocks", path: "blocks", labelKey: "blocks", countKey: "blocks", icon: StackSimpleIcon }],
  },
  {
    id: "structure",
    labelKey: "structure",
    areas: [
      {
        id: "main-nav",
        path: "main-navigation",
        labelKey: "mainNavigation",
        countKey: "mainNav",
        icon: ListIcon,
      },
      {
        id: "footer-nav",
        path: "footer-navigation",
        labelKey: "footerNavigation",
        countKey: "footerNav",
        icon: ListDashesIcon,
      },
      {
        id: "social",
        path: "social-accounts",
        labelKey: "social",
        countKey: "social",
        icon: ShareNetworkIcon,
      },
    ],
  },
  {
    id: "forms",
    labelKey: "forms",
    areas: [
      { id: "forms", path: "forms", labelKey: "forms", countKey: "forms", icon: TextboxIcon },
      {
        id: "submissions",
        path: "submissions",
        labelKey: "formSubmissions",
        countKey: "submissions",
        icon: TrayIcon,
      },
      {
        id: "mail-templates",
        path: "mail-templates",
        labelKey: "emailTemplates",
        countKey: "mailTemplates",
        icon: EnvelopeSimpleIcon,
      },
    ],
  },
  {
    id: "system",
    labelKey: "system",
    areas: [
      { id: "smtp", path: "smtp", labelKey: "smtp", icon: PaperPlaneTiltIcon },
      { id: "analytics", path: "analytics", labelKey: "analytics", icon: ChartLineIcon },
      { id: "api-tokens", path: "api-tokens", labelKey: "apiTokens", icon: CodeIcon },
      { id: "settings", path: "settings", labelKey: "settings", icon: GearIcon },
    ],
  },
];

export const dashboardAreas = dashboardGroups.flatMap((group) => group.areas);

/** Each area by its id. */
const AREAS_BY_ID = new Map(dashboardAreas.map((area) => [area.id, area]));

/** The area that lists each kind of entry. */
const ENTRY_AREAS = new Map(
  dashboardAreas.flatMap((area) => (area.entryKind ? [[area.entryKind, area] as const] : [])),
);

/** The area the site's own settings are changed in. */
const SITE_SETTINGS_AREA_ID = "settings";

/**
 * One area, by the id `dashboardGroups` gives it.
 *
 * @throws When no area has that id, which is a mistake in the code asking
 *   rather than anything a reader did.
 */
function areaById(id: string): DashboardArea {
  const area = AREAS_BY_ID.get(id);
  if (!area) throw new Error(`The dashboard has no area ${id}.`);
  return area;
}

/**
 * The area that lists one kind of entry, which is where an entry of that kind
 * opens and where the site's overview of that kind is set up.
 *
 * @param kind - The kind of entry.
 * @throws When no area lists that kind, which is a mistake in `dashboardGroups`.
 */
export function entryArea(kind: EntryKind): DashboardArea {
  const area = ENTRY_AREAS.get(kind);
  if (!area) throw new Error(`No dashboard area lists entries of the kind ${kind}.`);
  return area;
}

/**
 * The address one translation opens at, in the area that lists its kind.
 *
 * @param kind - The kind of its entry.
 * @param id - The translation.
 */
export function entryPath(kind: EntryKind, id: string): string {
  return `/${entryArea(kind).path}/${id}`;
}

/**
 * The area a group of the site's settings is changed in. An overview's group
 * stands on the list of the kind it lists, and the site's own group on the
 * Settings screen.
 *
 * @param group - The settings group.
 */
export function settingsGroupArea(group: "site" | ListingGroup): DashboardArea {
  const listed = LISTED_KINDS.find((kind) => LISTING_GROUP[kind] === group);
  return listed ? entryArea(listed) : areaById(SITE_SETTINGS_AREA_ID);
}

/** Where the media library opens, which is also where a file found by a search is shown. */
export const MEDIA_PATH = `/${areaById("media").path}`;

/**
 * Where the dashboard opens: the list of posts. The logo leads there, and so
 * does a sign-in that names no destination the dashboard may return to.
 */
export const START_PATH = `/${entryArea("post").path}`;
