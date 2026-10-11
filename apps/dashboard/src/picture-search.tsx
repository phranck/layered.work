import { Card, Row } from "@layered/ui";
import { FilesIcon } from "@layered/ui/icons";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { noRows, QueryStates } from "./query-states.js";
import { SearchField } from "./search.js";
import "./media-browser.css";

/**
 * Searching a collection of pictures a page at a time, as the media library and
 * the Unsplash search both do: the search field with whatever narrows the
 * search beside it, the page of pictures as a grid of rows, and the buttons
 * that step through the pages, which a caller puts in its card's footer with
 * `PageButtons`.
 *
 * The parts are the card's own bodies, so they stand directly in the card.
 */

/** Props for the search field above a grid of pictures. */
interface PictureSearchControlsProps {
  /** What the field searches, which is its accessible name and its placeholder. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Called for Return in the field, for a search that asks only when told to. */
  onSubmit?: () => void;
  /** Further controls beside the field, such as a filter, and lines under it. */
  children?: ReactNode;
}

/** The search field and the controls that narrow the search, in a body of their own. */
function PictureSearchControls({ label, value, onChange, onSubmit, children }: PictureSearchControlsProps) {
  return (
    <Card.Body>
      <form
        className="picture-search__controls"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit?.();
        }}
      >
        <SearchField label={label} value={value} onChange={onChange} />
        {children}
      </form>
    </Card.Body>
  );
}

/** Props for one page of pictures. */
interface PictureSearchResultsProps<Item> {
  /** The page shown. */
  query: UseQueryResult<{ items: readonly Item[] }>;
  /** What the card says where the page holds no picture. */
  empty: string;
  /** Whether choosing a picture is under way, which the grid says to a screen reader. */
  busy?: boolean;
  /** Draws one picture, as `PictureSearch.Item`. */
  children: (item: Item) => ReactNode;
}

/** One page of pictures as a grid, through every state of its query. */
function PictureSearchResults<Item>({ query, empty, busy, children }: PictureSearchResultsProps<Item>) {
  return (
    <QueryStates query={query} empty={empty} isEmpty={(page) => noRows(page.items)}>
      {(page) => (
        <Card.Body>
          <div className="picture-search__grid" aria-busy={busy || undefined}>
            {page.items.map(children)}
          </div>
        </Card.Body>
      )}
    </QueryStates>
  );
}

/** Props for one picture of a grid. */
interface PictureSearchItemProps {
  title: string;
  /** The line under the title, such as the kind and size of a file. */
  note: string;
  /** A further line, such as the state of a file's processing. */
  detail?: ReactNode;
  /** The picture's preview, or null for a file that has none, which shows the files icon. */
  thumbnail: string | null;
  /** Where the preview is cropped around, as `object-position` takes it. */
  position?: string;
  onChoose: () => void;
  disabled?: boolean;
}

/** One picture: its preview in the row's tile, and its title and notes beside it. */
function PictureSearchItem({
  title,
  note,
  detail,
  thumbnail,
  position,
  onChoose,
  disabled,
}: PictureSearchItemProps) {
  return (
    <Row.Button onClick={onChoose} title={title} disabled={disabled}>
      <Row.Tile aria-hidden="true">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            loading="lazy"
            style={position ? { objectPosition: position } : undefined}
          />
        ) : (
          <FilesIcon />
        )}
      </Row.Tile>
      <Row.Text title={title} note={note}>
        {detail && <span className="row__note">{detail}</span>}
      </Row.Text>
    </Row.Button>
  );
}

/** A search through a collection of pictures: its controls, its results and one picture of them. */
export const PictureSearch = {
  Controls: PictureSearchControls,
  Results: PictureSearchResults,
  Item: PictureSearchItem,
};
