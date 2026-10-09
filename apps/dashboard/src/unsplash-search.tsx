import type { MediaLibraryItem } from "@layered/schemas";
import { Button, Card, Field, Input, Row } from "@layered/ui";
import { MagnifyingGlassIcon, XIcon } from "@layered/ui/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useDashboardApi } from "./dashboard-context.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { refreshMediaQueries } from "./media-uploads.js";
import { CardDialog } from "./modal.js";

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
  const api = useDashboardApi();
  const client = useQueryClient();
  const { text } = useDashboardLanguage();
  const labelId = useId();
  const searchId = useId();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const results = useQuery({
    queryKey: ["unsplash", query, page],
    queryFn: () => api.searchUnsplash(query, page),
    enabled: query !== "",
    retry: false,
  });
  const take = useMutation({
    mutationFn: async (photoId: string) => {
      const imported = await api.importUnsplash(photoId);
      const item = await api.fetchMediaDetail(imported.id);
      await refreshMediaQueries(client);
      return item;
    },
    onSuccess: (item) => onChoose(item),
  });
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
            {page > 1 && (
              <Button onClick={() => setPage((value) => value - 1)}>{text("previousPage")}</Button>
            )}
            {results.data?.hasMore && (
              <Button onClick={() => setPage((value) => value + 1)}>{text("nextPage")}</Button>
            )}
          </>
        }
      />
    </CardDialog>
  );
}
