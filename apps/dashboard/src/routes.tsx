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

export type CountKey = keyof DashboardCounts;

export interface DashboardArea {
  id: string;
  path: string;
  label: string;
  countKey?: CountKey;
  icon: ComponentType<IconProps>;
}

export interface DashboardGroup {
  id: string;
  label: string;
  areas: DashboardArea[];
}

export const dashboardGroups: DashboardGroup[] = [
  {
    id: "content",
    label: "Inhalt",
    areas: [
      { id: "posts", path: "posts", label: "Beiträge", countKey: "posts", icon: ArticleIcon },
      { id: "pages", path: "pages", label: "Seiten", countKey: "pages", icon: FilesIcon },
      { id: "tags", path: "tags", label: "Themen", countKey: "tags", icon: TagIcon },
      { id: "media", path: "media", label: "Medien", countKey: "media", icon: ImagesIcon },
    ],
  },
  {
    id: "landing",
    label: "Startseite",
    areas: [{ id: "blocks", path: "blocks", label: "Bausteine", countKey: "blocks", icon: StackSimpleIcon }],
  },
  {
    id: "structure",
    label: "Struktur",
    areas: [
      {
        id: "main-nav",
        path: "main-navigation",
        label: "Hauptnavigation",
        countKey: "mainNav",
        icon: ListIcon,
      },
      {
        id: "footer-nav",
        path: "footer-navigation",
        label: "Footer-Navigationen",
        countKey: "footerNav",
        icon: ListDashesIcon,
      },
      {
        id: "social",
        path: "social-accounts",
        label: "Social-Media-Konten",
        countKey: "social",
        icon: ShareNetworkIcon,
      },
    ],
  },
  {
    id: "forms",
    label: "Formulare",
    areas: [
      { id: "forms", path: "forms", label: "Formulare", countKey: "forms", icon: TextboxIcon },
      {
        id: "submissions",
        path: "submissions",
        label: "Einsendungen",
        countKey: "submissions",
        icon: TrayIcon,
      },
      {
        id: "mail-templates",
        path: "mail-templates",
        label: "E-Mail-Vorlagen",
        countKey: "mailTemplates",
        icon: EnvelopeSimpleIcon,
      },
    ],
  },
  {
    id: "system",
    label: "System",
    areas: [
      { id: "smtp", path: "smtp", label: "SMTP2GO", icon: PaperPlaneTiltIcon },
      { id: "analytics", path: "analytics", label: "Umami", icon: ChartLineIcon },
      { id: "settings", path: "settings", label: "Einstellungen", icon: GearIcon },
    ],
  },
];

export const dashboardAreas = dashboardGroups.flatMap((group) => group.areas);
