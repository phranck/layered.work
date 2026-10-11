import type { MediaLibraryItem } from "@layered/schemas";
import { Button, Card, Field, Input, Row } from "@layered/ui";
import { MagnifyingGlassIcon, XIcon } from "@layered/ui/icons";
import { useId, useState } from "react";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { useImportUnsplash, useUnsplashSearch } from "./media-query.js";
import { CardDialog } from "./modal.js";
import { PageButtons } from "./page-buttons.js";

/** Props for the Unsplash search. */
interface UnsplashSearchProps {
  /** Receives the library picture a chosen photo became, exactly as an upload's caller does. */
  onChoose: (item: MediaLibraryItem) => void;
  onCancel: () => void;
}

/**
 * Searching Unsplash and taking a photo into the library, from inside the media
 * browser.
 *
 * The search goes through the API, which holds the access key, so nothing here
 * talks to Unsplash except the previews, which Unsplash requires to be loaded
 * from its own addresses. Choosing a photo imports it, which also tells Unsplash
 * it was used, and hands the library picture on the way an upload does, so the
 * picker or the library screen that opened this receives it the same way.
 */
export function UnsplashSearch({ onChoose, onCancel }: UnsplashSearchProps) {
  const { text } = useDashboardLanguage();
  const labelId = useId();
  const searchId = useId();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const results = useUnsplashSearch(query, page);
  const take = useImportUnsplash({ onSuccess: (item) => onChoose(item) });
  return (
    <CardDialog labelId={labelId} onClose={onCancel}>
      <Card.Header id={labelId} title={text("unsplash")} />
      <Card.Body>
        <section className="media-browser">
          <form
            className="media-browser__controls"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setQuery(search.trim());
            }}
          >
            <Field label={text("unsplashSearch")} htmlFor={searchId}>
              <Input
                id={searchId}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </Field>
            <Button type="submit" icon={<MagnifyingGlassIcon />} aria-label={text("unsplashSearch")} />
          </form>
          {results.isError && <ErrorNotice error={results.error} />}
          {take.isError && <ErrorNotice error={take.error} />}
          {(results.isFetching || take.isPending) && <p>{text("loading")}</p>}
          {results.isSuccess && !results.data.items.length && <p>{text("unsplashEmpty")}</p>}
          {results.data && (
            <div className="media-browser__grid">
              {results.data.items.map((photo) => (
                <Row.Button
                  key={photo.id}
                  disabled={take.isPending}
                  onClick={() => take.mutate(photo.id)}
                  title={photo.description ?? photo.photographer}
                >
                  <Row.Tile aria-hidden="true">
                    <img src={photo.thumbnailUrl} alt="" loading="lazy" />
                  </Row.Tile>
                  <Row.Text
                    title={photo.photographer}
                    note={photo.description ?? `${photo.width} × ${photo.height}`}
                  />
                </Row.Button>
              ))}
            </div>
          )}
        </section>
      </Card.Body>
      <Card.Footer
        actions={
          <>
            <Button onClick={onCancel} icon={<XIcon />}>
              {text("cancel")}
            </Button>
            <PageButtons page={page} hasMore={results.data?.hasMore ?? false} onPage={setPage} />
          </>
        }
      />
    </CardDialog>
  );
}
