import {
  CONTENT_LANGUAGES,
  inEachLanguage,
  LANGUAGE_ROOTS,
  LISTED_KINDS,
  LISTING_PATHS,
  languagePath,
} from "@layered/schemas";
import { type ContentRepository, type Language, topicPath } from "./repository.js";

export interface LanguageLink {
  language: Language | "x-default";
  path: string;
}
const languages = CONTENT_LANGUAGES;
const topicsPage = inEachLanguage((language) => languagePath(language, "topics"));
const pairedPages = [
  LANGUAGE_ROOTS,
  topicsPage,
  inEachLanguage((language) => languagePath(language, "search")),
  ...LISTED_KINDS.map((kind) => LISTING_PATHS[kind]),
];

/** Only mutually paired public entries and reachable public collections advertise translations. */
export function languageLinks(repository: ContentRepository, path: string): LanguageLink[] {
  const entry = repository.entry(path);
  let links: LanguageLink[] = [];
  if (entry) {
    if (entry.visibility !== "public") return [];
    links.push({ language: entry.language, path: entry.path });
    const other = entry.translationPath ? repository.entry(entry.translationPath) : undefined;
    if (
      other?.visibility === "public" &&
      other.language !== entry.language &&
      other.translationPath === entry.path
    ) {
      links.push({ language: other.language, path: other.path });
    }
  } else {
    const paired = pairedPages.find((page) => page.en === path || page.de === path);
    if (paired) links = languages.map((language) => ({ language, path: paired[language] }));
    else {
      const topic = languages
        .flatMap((language) => repository.topics(language).map((topic) => ({ language, topic })))
        .find(({ language, topic }) => topicPath(language, topic.slug) === path)?.topic;
      if (topic)
        links = languages.flatMap((language) => {
          const localized = repository.topics(language).find((other) => other.id === topic.id);
          return localized ? [{ language, path: topicPath(language, localized.slug) }] : [];
        });
    }
  }
  if (!links.length) return [];
  links.sort((a, b) => (a.language === "en" ? -1 : b.language === "en" ? 1 : 0));
  const fallback = links.find((link) => link.language === "en") ?? links[0];
  return fallback ? [...links, { language: "x-default", path: fallback.path }] : [];
}

/** The actual overview routes, shared by both language sitemaps. Search results are not indexed. */
export const collectionPaths = languages.flatMap((language) => [
  LANGUAGE_ROOTS[language],
  ...LISTED_KINDS.map((kind) => LISTING_PATHS[kind][language]),
  topicsPage[language],
]);
