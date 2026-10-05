import { DEFAULT_LISTING, publicSnapshot } from "@layered/schemas";
import { expect, it } from "vitest";
import { mainNavigationFromGroups } from "./public.js";

it("preserves the unconfigured state and distinguishes intentionally empty main navigation", () => {
  expect(mainNavigationFromGroups({ en: [], de: [] })).toBeUndefined();
  expect(
    mainNavigationFromGroups({
      en: [{ title: "Main", items: [] }],
      de: [{ title: "Hauptnavigation", items: [] }],
    }),
  ).toEqual({ en: [], de: [] });
  expect(
    mainNavigationFromGroups({
      en: [{ title: "Main", items: [{ label: "Posts", href: "/posts/" }] }],
      de: [{ title: "Hauptnavigation", items: [{ label: "Beiträge", href: "/de/posts/" }] }],
    }),
  ).toEqual({
    en: [{ label: "Posts", href: "/posts/" }],
    de: [{ label: "Beiträge", href: "/de/posts/" }],
  });
});

it("accepts unconfigured and deliberately empty main navigation in the public response contract", () => {
  const snapshot = {
    footerNavigation: { en: [], de: [] },
    siteFrame: { title: { en: "Site", de: "Site" }, footerLine: { en: "", de: "" }, social: [] },
    entries: [],
    forms: [],
    topics: [],
    media: [],
    redirects: [],
    gone: [],
    listings: { post: DEFAULT_LISTING, project: DEFAULT_LISTING },
    homeBlocks: [],
  };
  expect(publicSnapshot.safeParse(snapshot).success).toBe(true);
  expect(publicSnapshot.parse({ ...snapshot, mainNavigation: { en: [], de: [] } }).mainNavigation).toEqual({
    en: [],
    de: [],
  });
});
