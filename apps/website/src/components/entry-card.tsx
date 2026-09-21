import { Card } from "@layered/ui";
import { ArticleIcon } from "@layered/ui/icons";
import { dateLabel, type Entry, type Media, readingTime, summaryOf } from "../content/repository.js";

/** One composed card for all public collections, with real entry addresses. */
export function EntryCard({ entry, image }: { entry: Entry; image?: Media }) {
  return (
    <Card.Link href={entry.path} className="entry-card">
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
          </div>
          <h3 className="title-card">{entry.title}</h3>
          <p className="entry-card__summary">{summaryOf(entry)}</p>
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
