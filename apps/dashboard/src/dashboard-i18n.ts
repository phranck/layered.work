import { type ErrorCode, MAX_UPLOAD_BYTES } from "@layered/schemas";

/**
 * The dashboard's own language.
 *
 * Separate from the site's languages on purpose: the site's language is what a
 * visitor reads, the dashboard's is what the person editing it works in, so an
 * English post can be written in a German interface.
 *
 * **Both catalogues hold the same keys, and the type check enforces it.** `en`
 * is typed from `de`, so a key that exists in one catalogue only, or an entry
 * whose arguments differ between them, fails `tsc`. That is the gate the global
 * rule needs, because a key missing from one language ships the other
 * language's word into the interface and nothing at runtime notices.
 *
 * Entries that hold a number or a name are functions, so each language builds
 * the whole sentence in its own order rather than gluing fragments together.
 */

/** A language the dashboard interface speaks. */
export const InterfaceLanguage = { German: "de", English: "en" } as const;
export type InterfaceLanguage = (typeof InterfaceLanguage)[keyof typeof InterfaceLanguage];

/**
 * The interface languages as they are offered, each named in itself.
 *
 * Not in the catalogue, because a language's own name is the same whichever
 * language the interface is in: a German reader looking for English looks for
 * "English".
 */
export const DASHBOARD_LANGUAGES = [
  { value: InterfaceLanguage.German, label: "Deutsch" },
  { value: InterfaceLanguage.English, label: "English" },
] as const;

/** The upload limit in megabytes, as the refusal states it. */
const UPLOAD_LIMIT_MB = MAX_UPLOAD_BYTES / 1024 / 1024;

const de = {
  // Areas and their groups in the sidebar
  content: "Inhalt",
  landing: "Startseite",
  structure: "Struktur",
  forms: "Formulare",
  system: "System",
  posts: "Beiträge",
  pages: "Seiten",
  projects: "Projekte",
  tags: "Themen",
  media: "Medien",
  blocks: "Bausteine",
  mainNavigation: "Hauptnavigation",
  footerNavigation: "Footer-Navigationen",
  social: "Social-Media-Konten",
  formSubmissions: "Einsendungen",
  emailTemplates: "E-Mail-Vorlagen",
  smtp: "SMTP2GO",
  analytics: "Umami",
  settings: "Einstellungen",
  dashboardNav: "Dashboard-Bereiche",
  sidebarResize: "Seitenleiste breiter oder schmaler ziehen",
  moveGroup: (group: string) => `„${group}“ verschieben, mit den Pfeiltasten nach oben oder unten`,

  // Session and account
  loadingSession: "Sitzung wird geladen…",
  unavailableSession: "Sitzung nicht verfügbar",
  signedOut: "Nicht angemeldet",
  roleOwner: "Owner",
  roleEditor: "Redaktion",
  account: "Benutzerkonto",
  accountAvatar: "Bild auswählen",
  accountAvatarUpload: "Bild hochladen",
  accountAvatarUploading: "Wird hochgeladen…",
  accountName: "Name",
  accountEmail: "E-Mail-Adresse",
  accountEmailTaken: "Diese E-Mail-Adresse gehört bereits zu einem anderen Konto.",
  accountRole: "Rolle",
  accountLanguage: "Dashboard-Sprache",
  accountLanguageHint: "Gilt nur für diese Oberfläche, nicht für die Website.",
  signOut: "Abmelden",
  signOutPending: "Abmeldung läuft…",

  // Sign-in
  signIn: "Anmelden",
  signInPending: "Anmeldung läuft…",
  signInEmail: "E-Mail-Adresse",
  signInUsername: "Benutzername",
  signInPassword: "Passwort",
  signInCheckEmail: "Bitte prüfe E-Mail-Adresse und Passwort.",
  signInCheckUsername: "Bitte prüfe Benutzername und Passwort.",
  signInRefusedEmail: "E-Mail-Adresse oder Passwort stimmen nicht.",
  signInRefusedUsername: "Benutzername oder Passwort stimmen nicht.",
  sessionExpired: "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.",

  // Entry lists
  statPublished: "Veröffentlicht",
  statPublishedNote: "sichtbar auf der Site",
  statDrafts: "Entwürfe",
  statDraftsNote: "noch nicht freigegeben",
  statHidden: "Versteckt",
  statHiddenNote: "nur über den Link erreichbar",
  statTranslated: "Übersetzt",
  statTranslatedNote: (total: number) => (total === 1 ? "von 1 Eintrag" : `von ${total} Einträgen`),
  columnTitle: "Titel",
  columnState: "Status",
  columnLanguage: "Sprache",
  columnDate: "Datum",
  columnAction: "Aktion",
  searchTitles: "Titel und Themen durchsuchen",
  filterState: "Status",
  filterLanguage: "Sprache",
  filterAll: "Alle",
  statePublic: "Öffentlich",
  stateDraft: "Entwurf",
  stateHidden: "Versteckt",
  editEntry: "Bearbeiten",
  entriesEmpty: "Hier gibt es noch keine Einträge.",
  entriesNoMatch: "Kein Eintrag passt zu Suche und Filter.",
  entryNotFound: "Eintrag nicht gefunden",
  kindPost: "Beitrag",
  kindPage: "Seite",
  kindProject: "Projekt",

  // Search
  search: "Suche",
  searchEverything: "Einträge und Medien durchsuchen",
  searchResults: "Suchergebnisse",
  searchEntries: "Einträge",
  searchHint: "Findet Einträge nach Titel und Thema, Medien nach Name und Alternativtext.",
  searchNothing: "Nichts gefunden.",
  controlKey: "Strg",
  entryNotFoundBody: "Unter dieser Adresse gibt es keinen Eintrag.",

  // Media picker
  mediaPicker: "Bild auswählen",
  mediaSearch: "Bilder durchsuchen",
  mediaEmpty: "Keine Bilder gefunden.",
  mediaLoadError: "Die Medien konnten nicht geladen werden.",
  uploadRefused: `Nur JPEG, PNG, WebP, AVIF und GIF bis ${UPLOAD_LIMIT_MB} MB können hochgeladen werden.`,
  uploadNotSent: "Die Datei konnte nicht gesendet werden.",
  uploadNotAccepted: "Die Datei wurde nicht angenommen.",

  // Actions
  save: "Speichern",
  savePending: "Speichern…",
  cancel: "Abbrechen",
  nextPage: "Weiter",
  previousPage: "Zurück",

  // Screens
  unfinished: "Dieser Bereich wird in einem eigenen Arbeitsschritt umgesetzt.",
  notFound: "Seite nicht gefunden",
  notFoundBody: "Für diese Adresse gibt es keinen Dashboard-Bereich.",
  dashboardUnavailable: "Dashboard nicht verfügbar",

  // Failures
  errorId: "Fehler-ID",
  dataLoadError: "Die Daten konnten nicht geladen werden.",
  serverUnreachable: "Der Server ist nicht erreichbar.",
  serverUnreadable: "Die Antwort des Servers konnte nicht gelesen werden.",
  serverInvalid: "Die Antwort des Servers ist ungültig.",
  serverUnexpected: "Der Server hat unerwartet geantwortet.",
  errorInvalidRequest: "Die Anfrage wurde nicht angenommen, weil eine Angabe nicht gültig ist.",
  errorUnauthenticated: "Dafür ist eine Anmeldung nötig.",
  errorForbidden: "Dafür fehlt diesem Konto die Berechtigung.",
  errorNotFound: "Das Gesuchte gibt es nicht mehr.",
  errorConflict: "Das widerspricht einem bereits gespeicherten Eintrag.",
  errorPayloadTooLarge: "Die Anfrage ist zu groß.",
  errorRateLimited: "Zu viele Anfragen in kurzer Zeit. Bitte warte einen Moment.",
  errorInternal: "Auf dem Server ist ein Fehler aufgetreten.",
};

/** Every key the interface can look up. */
export type DashboardStringKey = keyof typeof de;

/** The arguments an entry takes: none for a plain string, the function's for a sentence. */
export type DashboardStringArgs<Key extends DashboardStringKey> = (typeof de)[Key] extends (
  ...args: infer Args
) => string
  ? Args
  : [];

/** A catalogue with exactly the keys and entry shapes of the German one. */
type Catalogue = {
  [Key in DashboardStringKey]: (typeof de)[Key] extends (...args: infer Args) => string
    ? (...args: Args) => string
    : string;
};

const en: Catalogue = {
  content: "Content",
  landing: "Home page",
  structure: "Structure",
  forms: "Forms",
  system: "System",
  posts: "Posts",
  pages: "Pages",
  projects: "Projects",
  tags: "Topics",
  media: "Media",
  blocks: "Blocks",
  mainNavigation: "Main navigation",
  footerNavigation: "Footer navigations",
  social: "Social media accounts",
  formSubmissions: "Submissions",
  emailTemplates: "Email templates",
  smtp: "SMTP2GO",
  analytics: "Umami",
  settings: "Settings",
  dashboardNav: "Dashboard areas",
  sidebarResize: "Drag to widen or narrow the sidebar",
  moveGroup: (group) => `Move “${group}” up or down with the arrow keys`,

  loadingSession: "Loading session…",
  unavailableSession: "Session unavailable",
  signedOut: "Not signed in",
  roleOwner: "Owner",
  roleEditor: "Editorial",
  account: "User account",
  accountAvatar: "Choose a picture",
  accountAvatarUpload: "Upload a picture",
  accountAvatarUploading: "Uploading…",
  accountName: "Name",
  accountEmail: "Email",
  accountEmailTaken: "This email address already belongs to another account.",
  accountRole: "Role",
  accountLanguage: "Dashboard language",
  accountLanguageHint: "Applies to this interface only, not to the website.",
  signOut: "Sign out",
  signOutPending: "Signing out…",

  signIn: "Sign in",
  signInPending: "Signing in…",
  signInEmail: "Email",
  signInUsername: "Username",
  signInPassword: "Password",
  signInCheckEmail: "Please check the email address and the password.",
  signInCheckUsername: "Please check the username and the password.",
  signInRefusedEmail: "The email address or the password is not correct.",
  signInRefusedUsername: "The username or the password is not correct.",
  sessionExpired: "Your session has expired. Please sign in again.",

  statPublished: "Published",
  statPublishedNote: "visible on the site",
  statDrafts: "Drafts",
  statDraftsNote: "not released yet",
  statHidden: "Hidden",
  statHiddenNote: "reachable by link only",
  statTranslated: "Translated",
  statTranslatedNote: (total) => (total === 1 ? "of 1 entry" : `of ${total} entries`),
  columnTitle: "Title",
  columnState: "Status",
  columnLanguage: "Language",
  columnDate: "Date",
  columnAction: "Action",
  searchTitles: "Search titles and topics",
  filterState: "Status",
  filterLanguage: "Language",
  filterAll: "All",
  statePublic: "Public",
  stateDraft: "Draft",
  stateHidden: "Hidden",
  editEntry: "Edit",
  entriesEmpty: "There are no entries here yet.",
  entriesNoMatch: "No entry matches the search and the filters.",
  entryNotFound: "Entry not found",
  kindPost: "Post",
  kindPage: "Page",
  kindProject: "Project",

  search: "Search",
  searchEverything: "Search entries and media",
  searchResults: "Search results",
  searchEntries: "Entries",
  searchHint: "Finds entries by title and topic, and media by name and alt text.",
  searchNothing: "Nothing found.",
  controlKey: "Ctrl",
  entryNotFoundBody: "There is no entry at this address.",

  mediaPicker: "Choose a picture",
  mediaSearch: "Search pictures",
  mediaEmpty: "No pictures found.",
  mediaLoadError: "Media could not be loaded.",
  uploadRefused: `Only JPEG, PNG, WebP, AVIF and GIF up to ${UPLOAD_LIMIT_MB} MB can be uploaded.`,
  uploadNotSent: "The file could not be sent.",
  uploadNotAccepted: "The file was not accepted.",

  save: "Save",
  savePending: "Saving…",
  cancel: "Cancel",
  nextPage: "Next",
  previousPage: "Previous",

  unfinished: "This area will be implemented in a separate step.",
  notFound: "Page not found",
  notFoundBody: "There is no dashboard area at this address.",
  dashboardUnavailable: "Dashboard unavailable",

  errorId: "Error ID",
  dataLoadError: "The data could not be loaded.",
  serverUnreachable: "The server cannot be reached.",
  serverUnreadable: "The server's answer could not be read.",
  serverInvalid: "The server's answer is not valid.",
  serverUnexpected: "The server answered unexpectedly.",
  errorInvalidRequest: "The request was refused because a value in it is not valid.",
  errorUnauthenticated: "This needs you to be signed in.",
  errorForbidden: "This account is not allowed to do that.",
  errorNotFound: "What you were looking for no longer exists.",
  errorConflict: "This conflicts with an entry that is already stored.",
  errorPayloadTooLarge: "The request is too large.",
  errorRateLimited: "Too many requests in a short time. Please wait a moment.",
  errorInternal: "Something went wrong on the server.",
};

const catalogues: Record<InterfaceLanguage, Catalogue> = { de, en };

/**
 * What the dashboard says for each failure code the API can return.
 *
 * The API's own message is written for any caller and in English, so the
 * dashboard shows its own sentence for the code instead. The code is the stable
 * part of a failure; the message is free to change.
 */
export const ERROR_CODE_TEXT: Record<ErrorCode, DashboardStringKey> = {
  invalid_request: "errorInvalidRequest",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  not_found: "errorNotFound",
  conflict: "errorConflict",
  payload_too_large: "errorPayloadTooLarge",
  rate_limited: "errorRateLimited",
  internal: "errorInternal",
};

/**
 * Looks a string up in one language.
 *
 * A key the catalogue does not hold returns the key itself, so a gap shows on
 * screen as an obvious defect rather than as an empty space nobody notices. The
 * type check makes that rare; a key built at runtime is where it can still
 * happen.
 *
 * @param language - The interface language.
 * @param key - The catalogue key.
 * @param args - Passed to entries that are functions, for the strings that hold
 *   a number or a name.
 */
export function dashboardText<Key extends DashboardStringKey>(
  language: InterfaceLanguage,
  key: Key,
  ...args: DashboardStringArgs<Key>
): string {
  const entry = catalogues[language][key] as string | ((...values: unknown[]) => string) | undefined;
  if (entry === undefined) return key;
  return typeof entry === "function" ? entry(...args) : entry;
}

/**
 * The interface language a visitor who is not signed in gets.
 *
 * The language belongs to the account, and before signing in there is none, so
 * the sign-in screen follows the browser: German where the browser prefers it,
 * English otherwise.
 */
export function browserLanguage(): InterfaceLanguage {
  const preferred = typeof navigator === "undefined" ? [] : (navigator.languages ?? [navigator.language]);
  const first = preferred.find((tag) => /^(de|en)\b/i.test(tag));
  return first?.toLowerCase().startsWith("de") ? InterfaceLanguage.German : InterfaceLanguage.English;
}
