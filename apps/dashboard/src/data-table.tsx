import { Row } from "@layered/ui";
import { MagnifyingGlassIcon } from "@layered/ui/icons";
import {
  type CSSProperties,
  createContext,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  use,
  useRef,
} from "react";
import { SearchShortcutCap, useSearchField } from "./search.js";
import "./data-table.css";

/**
 * The dashboard's table, built once to the shape of the Posts list, which every
 * other table follows.
 *
 * A table sits directly in its card, edge to edge, with a fixed layout so one
 * long value shortens rather than pushing the table past the card. The column
 * kinds set each column's width and alignment, so two tables with the same kind
 * of column draw it the same way. A row that opens something is the target as a
 * whole, by pointer and by keyboard; a row without `onOpen` is static and its
 * buttons are its only targets.
 */

/**
 * What a column holds, which decides its width and its alignment.
 *
 * `title` takes whatever width the others leave. `date` and `count` are compared
 * by size, so they are right aligned in tabular figures. `action` holds icon
 * buttons and is as wide as the number of them it is told.
 */
export type ColumnKind = "title" | "text" | "state" | "language" | "date" | "count" | "action";

/** The kinds whose cells are right aligned in tabular figures. */
const ALIGNED_END: ReadonlySet<ColumnKind> = new Set(["date", "count", "action"]);

/** One column's heading. */
export interface DataTableColumn {
  kind: ColumnKind;
  label: string;
  /** For an `action` column: how many icon buttons a row holds there, which sets its width. */
  actions?: number;
}

/** What a row needs from its table: where focus goes when it leaves the first row upwards. */
const TableContext = createContext<{ onLeaveTop?: () => void }>({});

/** Props for a table. */
interface DataTableProps {
  columns: readonly DataTableColumn[];
  children: ReactNode;
  /** Where focus goes when the arrow key leaves the first row upwards, such as the search field above. */
  onLeaveTop?: () => void;
  /** The body, which `useTableSearch` moves focus into. */
  bodyRef?: RefObject<HTMLTableSectionElement | null>;
}

/** The class and alignment of a column's heading and of its cells. */
function columnClass(kind: ColumnKind): string {
  return `col-${kind}${ALIGNED_END.has(kind) ? " align-end" : ""}`;
}

function DataTableRoot({ columns, children, onLeaveTop, bodyRef }: DataTableProps) {
  return (
    <TableContext value={{ onLeaveTop }}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.label}
                className={columnClass(column.kind)}
                style={column.actions ? ({ "--actions": column.actions } as CSSProperties) : undefined}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={bodyRef}>{children}</tbody>
      </table>
    </TableContext>
  );
}

/**
 * Moves focus into the first row that opens something, as the arrow key does
 * from a search field above the table.
 *
 * @param body - The table's body.
 * @returns Whether there was a row to move to.
 */
function focusFirstRow(body: HTMLTableSectionElement | null): boolean {
  const first = body?.querySelector<HTMLElement>("tr[data-opens]");
  first?.focus();
  return Boolean(first);
}

/**
 * A search field above a table whose rows are its results, as on Posts.
 *
 * The arrow key walks from the field into the first row that opens something,
 * the table walks back up into the field from that row, and Escape gives focus
 * back the way every search field of the dashboard does.
 *
 * @returns The refs and handlers: `fieldRef` and `onFieldKeyDown` for the
 *   field, `bodyRef` and `onLeaveTop` for the table.
 */
export function useTableSearch() {
  const { fieldRef: registerField, returnFocus } = useSearchField();
  const field = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  return {
    bodyRef,
    fieldRef: (element: HTMLInputElement | null) => {
      field.current = element;
      registerField(element);
    },
    onFieldKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown") {
        if (focusFirstRow(bodyRef.current)) event.preventDefault();
      } else if (event.key === "Escape") {
        event.preventDefault();
        returnFocus();
      }
    },
    onLeaveTop: () => field.current?.focus(),
  };
}

/** Props for a row. */
interface DataTableRowProps {
  children: ReactNode;
  /** Opens what the row stands for. Without it the row is static. */
  onOpen?: () => void;
  /** Marks the row as the one currently open beside the table. */
  active?: boolean;
}

/**
 * One row. With `onOpen` the whole row is the target: a click, Enter or Space
 * opens it, and the arrow keys move between rows and back up to whatever the
 * table names above it.
 */
function DataTableRow({ children, onOpen, active }: DataTableRowProps) {
  const { onLeaveTop } = use(TableContext);
  const onKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (!onOpen || event.target !== event.currentTarget) return;
    const current = event.currentTarget;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = event.key === "ArrowDown" ? current.nextElementSibling : current.previousElementSibling;
      if (next instanceof HTMLElement) next.focus();
      else if (event.key === "ArrowUp") onLeaveTop?.();
    }
  };
  return (
    <tr
      data-opens={onOpen ? "" : undefined}
      data-active={active ? "" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={onOpen ? onKeyDown : undefined}
    >
      {children}
    </tr>
  );
}

/** Props for a cell. */
interface DataTableCellProps {
  /** The column's kind, which aligns the cell with its heading. */
  kind?: ColumnKind;
  children?: ReactNode;
  lang?: string;
}

function DataTableCell({ kind = "text", children, lang }: DataTableCellProps) {
  return (
    <td className={ALIGNED_END.has(kind) ? "align-end" : undefined} lang={lang}>
      {children}
    </td>
  );
}

/** Props for a title cell's content. */
interface DataTableTitleProps {
  title: string;
  /** A line under the title, such as an address. */
  note?: string;
  /** A thumbnail address. Undefined draws no tile; null draws an empty one, as a row without a picture does. */
  thumbnail?: string | null;
}

/** What a title cell shows: the tile where the row has one, the title, and the note under it. */
function DataTableTitle({ title, note, thumbnail }: DataTableTitleProps) {
  return (
    <Row.Bare>
      {thumbnail !== undefined && (
        <Row.Tile aria-hidden="true">{thumbnail && <img src={thumbnail} alt="" loading="lazy" />}</Row.Tile>
      )}
      <Row.Text title={title} note={note} />
    </Row.Bare>
  );
}

/**
 * The buttons at a row's end. A click on one does not also open the row.
 */
function DataTableActions({ children }: { children: ReactNode }) {
  return (
    <td className="align-end">
      {/* A row that opens on click would also open when one of its buttons is pressed. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: The handler only keeps a button's click from reaching the row. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Keys reach the buttons themselves, never this wrapper. */}
      <div className="actions" onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </td>
  );
}

/** Props for the search field above a table. */
interface DataTableSearchProps {
  /** What the field searches, which is its accessible name and its placeholder. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** The handlers from `useTableSearch`, which connect the field to the table. */
  search: ReturnType<typeof useTableSearch>;
}

/**
 * The search field a table's card carries in its header, as on Posts: the
 * magnifier, the field, and the key cap of the search shortcut, which focuses it.
 */
function DataTableSearch({ label, value, onChange, search }: DataTableSearchProps) {
  return (
    <label className="search-field">
      <MagnifyingGlassIcon aria-hidden="true" />
      <input
        ref={search.fieldRef}
        className="input"
        type="search"
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={search.onFieldKeyDown}
        data-search-field=""
      />
      <SearchShortcutCap />
    </label>
  );
}

/** The table, its rows, cells, title cells, action cells and the search field above it. */
export const DataTable = Object.assign(DataTableRoot, {
  Row: DataTableRow,
  Cell: DataTableCell,
  Title: DataTableTitle,
  Actions: DataTableActions,
  Search: DataTableSearch,
});
