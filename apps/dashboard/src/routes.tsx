import type { DashboardCounts } from "@layered/schemas";
import {
  ArticleIcon,
  ChartLineIcon,
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
} from "@layered/ui/icons";
import type { ComponentType } from "react";
import type { DashboardStringKey } from "./dashboard-i18n.js";

export type CountKey = keyof DashboardCounts;

export interface DashboardArea {
  id: string;
  path: string;
  labelKey: DashboardStringKey;
  countKey?: CountKey;
  icon: ComponentType<IconProps>;
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
      { id: "posts", path: "posts", labelKey: "posts", countKey: "posts", icon: ArticleIcon },
      { id: "pages", path: "pages", labelKey: "pages", countKey: "pages", icon: FilesIcon },
      { id: "tags", path: "tags", labelKey: "tags", countKey: "tags", icon: TagIcon },
      { id: "media", path: "media", labelKey: "media", countKey: "media", icon: ImagesIcon },
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
      { id: "settings", path: "settings", labelKey: "settings", icon: GearIcon },
    ],
  },
];

export const dashboardAreas = dashboardGroups.flatMap((group) => group.areas);
