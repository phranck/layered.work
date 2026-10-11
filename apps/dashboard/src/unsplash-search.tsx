import type { MediaLibraryItem } from "@layered/schemas";
import { Card } from "@layered/ui";
import { useId, useState } from "react";
import { ActionButton } from "./action-button.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { useImportUnsplash, useUnsplashSearch } from "./media-query.js";
import { CardDialog } from "./modal.js";
import { PageButtons } from "./page-buttons.js";
import { PictureSearch } from "./picture-search.js";

/** Props for the Unsplash search. */
interface UnsplashSearchProps {
  /** Receives the library picture a chosen photo became, exactly as an upload's caller does. */
  onChoose: (item: MediaLibraryItem) => void;
  onCancel: () => void;
}

/**
 * Searching Unsplash and taking a photo into the library, from inside the media
 * browser, with the same search, grid and paging the library has.
 *
 * The search goes through the API, which holds the access key, so nothing here
 * talks to Unsplash except the previews, which Unsplash requires to be loaded
 * from its own addresses. It asks when Return is pressed rather than as the
 * typing pauses, because every search is a request against the key's hourly
 * allowance. Choosing a photo imports it, which also tells Unsplash it was
 * used, and hands the library picture on the way an upload does, so the picker
 * or the library screen that opened this receives it the same way.
 */
export function UnsplashSearch({ onChoose, onCancel }: UnsplashSearchProps) {
  const { text } = useDashboardLanguage();
  const labelId = useId();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const results = useUnsplashSearch(query, page);
  const take = useImportUnsplash({ onSuccess: (item) => onChoose(item) });
  return (
    <CardDialog labelId={labelId} onClose={onCancel}>
      <Card.Header id={labelId} title={text("unsplash")} />
      <PictureSearch.Controls
        label={text("unsplashSearch")}
        value={search}
        onChange={setSearch}
        onSubmit={() => {
          setPage(1);
          setQuery(search.trim());
        }}
      >
        {take.isError && <ErrorNotice error={take.error} />}
      </PictureSearch.Controls>
      <PictureSearch.Results query={results} empty={text("unsplashEmpty")} busy={take.isPending}>
        {(photo) => (
          <PictureSearch.Item
            key={photo.id}
            title={photo.description ?? photo.photographer}
            note={photo.description ? photo.photographer : `${photo.width} × ${photo.height}`}
            thumbnail={photo.thumbnailUrl}
            disabled={take.isPending}
            onChoose={() => take.mutate(photo.id)}
          />
        )}
      </PictureSearch.Results>
      <Card.Footer
        actions={
          <>
            <ActionButton action="cancel" onClick={onCancel}>
              {text("cancel")}
            </ActionButton>
            <PageButtons page={page} hasMore={results.data?.hasMore ?? false} onPage={setPage} />
          </>
        }
      />
    </CardDialog>
  );
}
