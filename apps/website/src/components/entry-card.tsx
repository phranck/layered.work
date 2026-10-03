import { Card } from "@layered/ui";
import { ArticleIcon } from "@layered/ui/icons";
import {
  dateLabel,
  type Entry,
  type Language,
  type Media,
  readingTime,
  summaryOf,
} from "../content/repository.js";

/** Each language's name, in the language of the page it is named on. */
const LANGUAGE_NAMES: Record<Language, Record<Language, string>> = {
  en: { en: "English", de: "German" },
  de: { en: "Englisch", de: "Deutsch" },
};

/**
 * One composed card for all public collections, with real entry addresses.
 *
 * Given the language of the page it stands on, a card for an entry in the other
 * language says so with a language tag, and marks its text with that language,
 * so a reader knows before opening it and a screen reader pronounces it right.
 */
export function EntryCard({
  entry,
  image,
  language,
  summaryLength,
}: {
  entry: Entry;
  image?: Media;
  language?: Language;
  /** How long the preview text may be, where the overview's settings say. */
  summaryLength?: number;
}) {
  const foreign = language !== undefined && entry.language !== language;
  return (
    <Card.Link href={entry.path} className="entry-card" lang={foreign ? entry.language : undefined}>
      {image && (
        <div className="card__media">
          <img
            src={image.src}
            srcSet={image.srcSet}
            sizes="(max-width: 719px) 100vw, (max-width: 1039px) 50vw, 33vw"
            width={image.width}
            height={image.height}
            alt={image.alt ?? ""}
            loading="lazy"
            decoding="async"
          />
        </div>
      )}
      <Card.Body>
        <div className="entry-card__copy">
          <div className="meta">
            <time dateTime={entry.publishedAt ?? undefined}>{dateLabel(entry)}</time>
            <span>{readingTime(entry)} min</span>
            {foreign && (
              <span
                className="lang-tag"
                data-language={entry.language}
                title={LANGUAGE_NAMES[language][entry.language]}
              >
                {entry.language}
              </span>
            )}
          </div>
          <h3 className="title-card">{entry.title}</h3>
          <p className="entry-card__summary">{summaryOf(entry, summaryLength)}</p>
        </div>
      </Card.Body>
      <Card.Footer
        note={
          <span className="cluster">
            {entry.topics.slice(0, 2).map((topic) => (
              <span className="chip" key={topic}>
                {topic}
              </span>
            ))}
          </span>
        }
        actions={<ArticleIcon weight="duotone" aria-hidden="true" />}
      />
    </Card.Link>
  );
}
