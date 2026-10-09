import { MEDIA_KINDS, type MediaLibraryItem } from "@layered/schemas";
import { Button, Card, Field, Input, imagePosition, Row, Select, Switch } from "@layered/ui";
import { FilesIcon, GlobeIcon, MagnifyingGlassIcon, XIcon } from "@layered/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useDashboardApi } from "./dashboard-context.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { MediaDetailDialog } from "./media-detail.js";
import { MediaUploadButton, MediaUploadProgress, useMediaUploads } from "./media-uploads.js";
import { UnsplashSearch } from "./unsplash-search.js";
import "./media-browser.css";

const KIND_LABEL = {
  image: "mediaKindImage",
  video: "mediaKindVideo",
  document: "mediaKindDocument",
  model: "mediaKindModel",
} as const;
const STATE_LABEL = {
  queued: "mediaQueued",
  processing: "mediaProcessing",
  ready: "mediaReady",
  failed: "mediaFailed",
} as const;
const DATES = { de: new Intl.DateTimeFormat("de-AT"), en: new Intl.DateTimeFormat("en-GB") };
const BYTES = {
  de: new Intl.NumberFormat("de-AT", { style: "unit", unit: "kilobyte", maximumFractionDigits: 1 }),
  en: new Intl.NumberFormat("en-GB", { style: "unit", unit: "kilobyte", maximumFractionDigits: 1 }),
};
type Props = {
  onChoose?: (slug: string, item: MediaLibraryItem) => void;
  onCancel?: () => void;
  imageOnly?: boolean;
  labelId?: string;
};

function MediaGrid({
  items,
  select,
}: {
  items: MediaLibraryItem[];
  select: (item: MediaLibraryItem) => void;
}) {
  const { text, language } = useDashboardLanguage();
  return (
    <div className="media-browser__grid">
      {items.map((item) => (
        <Row.Button key={item.id} onClick={() => select(item)} title={item.slug}>
          <Row.Tile aria-hidden="true">
            {item.url ? (
              <img src={item.url} alt="" loading="lazy" style={{ objectPosition: imagePosition(item) }} />
            ) : (
              <FilesIcon />
            )}
          </Row.Tile>
          <Row.Text
            title={item.slug}
            note={`${text(KIND_LABEL[item.kind])} · ${BYTES[language].format(item.byteSize / 1024)} · ${DATES[language].format(new Date(item.uploadedAt))}`}
          >
            <span className="row__note">{text(STATE_LABEL[item.processingState])}</span>
          </Row.Text>
        </Row.Button>
      ))}
    </div>
  );
}
function MediaBrowserContent({ onChoose, onCancel, imageOnly, labelId }: Props) {
  const api = useDashboardApi();
  const { text } = useDashboardLanguage();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState("all");
  const [unused, setUnused] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const media = useQuery({
    queryKey: ["media", "list", query, imageOnly ? "image" : kind, page, unused],
    queryFn: () => api.fetchMedia(query, imageOnly ? "image" : kind, page, unused),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.items.some(
        (item) => item.processingState === "queued" || item.processingState === "processing",
      )
        ? 2_000
        : false,
  });
  const choose = (item: MediaLibraryItem) => {
    if (onChoose) onChoose(item.slug, item);
    else setDetailId(item.id);
  };
  // A new picture, uploaded or taken from Unsplash, is shown and chosen the same way.
  const arrived = (item: MediaLibraryItem) => {
    setSearch("");
    setQuery("");
    setPage(1);
    choose(item);
  };
  const uploads = useMediaUploads(arrived);
  const [searchingUnsplash, setSearchingUnsplash] = useState(false);
  const searchId = useId();
  const kindId = useId();
  const unusedId = useId();
  const options = [
    { value: "all", label: text("filterAll") },
    ...MEDIA_KINDS.map((value) => ({ value, label: text(KIND_LABEL[value]) })),
  ];
  return (
    <>
      <Card.Header
        id={labelId}
        title={text(onChoose ? "mediaPicker" : "media")}
        actions={
          <>
            <Button icon={<GlobeIcon />} onClick={() => setSearchingUnsplash(true)}>
              {text("unsplash")}
            </Button>
            <MediaUploadButton pending={uploads.pending} start={uploads.start} />
          </>
        }
      />
      <Card.Body>
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
          <p>{text("mediaDropHint")}</p>
          <form
            className="media-browser__controls"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setQuery(search.trim());
            }}
          >
            <Field label={text("mediaSearch")} htmlFor={searchId}>
              <Input
                id={searchId}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </Field>
            {!imageOnly && (
              <Field label={text("mediaKind")} htmlFor={kindId}>
                <Select
                  id={kindId}
                  value={kind}
                  options={options}
                  onChange={(event) => {
                    setKind(event.target.value);
                    setPage(1);
                  }}
                />
              </Field>
            )}
            <Button type="submit" icon={<MagnifyingGlassIcon />} aria-label={text("mediaSearch")} />
          </form>
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
          <MediaUploadProgress items={uploads.progress} />
          {media.isError && <ErrorNotice error={media.error} />}
          {media.isPending && <p>{text("loading")}</p>}
          {media.isSuccess && !media.data.items.length && <p>{text("mediaEmpty")}</p>}
          {media.data && <MediaGrid items={media.data.items} select={choose} />}
        </section>
      </Card.Body>
      <Card.Footer
        actions={
          <>
            {onCancel && (
              <Button onClick={onCancel} icon={<XIcon />}>
                {text("cancel")}
              </Button>
            )}
            {page > 1 && (
              <Button onClick={() => setPage((value) => value - 1)}>{text("previousPage")}</Button>
            )}
            {media.data?.hasMore && (
              <Button onClick={() => setPage((value) => value + 1)}>{text("nextPage")}</Button>
            )}
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
/** The page and picker share one query, upload queue and row grid. */
export const MediaBrowser = Object.assign(MediaBrowserContent, { Grid: MediaGrid });
