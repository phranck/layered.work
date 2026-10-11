import { ACCEPTED_IMAGE_TYPES, MEDIA_KINDS, type MediaLibraryItem } from "@layered/schemas";
import { Card, Field, imagePosition, Select, Switch } from "@layered/ui";
import { useId, useState } from "react";
import { ActionButton } from "./action-button.js";
import { fileSize, formatInstant } from "./format.js";
import { useDashboardLanguage } from "./language-context.js";
import { MediaDetailDialog } from "./media-detail.js";
import { PROCESSING_TEXT } from "./media-processing.js";
import { MEDIA_KIND_TEXT, useMediaPage, useMediaUploads } from "./media-query.js";
import { FileChooserButton, MediaUploadProgress } from "./media-uploads.js";
import { PageButtons } from "./page-buttons.js";
import { PictureSearch } from "./picture-search.js";
import { useSettledValue } from "./settled-value.js";
import { UnsplashSearch } from "./unsplash-search.js";

/** How long typing has to pause before the library is asked again, in milliseconds. */
const SEARCH_DELAY_MS = 300;

/** Props for the media library. */
interface MediaBrowserProps {
  /** Chooses a file rather than opening it, which makes the browser a picker. */
  onChoose?: (slug: string, item: MediaLibraryItem) => void;
  /** Closes the picker. */
  onCancel?: () => void;
  /** Offers pictures alone, for a field that holds one. */
  imageOnly?: boolean;
  /** The id the header's title takes, for the dialog the picker stands in. */
  labelId?: string;
}

/**
 * The media library, as its own screen and as the picker a picture field
 * opens: a search that follows the typing, the filters, uploads by button and
 * by dropping files, Unsplash, and the files as a grid a page at a time.
 *
 * A file that arrives, uploaded or taken from Unsplash, is opened or chosen at
 * once, as if it had been found and clicked.
 */
export function MediaBrowser({ onChoose, onCancel, imageOnly, labelId }: MediaBrowserProps) {
  const { text, language } = useDashboardLanguage();
  const [search, setSearch] = useState("");
  const settled = useSettledValue(search.trim(), SEARCH_DELAY_MS);
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState("all");
  const [unused, setUnused] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const media = useMediaPage({ search: settled, kind: imageOnly ? "image" : kind, page, unused });
  const choose = (item: MediaLibraryItem) => {
    if (onChoose) onChoose(item.slug, item);
    else setDetailId(item.id);
  };
  const arrived = (item: MediaLibraryItem) => {
    setSearch("");
    setPage(1);
    choose(item);
  };
  const uploads = useMediaUploads(arrived);
  const [searchingUnsplash, setSearchingUnsplash] = useState(false);
  const kindId = useId();
  const unusedId = useId();
  const options = [
    { value: "all", label: text("filterAll") },
    ...MEDIA_KINDS.map((value) => ({ value, label: text(MEDIA_KIND_TEXT[value]) })),
  ];
  return (
    <>
      <Card.Header
        id={labelId}
        title={text(onChoose ? "mediaPicker" : "media")}
        actions={
          <>
            <ActionButton action="unsplash" onClick={() => setSearchingUnsplash(true)}>
              {text("unsplash")}
            </ActionButton>
            <FileChooserButton
              action="upload"
              types={ACCEPTED_IMAGE_TYPES}
              multiple
              disabled={uploads.pending}
              onFiles={uploads.start}
            >
              {text("mediaUpload")}
            </FileChooserButton>
          </>
        }
      />
      <section
        className="media-browser"
        aria-label={text("mediaDropHint")}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          uploads.start(Array.from(event.dataTransfer.files));
        }}
      >
        <PictureSearch.Controls
          label={text("mediaSearch")}
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        >
          {!imageOnly && (
            <Select
              id={kindId}
              aria-label={text("mediaKind")}
              value={kind}
              options={options}
              onChange={(event) => {
                setKind(event.target.value);
                setPage(1);
              }}
            />
          )}
          <Field.Inline label={text("mediaOnlyUnused")} htmlFor={unusedId}>
            <Switch
              id={unusedId}
              aria-label={text("mediaOnlyUnused")}
              checked={unused}
              onCheckedChange={(next) => {
                setUnused(next);
                setPage(1);
              }}
            />
          </Field.Inline>
          <p>{text("mediaDropHint")}</p>
          <MediaUploadProgress items={uploads.progress} />
        </PictureSearch.Controls>
        <PictureSearch.Results query={media} empty={text("mediaEmpty")}>
          {(item) => (
            <PictureSearch.Item
              key={item.id}
              title={item.slug}
              note={`${text(MEDIA_KIND_TEXT[item.kind])} · ${fileSize(language, item.byteSize)} · ${formatInstant(language, item.uploadedAt)}`}
              detail={text(PROCESSING_TEXT[item.processingState])}
              thumbnail={item.url}
              position={imagePosition(item)}
              onChoose={() => choose(item)}
            />
          )}
        </PictureSearch.Results>
      </section>
      <Card.Footer
        actions={
          <>
            {onCancel && (
              <ActionButton action="cancel" onClick={onCancel}>
                {text("cancel")}
              </ActionButton>
            )}
            <PageButtons page={page} hasMore={media.data?.hasMore ?? false} onPage={setPage} />
          </>
        }
      />
      {detailId && <MediaDetailDialog id={detailId} onClose={() => setDetailId(null)} />}
      {searchingUnsplash && (
        <UnsplashSearch
          onCancel={() => setSearchingUnsplash(false)}
          onChoose={(item) => {
            setSearchingUnsplash(false);
            arrived(item);
          }}
        />
      )}
    </>
  );
}
