import { Card, Row } from "@layered/ui";
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
import { Reorder, useReorderItem } from "./reorder.js";
import { SearchShortcutCap, useSearchField } from "./search.js";
import "./table.css";

/**
 * The dashboard's one table, built to the shape of the Posts list, which every
 * list of records in the dashboard is drawn with.
 *
 * A table sits directly in its card, edge to edge, with a fixed layout so one
 * long value shortens rather than pushing the table past the card. Every row is
 * one line: what would be a second line under a title is a column of its own.
 * The column kinds set each column's width and alignment, so two tables with
 * the same kind of column draw it the same way.
 *
 * A row that opens something is the target as a whole, by pointer and by
 * keyboard; a row without `onOpen` is static and its controls are its only
 * targets. A table given `onMove` is ordered by hand, through the grip at the
 * start of each row.
 */

/**
 * What a column holds, which decides its width and its alignment.
 *
 * `title` and `text` share whatever width the others leave. `date` and `count`
 * are compared by size, so they are right aligned in tabular figures. `grip`
 * holds the handle a row is moved by, `switch` one switch, and `action` icon
 * buttons, as many as it is told.
 */
export type ColumnKind =
  | "grip"
  | "title"
  | "text"
  | "state"
  | "language"
  | "date"
  | "count"
  | "switch"
  | "action";

/** The kinds whose cells are right aligned in tabular figures. */
const ALIGNED_END: ReadonlySet<ColumnKind> = new Set(["date", "count", "action"]);

/** One column's heading. */
export interface TableColumn {
  kind: ColumnKind;
  label: string;
  /** For an `action` column: how many icon buttons a row holds there, which sets its width. */
  actions?: number;
}

/** What a row needs from its table: where focus goes when it leaves the first row upwards. */
const TableContext = createContext<{ onLeaveTop?: () => void }>({});

/** Props for a table. */
interface TableProps {
  columns: readonly TableColumn[];
  children: ReactNode;
  /** Where focus goes when the arrow key leaves the first row upwards, such as the search field above. */
  onLeaveTop?: () => void;
  /** The body, which `useTableSearch` moves focus into. */
  bodyRef?: RefObject<HTMLTableSectionElement | null>;
  /**
   * Makes the rows an order set by hand: called with the position a row leaves
   * and the one it takes. Each row then needs its `index`, and the first column
   * is a `grip` holding `Table.Grip`.
   */
  onMove?: (from: number, to: number) => void;
}

/** The class and alignment of a column's heading and of its cells. */
function columnClass(kind: ColumnKind): string {
  return `col-${kind}${ALIGNED_END.has(kind) ? " align-end" : ""}`;
}

function TableRoot({ columns, children, onLeaveTop, bodyRef, onMove }: TableProps) {
  const body = <tbody ref={bodyRef}>{children}</tbody>;
  return (
    <TableContext value={{ onLeaveTop }}>
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.label || column.kind}
                className={columnClass(column.kind)}
                style={column.actions ? ({ "--actions": column.actions } as CSSProperties) : undefined}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        {onMove ? <Reorder.Scope onMove={onMove}>{body}</Reorder.Scope> : body}
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
interface TableRowProps {
  children: ReactNode;
  /** Opens what the row stands for. Without it the row is static. */
  onOpen?: () => void;
  /** Marks the row as the one currently open beside the table. */
  active?: boolean;
  /** The row's position, which a table ordered by hand needs to move it. */
  index?: number;
}

/**
 * One row. With `onOpen` the whole row is the target: a click, Enter or Space
 * opens it, and the arrow keys move between rows and back up to whatever the
 * table names above it.
 */
function TableRow({ children, onOpen, active, index }: TableRowProps) {
  const { onLeaveTop } = use(TableContext);
  const register = useReorderItem(index);
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
      ref={register}
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
interface TableCellProps {
  /** The column's kind, which aligns the cell with its heading. */
  kind?: ColumnKind;
  children?: ReactNode;
  lang?: string;
}

function TableCell({ kind = "text", children, lang }: TableCellProps) {
  return (
    <td className={ALIGNED_END.has(kind) ? "align-end" : undefined} lang={lang}>
      {children}
    </td>
  );
}

/** Props for a title cell's content. */
interface TableTitleProps {
  title: string;
  /** A thumbnail address. Undefined draws no tile; null draws an empty one, as a row without a picture does. */
  thumbnail?: string | null;
  /** A mark drawn in the tile instead of a thumbnail, such as an icon or a brand. */
  tile?: ReactNode;
}

/** What a title cell shows: the tile where the row has one, and the title beside it. */
function TableTitle({ title, thumbnail, tile }: TableTitleProps) {
  const hasTile = tile !== undefined || thumbnail !== undefined;
  return (
    <Row.Bare>
      {hasTile && (
        <Row.Tile aria-hidden="true">
          {tile ?? (thumbnail && <img src={thumbnail} alt="" loading="lazy" />)}
        </Row.Tile>
      )}
      <Row.Text title={title} />
    </Row.Bare>
  );
}

/** The tones a badge in a table takes, as the state colours name them. */
export type BadgeTone = "success" | "warning" | "info" | "danger" | "neutral";

/** A state, drawn as the badge of the Posts list: a dot and a word in a tone. */
function TableBadge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span className="badge" data-tone={tone}>
      {children}
    </span>
  );
}

/**
 * A cell holding controls, such as a switch or icon buttons. A click on one
 * acts on the control and does not also open the row.
 */
function TableControl({ kind, children }: { kind: ColumnKind; children: ReactNode }) {
  return (
    <td className={ALIGNED_END.has(kind) ? "align-end" : undefined}>
      {/* A row that opens on click would also open when one of its controls is pressed. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: The handler only keeps a control's click from reaching the row. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Keys reach the controls themselves, never this wrapper. */}
      <div
        className={kind === "action" ? "actions" : "table__control"}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </td>
  );
}

/**
 * A mark in a row's controls that says why one is missing, such as the lock of
 * a row that cannot move. It is not a control and draws no edge, so it is not
 * mistaken for a disabled button. It stands in the space of the button it
 * replaces, and says what it means to a screen reader and in its tooltip.
 */
function TableMark({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="table__mark" role="img" aria-label={label} title={label}>
      {children}
    </span>
  );
}

/** The icon buttons at a row's end. */
function TableActions({ children }: { children: ReactNode }) {
  return <TableControl kind="action">{children}</TableControl>;
}

/** Props for the grip a row is moved by. */
interface TableGripProps {
  /** The row's position. */
  index: number;
  /** What moving it does, for a screen reader and the tooltip. */
  label: string;
  disabled?: boolean;
}

/** The grip at the start of a row in a table ordered by hand. */
function TableGrip({ index, label, disabled }: TableGripProps) {
  return (
    <TableControl kind="grip">
      <Reorder.Handle index={index} label={label} disabled={disabled} />
    </TableControl>
  );
}

/**
 * What a card says in place of its table when there are no rows, as Posts
 * says it.
 */
function TableEmpty({ children }: { children: ReactNode }) {
  return (
    <Card.Body>
      <p className="unfinished">{children}</p>
    </Card.Body>
  );
}

/** Props for the search field above a table. */
interface TableSearchProps {
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
function TableSearch({ label, value, onChange, search }: TableSearchProps) {
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

/**
 * The table and its parts: rows, cells, title cells, badges, cells of
 * controls, the grip, the action cell, the empty state and the search field.
 */
export const Table = Object.assign(TableRoot, {
  Row: TableRow,
  Cell: TableCell,
  Title: TableTitle,
  Badge: TableBadge,
  Control: TableControl,
  Mark: TableMark,
  Actions: TableActions,
  Grip: TableGrip,
  Empty: TableEmpty,
  Search: TableSearch,
});
