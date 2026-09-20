import type { AccountMediaItem } from "@layered/schemas";
import { Button, Card, Field, Input } from "@layered/ui";
import { ImagesIcon, MagnifyingGlassIcon, XIcon } from "@layered/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useDashboardApi } from "./dashboard-context.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { CardDialog } from "./modal.js";

export function MediaPicker({
  onCancel,
  onChoose,
}: {
  onCancel: () => void;
  onChoose: (item: AccountMediaItem) => void;
}) {
  const api = useDashboardApi();
  const { text } = useDashboardLanguage();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const media = useQuery({
    queryKey: ["account-media", query, page],
    queryFn: () => api.fetchAccountMedia(query, page),
    retry: false,
  });

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setQuery(search.trim());
  }

  return (
    <CardDialog labelId="media-picker-title" onClose={onCancel}>
      <Card.Header id="media-picker-title" title={text("mediaPicker")} />
      <Card.Body>
        <form className="media-picker__search" onSubmit={submitSearch}>
          <Field label={text("mediaSearch")} htmlFor="media-search">
            <Input
              id="media-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              autoFocus
            />
          </Field>
          <Button
            type="submit"
            icon={<MagnifyingGlassIcon weight="bold" />}
            aria-label={text("mediaSearch")}
          />
        </form>
        {media.isError && <ErrorNotice error={media.error} fallback={text("mediaLoadError")} />}
        {media.isSuccess && media.data.items.length === 0 && <p>{text("mediaEmpty")}</p>}
        {media.data && (
          <div className="media-picker__grid">
            {media.data.items.map((item) => (
              <button
                key={item.id}
                className="media-picker__item"
                type="button"
                onClick={() => onChoose(item)}
              >
                <img src={item.url} alt="" loading="lazy" />
                <span>{item.slug}</span>
              </button>
            ))}
          </div>
        )}
      </Card.Body>
      <Card.Footer
        actions={
          <>
            <Button onClick={onCancel} icon={<XIcon weight="bold" />}>
              {text("cancel")}
            </Button>
            {page > 1 && (
              <Button onClick={() => setPage((current) => current - 1)}>{text("previousPage")}</Button>
            )}
            {media.data?.hasMore && (
              <Button onClick={() => setPage((current) => current + 1)} icon={<ImagesIcon weight="bold" />}>
                {text("nextPage")}
              </Button>
            )}
          </>
        }
      />
    </CardDialog>
  );
}
