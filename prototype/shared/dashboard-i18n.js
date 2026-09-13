// The dashboard's own language.
//
// Separate from the site's languages on purpose: the site's language is what a
// visitor reads, the dashboard's is what the person editing it works in. They
// move independently, so an English post can be written in a German workbench.
//
// The catalogues are complete in both languages. A key that exists in one and
// not the other ships an English word into a German interface, which is the one
// failure a missing translation actually produces.

/** The languages the dashboard speaks. */
export const DASHBOARD_LANGUAGES = [
  { id: "de", label: "Deutsch" },
  { id: "en", label: "English" },
];

const STRINGS = {
  de: {
    // Sidebar groups
    "group.content": "Inhalt",
    "group.landing": "Startseite",
    "group.structure": "Struktur",
    "group.forms": "Formulare",
    "group.system": "System",

    // Sidebar entries
    "area.posts": "Beiträge",
    "area.pages": "Seiten",
    "area.tags": "Themen",
    "area.media": "Medien",
    "area.blocks": "Bausteine",
    "area.mainNav": "Hauptnavigation",
    "area.footerNav": "Footer-Navigationen",
    "area.social": "Social-Media-Konten",
    "area.forms": "Formulare",
    "area.submissions": "Einsendungen",
    "area.mailTemplates": "E-Mail-Vorlagen",
    "area.smtp": "SMTP2GO",
    "area.analytics": "Umami",
    "area.settings": "Einstellungen",

    // Headings
    "heading.editorial": "Redaktion",
    "heading.landing": "Startseite",
    "heading.structure": "Struktur",
    "heading.blocks": "Bausteine zusammenstellen",
    "heading.accountTitle": "Benutzerkonto",

    // Statistics
    "stat.published": "Veröffentlicht",
    "stat.publishedNote": "sichtbar auf der Site",
    "stat.drafts": "Entwürfe",
    "stat.draftsNote": "noch nicht freigegeben",
    "stat.hidden": "Versteckt",
    "stat.hiddenNote": "nur über den Link erreichbar",
    "stat.translated": "Übersetzt",
    "stat.translatedNote": (total) => `von ${total} Einträgen`,

    // Table
    "table.title": "Titel",
    "table.status": "Status",
    "table.language": "Sprache",
    "table.created": "Angelegt",
    "table.action": "Aktion",
    "table.search": "Titel durchsuchen",

    // Status
    "status.public": "Öffentlich",
    "status.draft": "Entwurf",
    "status.hidden": "Versteckt",
    "status.secret": "Geschützt",
    "status.publicNote": "Für alle sichtbar",
    "status.draftNote": "Nur im Dashboard",
    "status.hiddenNote": "Nur über den Link",
    "status.secretNote": "Passwort nötig",

    // Actions
    "action.filter": "Filter",
    "action.new": "Neu",
    "action.save": "Speichern",
    "action.cancel": "Abbrechen",
    "action.preview": "Vorschau",
    "action.delete": "Löschen",
    "action.publish": "Veröffentlichen",
    "action.saveDraft": "Entwurf sichern",
    "action.edit": "Bearbeiten",
    "action.navigation": "Navigation",
    "action.account": "Konto",

    // Editor
    "editor.publication": "Veröffentlichung",
    "editor.language": "Sprache",
    "editor.showInOther": "In der anderen Sprache zeigen",
    "editor.translation": "Übersetzung",
    "editor.noTranslation": "Keine verknüpft",
    "editor.translationHint": "Verknüpft beide Fassungen miteinander.",
    "editor.tags": "Themen",
    "editor.addTag": "Thema hinzufügen",
    "editor.shortcodes": "Shortcodes",

    // Landing blocks
    "block.locked": "Steht immer oben",
    "blockType.hero": "Hero",
    "blockType.featured": "Hervorgehoben",
    "blockType.projects": "Projekt-Raster",
    "blockType.posts": "Beitrags-Raster",
    "blockType.tags": "Themen-Leiste",
    "blockType.text": "Textabschnitt",
    "blockType.gallery": "Galerie",
    "blockType.form": "Formular",
    "blockType.model": "3D-Modell",
    "blockType.divider": "Trennlinie",
    "blockSummary.hero": "Titel, Einleitung, zwei Buttons, Bildstapel",
    "blockSummary.featured": "Ein Beitrag, breit gesetzt",
    "blockSummary.projects": "6 Projekte, nach Datum",
    "blockSummary.posts": "6 Beiträge, ohne den hervorgehobenen",
    "blockSummary.tags": "Alle Themen mit Anzahl",

    // Block settings
    "field.headline": "Überschrift",
    "field.intro": "Einleitung",
    "field.eyebrow": "Ortsangabe",
    "field.image": "Bild",
    "field.primaryAction": "Erster Button",
    "field.secondaryAction": "Zweiter Button",
    "field.showStack": "Bildstapel zeigen",
    "field.heading": "Überschrift",
    "field.source": "Auswahl",
    "field.entry": "Eintrag",
    "field.showExcerpt": "Auszug zeigen",
    "field.count": "Anzahl",
    "field.sort": "Sortierung",
    "field.withImageOnly": "Nur mit Bild",
    "field.showAllLink": "Link auf alle zeigen",
    "field.topicFilter": "Thema",
    "field.excludeFeatured": "Hervorgehobenen auslassen",
    "field.minCount": "Mindestanzahl",
    "field.showCounts": "Anzahl je Thema zeigen",
    "option.flagged": "Manuell markiert",
    "option.newest": "Neuester Beitrag",
    "option.pinned": "Angeheftet",
    "option.date": "Nach Datum",
    "option.title": "Nach Titel",
    "option.manual": "Von Hand",
    "option.all": "Alle Themen",
    "option.electronics": "Elektronik",
    "option.software": "Software",
    "block.pickHint": "Jeder Baustein bringt seine eigenen Einstellungen mit.",

    // Site settings
    "setting.reading": "Lesebreite",
    "setting.readingHint": (chars) =>
      chars
        ? `Etwa ${chars} Zeichen pro Zeile. Empfohlen sind 45 bis 75, weil das Auge danach den Anfang der nächsten Zeile schlechter findet.`
        : "Ohne Begrenzung. Sinnvoll für Seiten mit breiten Tabellen oder Code, sonst schwerer zu lesen.",

    // Account
    "account.name": "Name",
    "account.email": "E-Mail",
    "account.role": "Rolle",
    "account.roleAdmin": "Administrator",
    "account.language": "Sprache des Dashboards",
    "account.languageHint": "Gilt nur für diese Oberfläche, nicht für die Website.",
    "account.avatarChange": "Bild wählen",

    // Sidebar
    "sidebar.resize": "Seitenleiste breiter oder schmaler ziehen",

    // Placeholder
    "placeholder.notBuilt": (area) => `Der Bereich „${area}“ ist im Prototyp nicht ausgearbeitet.`,
  },

  en: {
    "group.content": "Content",
    "group.landing": "Home page",
    "group.structure": "Structure",
    "group.forms": "Forms",
    "group.system": "System",

    "area.posts": "Posts",
    "area.pages": "Pages",
    "area.tags": "Topics",
    "area.media": "Media",
    "area.blocks": "Blocks",
    "area.mainNav": "Main navigation",
    "area.footerNav": "Footer navigations",
    "area.social": "Social accounts",
    "area.forms": "Forms",
    "area.submissions": "Submissions",
    "area.mailTemplates": "Email templates",
    "area.smtp": "SMTP2GO",
    "area.analytics": "Umami",
    "area.settings": "Settings",

    "heading.editorial": "Editorial",
    "heading.landing": "Home page",
    "heading.structure": "Structure",
    "heading.blocks": "Arrange the blocks",
    "heading.accountTitle": "Your account",

    "stat.published": "Published",
    "stat.publishedNote": "visible on the site",
    "stat.drafts": "Drafts",
    "stat.draftsNote": "not released yet",
    "stat.hidden": "Hidden",
    "stat.hiddenNote": "reachable by link only",
    "stat.translated": "Translated",
    "stat.translatedNote": (total) => `of ${total} entries`,

    "table.title": "Title",
    "table.status": "Status",
    "table.language": "Language",
    "table.created": "Created",
    "table.action": "Action",
    "table.search": "Search titles",

    "status.public": "Public",
    "status.draft": "Draft",
    "status.hidden": "Hidden",
    "status.secret": "Protected",
    "status.publicNote": "Visible to everyone",
    "status.draftNote": "Dashboard only",
    "status.hiddenNote": "By link only",
    "status.secretNote": "Password required",

    "action.filter": "Filter",
    "action.new": "New",
    "action.save": "Save",
    "action.cancel": "Cancel",
    "action.preview": "Preview",
    "action.delete": "Delete",
    "action.publish": "Publish",
    "action.saveDraft": "Save draft",
    "action.edit": "Edit",
    "action.navigation": "Navigation",
    "action.account": "Account",

    "editor.publication": "Publication",
    "editor.language": "Language",
    "editor.showInOther": "Show in the other language",
    "editor.translation": "Translation",
    "editor.noTranslation": "None linked",
    "editor.translationHint": "Links the two versions to each other.",
    "editor.tags": "Topics",
    "editor.addTag": "Add a topic",
    "editor.shortcodes": "Shortcodes",

    "block.locked": "Always sits at the top",
    "blockType.hero": "Hero",
    "blockType.featured": "Featured",
    "blockType.projects": "Project grid",
    "blockType.posts": "Post grid",
    "blockType.tags": "Topic bar",
    "blockType.text": "Text section",
    "blockType.gallery": "Gallery",
    "blockType.form": "Form",
    "blockType.model": "3D model",
    "blockType.divider": "Divider",
    "blockSummary.hero": "Title, intro, two buttons, image stack",
    "blockSummary.featured": "One post, set wide",
    "blockSummary.projects": "6 projects, by date",
    "blockSummary.posts": "6 posts, without the featured one",
    "blockSummary.tags": "Every topic with its count",

    // Block settings
    "field.headline": "Headline",
    "field.intro": "Intro",
    "field.eyebrow": "Location line",
    "field.image": "Image",
    "field.primaryAction": "First button",
    "field.secondaryAction": "Second button",
    "field.showStack": "Show the image stack",
    "field.heading": "Heading",
    "field.source": "Selection",
    "field.entry": "Entry",
    "field.showExcerpt": "Show the excerpt",
    "field.count": "Count",
    "field.sort": "Order",
    "field.withImageOnly": "With an image only",
    "field.showAllLink": "Show a link to all",
    "field.topicFilter": "Topic",
    "field.excludeFeatured": "Leave out the featured one",
    "field.minCount": "Minimum count",
    "field.showCounts": "Show a count per topic",
    "option.flagged": "Flagged by hand",
    "option.newest": "Newest post",
    "option.pinned": "Pinned",
    "option.date": "By date",
    "option.title": "By title",
    "option.manual": "By hand",
    "option.all": "All topics",
    "option.electronics": "Electronics",
    "option.software": "Software",
    "block.pickHint": "Every block brings settings of its own.",

    // Site settings
    "setting.reading": "Reading width",
    "setting.readingHint": (chars) =>
      chars
        ? `About ${chars} characters per line. 45 to 75 is the usual recommendation, because past that the eye loses the start of the next line.`
        : "No limit. Right for pages of wide tables or code, harder to read otherwise.",

    "account.name": "Name",
    "account.email": "Email",
    "account.role": "Role",
    "account.roleAdmin": "Administrator",
    "account.language": "Dashboard language",
    "account.languageHint": "Applies to this interface only, not to the website.",
    "account.avatarChange": "Choose a picture",

    "sidebar.resize": "Drag to widen or narrow the sidebar",

    "placeholder.notBuilt": (area) => `The “${area}” area is not built out in this prototype.`,
  },
};

/** Where the account's language is kept between visits. */
const LANGUAGE_KEY = "layered.dashboard.language";

let current = (() => {
  const stored = localStorage.getItem(LANGUAGE_KEY);
  return DASHBOARD_LANGUAGES.some((language) => language.id === stored) ? stored : "de";
})();

/** The language the dashboard is currently in. */
export const dashboardLanguage = () => current;

/**
 * Switches the dashboard's language and remembers it.
 *
 * Only sets the value. Re-rendering is the caller's job, because the caller is
 * the one that knows what is on screen and what has unsaved changes in it.
 */
export function setDashboardLanguage(language) {
  if (!DASHBOARD_LANGUAGES.some((candidate) => candidate.id === language)) return;
  current = language;
  localStorage.setItem(LANGUAGE_KEY, language);
  document.documentElement.setAttribute("lang", language);
}

/**
 * Looks a string up in the current language.
 *
 * A missing key returns the key itself, which shows up on screen as an obvious
 * defect rather than as an empty space nobody notices.
 *
 * @param key  The catalogue key.
 * @param args Passed through to entries that are functions, for the few strings
 *             that have to hold a number or a name.
 */
export function t(key, ...args) {
  const entry = STRINGS[current][key];
  if (entry === undefined) return key;
  return typeof entry === "function" ? entry(...args) : entry;
}
