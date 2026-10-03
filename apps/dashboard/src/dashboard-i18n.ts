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
  // Entry editor
  editorTitle: "Titel",
  editorTitleMissing: "Ohne Titel",
  editorText: "Text",
  editorTools: "Werkzeuge",
  toolHeading: "Überschrift",
  toolBold: "Fett",
  toolItalic: "Kursiv",
  toolQuote: "Zitat",
  toolList: "Liste",
  toolLink: "Link",
  toolCode: "Code",
  toolLinkText: "Linktext",
  toolPlaceholder: "Text",
  editorPublication: "Veröffentlichung",
  editorState: "Status",
  statePublicNote: "Für alle sichtbar",
  stateDraftNote: "Nur im Dashboard",
  stateHiddenNote: "Nur über den Link erreichbar",
  editorLanguage: "Sprache",
  languageEn: "Englisch",
  languageDe: "Deutsch",
  readingWidth: "Lesebreite",
  readingWidthHint: (characters: number | null) =>
    characters
      ? `Etwa ${characters} Zeichen pro Zeile. Empfohlen sind 45 bis 75, weil das Auge danach den Anfang der nächsten Zeile schlechter findet.`
      : "Ohne Begrenzung. Sinnvoll für Seiten mit breiten Tabellen oder Code, sonst schwerer zu lesen.",
  editorTranslation: "Übersetzung",
  editorTranslationNone: "Gibt es noch nicht.",
  editorOpenCounterpart: (title: string) => `„${title}“ öffnen`,
  editorCreateCounterpart: (language: string) => `Fassung auf ${language} anlegen`,
  editorCreateCounterpartPending: "Wird angelegt…",
  alsoIn: (language: string) => `Auch auf ${language}`,
  preview: "Vorschau",
  previewPending: "Wird vorbereitet…",
  editorTopics: "Themen",
  editorTopicsNone: "Keine Themen.",
  editorTopicsAdd: "Thema hinzufügen",
  editorTopicCreate: (name: string) => `„${name}“ neu anlegen`,
  editorTopicRemove: (name: string) => `„${name}“ entfernen`,
  editorTopicUnnamed: (language: string) => `Noch ohne Namen auf ${language}`,
  publish: "Veröffentlichen",
  publishPending: "Wird veröffentlicht…",
  savedAt: (time: string) => `Gespeichert um ${time}`,
  autosavedAt: (time: string) => `Automatisch gespeichert um ${time}`,
  unsavedChanges: "Ungespeicherte Änderungen",
  leaveTitle: "Ungespeicherte Änderungen",
  leaveBody: "Wenn du jetzt gehst, gehen die Änderungen an diesem Eintrag verloren.",
  stay: "Bleiben",
  discard: "Verwerfen",
  kindPost: "Beitrag",
  kindPage: "Seite",
  kindProject: "Projekt",

  // Topics
  searchTopics: "Themen durchsuchen",
  columnEntries: "Einträge",
  topicsEmpty: "Es gibt noch keine Themen.",
  topicsNoMatch: "Kein Thema passt zur Suche.",
  topicNameMissing: "Fehlt",
  editTopic: "Bearbeiten",
  mergeTopic: "Zusammenführen",
  deleteTopic: "Löschen",
  topicEditTitle: "Thema bearbeiten",
  topicName: (language: string) => `Name auf ${language}`,
  topicSlug: (language: string) => `Adresse auf ${language}`,
  topicSlugHint: "Kleinbuchstaben, Ziffern und Bindestriche. Eine geänderte Adresse leitet weiter.",
  topicLanguageHint: "Beide Felder leer lassen, wenn das Thema in dieser Sprache keinen Namen hat.",
  topicNeedsName: "Mindestens eine Sprache braucht einen Namen.",
  topicIncomplete: "Name und Adresse gehören zusammen: beide ausfüllen oder beide leer lassen.",
  topicSlugInvalid: "Eine Adresse besteht nur aus Kleinbuchstaben, Ziffern und einzelnen Bindestrichen.",
  topicSlugTaken: "Diese Adresse gehört bereits einem anderen Thema.",
  topicMergeTitle: (name: string) => `„${name}“ zusammenführen`,
  topicMergeInto: "Zusammenführen mit",
  topicMergeBody: (count: number, name: string) =>
    `${count === 1 ? "Der Eintrag" : `Alle ${count} Einträge`} mit „${name}“ ${count === 1 ? "bekommt" : "bekommen"} stattdessen das gewählte Thema. „${name}“ verschwindet, und seine Adresse leitet auf das gewählte Thema weiter.`,
  topicMergePending: "Wird zusammengeführt…",
  topicMerged: "Themen zusammengeführt",
  topicDeleteTitle: (name: string) => `„${name}“ löschen`,
  topicDeleteBody: (count: number) =>
    count === 0
      ? "Kein Eintrag hat dieses Thema. Seine Adresse verschwindet von der Website."
      : `${count === 1 ? "Ein Eintrag verliert" : `${count} Einträge verlieren`} dieses Thema. Seine Adresse verschwindet von der Website.`,
  topicDeletePending: "Wird gelöscht…",
  topicDeleted: "Thema gelöscht",

  // Search
  search: "Suche",
  searchEverything: "Einträge und Medien durchsuchen",
  searchResults: "Suchergebnisse",
  searchEntries: "Einträge",
  searchHint: "Findet Einträge nach Titel und Thema, Medien nach Name und Alternativtext.",
  searchNothing: "Nichts gefunden.",
  controlKey: "Strg",

  // Settings
  settingsSite: "Die Site",
  siteTitleEn: "Titel auf Englisch",
  siteTitleDe: "Titel auf Deutsch",
  footerLineEn: "Footer-Zeile auf Englisch",
  footerLineDe: "Footer-Zeile auf Deutsch",
  footerLineHint: "Leer lässt den Footer ohne Zeile.",
  defaultLanguage: "Standardsprache",
  defaultLanguageHint: "Die Sprache, die Besucher bekommen, wenn nichts anderes sie festlegt.",
  socialImage: "Bild für Social Cards",
  socialImageHint: "Erscheint, wenn ein Eintrag kein eigenes Bild hat.",
  socialImageNone: "Kein Bild gewählt.",
  remove: "Entfernen",
  settingsMail: "Absender",
  mailKey: "SMTP2GO-Key",
  mailKeySet: "Gesetzt",
  mailKeyMissing: "Nicht gesetzt",
  mailKeyHint:
    "Der Key ist ein Secret. Er wird nicht hier eingegeben, sondern als Variable SMTP2GO_API_KEY am Backend-Service in Zerops gesetzt.",
  senderAddress: "Absenderadresse",
  senderName: "Absendername",
  mailDomainHint:
    "Damit Mail ankommt, muss die Absenderadresse bei SMTP2GO verifiziert sein, und die Domain braucht die SPF- und DKIM-Einträge, die SMTP2GO nennt.",
  testMail: "Testnachricht senden",
  testMailPending: "Wird gesendet…",
  testMailAccepted: (address: string) => `SMTP2GO hat die Nachricht an ${address} angenommen.`,
  testMailRefused: (address: string) => `SMTP2GO hat die Nachricht an ${address} nicht angenommen.`,
  testMailAnswer: "Antwort von SMTP2GO",
  testMailNeedsSave: "Speichere die Änderungen, bevor du eine Testnachricht sendest.",
  testMailNeedsKey: "Ohne Key kann nichts gesendet werden.",
  testMailNeedsSender: "Speichere eine Absenderadresse, um eine Testnachricht zu senden.",
  settingsAnalytics: "Statistik",
  umamiInstance: "Umami-Instanz",
  umamiWebsiteId: "Website-ID",
  umamiWebsiteIdHint: "Leer schaltet die Statistik ab.",
  ownerOnly: "Nur der Owner kann diese Einstellungen ändern.",
  invalidTitle: "Beide Titel brauchen Text.",
  invalidFooterLine: "Eine Footer-Zeile ist zu lang.",
  invalidSenderAddress: "Die Absenderadresse ist keine gültige E-Mail-Adresse.",
  invalidSenderName:
    "Der Absendername braucht Text und darf weder spitze Klammern noch Anführungszeichen enthalten.",
  invalidWebsiteId: "Die Website-ID ist keine gültige Umami-ID.",

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
  close: "Schließen",
  saved: "Gespeichert",
  translationCreated: (language: string) => `Fassung auf ${language} angelegt`,
  nextPage: "Weiter",
  previousPage: "Zurück",

  // Screens
  unfinished: "Dieser Bereich wird in einem eigenen Arbeitsschritt umgesetzt.",
  notFound: "Seite nicht gefunden",
  notFoundBody: "Für diese Adresse gibt es keinen Dashboard-Bereich.",
  dashboardUnavailable: "Dashboard nicht verfügbar",
  loading: "Wird geladen…",

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
  editorTitle: "Title",
  editorTitleMissing: "Untitled",
  editorText: "Text",
  editorTools: "Tools",
  toolHeading: "Heading",
  toolBold: "Bold",
  toolItalic: "Italic",
  toolQuote: "Quote",
  toolList: "List",
  toolLink: "Link",
  toolCode: "Code",
  toolLinkText: "link text",
  toolPlaceholder: "text",
  editorPublication: "Publication",
  editorState: "Status",
  statePublicNote: "Visible to everyone",
  stateDraftNote: "In the dashboard only",
  stateHiddenNote: "Reachable by its link only",
  editorLanguage: "Language",
  languageEn: "English",
  languageDe: "German",
  readingWidth: "Reading width",
  readingWidthHint: (characters) =>
    characters
      ? `About ${characters} characters per line. 45 to 75 is the usual recommendation, because past that the eye loses the start of the next line.`
      : "No limit. Right for pages of wide tables or code, harder to read otherwise.",
  editorTranslation: "Translation",
  editorTranslationNone: "Not written yet.",
  editorOpenCounterpart: (title) => `Open “${title}”`,
  editorCreateCounterpart: (language) => `Create the ${language} version`,
  editorCreateCounterpartPending: "Creating…",
  alsoIn: (language) => `Also in ${language}`,
  preview: "Preview",
  previewPending: "Preparing…",
  editorTopics: "Topics",
  editorTopicsNone: "No topics.",
  editorTopicsAdd: "Add a topic",
  editorTopicCreate: (name) => `Create “${name}”`,
  editorTopicRemove: (name) => `Remove “${name}”`,
  editorTopicUnnamed: (language) => `No name in ${language} yet`,
  publish: "Publish",
  publishPending: "Publishing…",
  savedAt: (time) => `Saved at ${time}`,
  autosavedAt: (time) => `Saved automatically at ${time}`,
  unsavedChanges: "Unsaved changes",
  leaveTitle: "Unsaved changes",
  leaveBody: "If you leave now, the changes to this entry are lost.",
  stay: "Stay",
  discard: "Discard",
  kindPost: "Post",
  kindPage: "Page",
  kindProject: "Project",

  searchTopics: "Search topics",
  columnEntries: "Entries",
  topicsEmpty: "There are no topics yet.",
  topicsNoMatch: "No topic matches the search.",
  topicNameMissing: "Missing",
  editTopic: "Edit",
  mergeTopic: "Merge",
  deleteTopic: "Delete",
  topicEditTitle: "Edit topic",
  topicName: (language) => `Name in ${language}`,
  topicSlug: (language) => `Address in ${language}`,
  topicSlugHint: "Lower-case letters, digits and hyphens. A changed address redirects.",
  topicLanguageHint: "Leave both fields empty where the topic has no name in this language.",
  topicNeedsName: "At least one language needs a name.",
  topicIncomplete: "A name and an address go together: fill in both or leave both empty.",
  topicSlugInvalid: "An address consists of lower-case letters, digits and single hyphens only.",
  topicSlugTaken: "This address already belongs to another topic.",
  topicMergeTitle: (name) => `Merge “${name}”`,
  topicMergeInto: "Merge into",
  topicMergeBody: (count, name) =>
    `${count === 1 ? "The entry" : `All ${count} entries`} with “${name}” get the chosen topic instead. “${name}” disappears, and its address redirects to the chosen topic.`,
  topicMergePending: "Merging…",
  topicMerged: "Topics merged",
  topicDeleteTitle: (name) => `Delete “${name}”`,
  topicDeleteBody: (count) =>
    count === 0
      ? "No entry has this topic. Its address disappears from the website."
      : `${count === 1 ? "One entry loses" : `${count} entries lose`} this topic. Its address disappears from the website.`,
  topicDeletePending: "Deleting…",
  topicDeleted: "Topic deleted",

  search: "Search",
  searchEverything: "Search entries and media",
  searchResults: "Search results",
  searchEntries: "Entries",
  searchHint: "Finds entries by title and topic, and media by name and alt text.",
  searchNothing: "Nothing found.",
  controlKey: "Ctrl",

  settingsSite: "The site",
  siteTitleEn: "Title in English",
  siteTitleDe: "Title in German",
  footerLineEn: "Footer line in English",
  footerLineDe: "Footer line in German",
  footerLineHint: "Empty leaves the footer without a line.",
  defaultLanguage: "Default language",
  defaultLanguageHint: "The language visitors get when nothing else decides it.",
  socialImage: "Picture for social cards",
  socialImageHint: "Shown when an entry has no picture of its own.",
  socialImageNone: "No picture chosen.",
  remove: "Remove",
  settingsMail: "Sender",
  mailKey: "SMTP2GO key",
  mailKeySet: "Set",
  mailKeyMissing: "Not set",
  mailKeyHint:
    "The key is a secret. It is not entered here but set as the variable SMTP2GO_API_KEY on the backend service in Zerops.",
  senderAddress: "Sender address",
  senderName: "Sender name",
  mailDomainHint:
    "For mail to arrive, the sender address has to be verified at SMTP2GO and the domain needs the SPF and DKIM records SMTP2GO names.",
  testMail: "Send a test message",
  testMailPending: "Sending…",
  testMailAccepted: (address) => `SMTP2GO accepted the message to ${address}.`,
  testMailRefused: (address) => `SMTP2GO did not accept the message to ${address}.`,
  testMailAnswer: "SMTP2GO's answer",
  testMailNeedsSave: "Save your changes before sending a test message.",
  testMailNeedsKey: "Nothing can be sent without a key.",
  testMailNeedsSender: "Save a sender address to send a test message.",
  settingsAnalytics: "Analytics",
  umamiInstance: "Umami instance",
  umamiWebsiteId: "Website ID",
  umamiWebsiteIdHint: "Empty switches analytics off.",
  ownerOnly: "Only the owner can change these settings.",
  invalidTitle: "Both titles need text.",
  invalidFooterLine: "A footer line is too long.",
  invalidSenderAddress: "The sender address is not a valid email address.",
  invalidSenderName: "The sender name needs text and may contain neither angle brackets nor quotation marks.",
  invalidWebsiteId: "The website ID is not a valid Umami ID.",

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
  close: "Close",
  saved: "Saved",
  translationCreated: (language) => `The ${language} version was created`,
  nextPage: "Next",
  previousPage: "Previous",

  unfinished: "This area will be implemented in a separate step.",
  notFound: "Page not found",
  notFoundBody: "There is no dashboard area at this address.",
  dashboardUnavailable: "Dashboard unavailable",
  loading: "Loading…",

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
