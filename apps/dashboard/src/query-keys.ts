import type { EntryKind, MailTemplateKind, NavigationPlacement } from "@layered/schemas";

/**
 * Every key the dashboard caches an answer of the API under.
 *
 * One module for all of them, because a change in one place refreshes queries
 * that belong to another: a topic that is renamed refreshes the entries that
 * carry it, and an upload refreshes every view of the library. A refresh by a
 * prefix reaches exactly the queries whose keys start with it, so each prefix
 * stands here beside the keys built on it, where a reader sees which queries one
 * refresh reaches.
 */

/** The start of every entry list's key, whatever kind it lists. */
const ENTRY_LISTS = ["entries"] as const;

/** The start of every opened translation's key. */
const ENTRY_DETAILS = ["entry"] as const;

/** The start of every key of the media library: each page of it and each file's detail. */
const MEDIA = ["media"] as const;

/** The start of the sidebar's counts, whichever account they were asked for. */
const DASHBOARD_COUNTS = ["dashboard-counts"] as const;

/**
 * The query keys, as values for a key that names one answer and as builders for
 * a key that depends on what is asked.
 *
 * The members starting with `every` are prefixes. They are given to a refresh
 * and never to a query, because they name a family of answers rather than one.
 */
export const queryKeys = {
  /** Who is signed in. */
  session: ["session"] as const,
  /** The signed-in author's account, keyed by the session's account id. */
  account: (accountId: string | undefined) => ["account", accountId] as const,

  /** Every count of the sidebar. */
  everyDashboardCount: DASHBOARD_COUNTS,
  /** The sidebar's counts for one account. */
  dashboardCounts: (accountId: string | undefined) => [...DASHBOARD_COUNTS, accountId] as const,

  /** Every entry list, of each kind. */
  everyEntryList: ENTRY_LISTS,
  /** The list of every translation of one kind. */
  entryList: (kind: EntryKind) => [...ENTRY_LISTS, kind] as const,
  /** Every translation that was opened. */
  everyEntryDetail: ENTRY_DETAILS,
  /** One translation, as the editor opens it. */
  entryDetail: (id: string) => [...ENTRY_DETAILS, id] as const,
  /** What moving one translation to the trash affects. */
  trashImpact: (id: string) => ["trash-impact", id] as const,
  /** Every entry of every kind, as a navigation item offers them as targets. */
  navigationTargetEntries: ["navigation-target-entries"] as const,

  /** Every topic, which the topics screen, the editor's topic field and a navigation item share. */
  topics: ["topics"] as const,
  /** Every named value. */
  namedValues: ["named-values"] as const,
  /** What a search of entries and media found. */
  search: (text: string) => ["search", text] as const,

  /** Every query of the media library. */
  everyMediaQuery: MEDIA,
  /** One page of the library, as the browser filters it. */
  mediaPage: (search: string, kind: string, page: number, unused: boolean) =>
    [...MEDIA, "list", search, kind, page, unused] as const,
  /** One file of the library, with its uses and its processing. */
  mediaDetail: (id: string) => [...MEDIA, "detail", id] as const,
  /** One page of Unsplash photos for a search. */
  unsplash: (search: string, page: number) => ["unsplash", search, page] as const,

  /** Every form. */
  forms: ["forms"] as const,
  /** One form's declaration, keyed by the id in the address. */
  form: (id: string | undefined) => ["form", id] as const,
  /** The submissions of one form. */
  formSubmissions: (formId: string) => ["form-submissions", formId] as const,
  /** Every mail template. */
  mailTemplates: ["mail-templates"] as const,
  /** One mail template, keyed by its kind. */
  mailTemplate: (kind: MailTemplateKind) => ["mail-template", kind] as const,

  /** The groups of one navigation of the site. */
  navigation: (placement: NavigationPlacement) => [`${placement}-navigation`] as const,
  /** The site's social accounts. */
  socialAccounts: ["social-accounts"] as const,
  /** The home page's blocks. */
  homeBlocks: ["home-blocks"] as const,
  /** Every group of the site's settings, which all settings cards share. */
  settings: ["settings"] as const,
  /** The access tokens of the API. */
  accessTokens: ["access-tokens"] as const,
};
