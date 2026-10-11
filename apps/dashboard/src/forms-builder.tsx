import {
  type CreateFormBody,
  FORM_COLUMNS,
  FORM_FIELD_COUNT,
  FORM_FIELD_TYPES,
  type FormFieldType,
  fieldSpan,
  formFields,
} from "@layered/schemas";
import { Button, Card } from "@layered/ui";
import {
  CalendarBlankIcon,
  CaretCircleDownIcon,
  CheckSquareIcon,
  EnvelopeSimpleIcon,
  HashIcon,
  type IconProps,
  ListChecksIcon,
  ShieldCheckIcon,
  TextAaIcon,
  TextAlignLeftIcon,
  XIcon,
} from "@layered/ui/icons";
import {
  type ComponentType,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { type DragSource, dropTarget, type Gaps, type Marker, markerFor, type RowBox } from "./forms-drag.js";
import {
  FIELD_TYPE_TEXT,
  type FieldDirection,
  type FieldPlace,
  type FieldTarget,
  freeColumns,
  insertField,
  keyTarget,
  moveField,
  moveRow,
  type PlacedChange,
  removeField,
} from "./forms-model.js";
import { useDashboardLanguage } from "./language-context.js";
import { Reorder } from "./reorder.js";
import { useTextLanguage } from "./text-language.js";

/** The mark each kind of field is shown with, in the palette and on the canvas. */
const FIELD_TYPE_ICON: Record<FormFieldType, ComponentType<IconProps>> = {
  shortText: TextAaIcon,
  longText: TextAlignLeftIcon,
  email: EnvelopeSimpleIcon,
  number: HashIcon,
  singleChoice: CaretCircleDownIcon,
  multipleChoice: ListChecksIcon,
  checkbox: CheckSquareIcon,
  date: CalendarBlankIcon,
  consent: ShieldCheckIcon,
};

/**
 * How far, in pixels, the pointer travels before a press becomes a drag. Below
 * it a press is a click, which selects a field or adds a tile's field.
 */
const DRAG_THRESHOLD = 6;

/** How thick the line is that shows where a drop lands. */
const MARKER_THICKNESS = 3;

/** The direction each arrow key moves a selected field in. */
const ARROW_DIRECTIONS: Readonly<Record<string, FieldDirection>> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

/** A press on a tile or a field, which turns into a drag once the pointer has travelled. */
type Press = {
  source: DragSource;
  label: string;
  pointer: number;
  startX: number;
  startY: number;
  dragging: boolean;
};

/** What a drag in progress shows: the label under the pointer, and the line where it would land. */
type DragView = { source: DragSource; label: string; x: number; y: number; marker?: Marker };

/**
 * The canvas as measured at one moment, how to bring the pointer into its
 * coordinates, and where the pointer stands in the builder's own, which the
 * label under the pointer is placed in.
 */
type Measured = {
  rows: RowBox[];
  gaps: Gaps;
  local: (clientX: number, clientY: number) => { x: number; y: number };
  inBuilder: (clientX: number, clientY: number) => { x: number; y: number };
};

/** Props for the form builder's palette and canvas. */
export interface FormBuilderProps {
  form: CreateFormBody;
  /** The field whose settings the panel shows. */
  selected: FieldPlace | null;
  onSelect: (place: FieldPlace | null) => void;
  /** Called with the changed form, and the field to select afterwards where the change names one. */
  onChange: (form: CreateFormBody, selected: FieldPlace | null) => void;
  /** The canvas card's header. */
  header: ReactNode;
  /** What stands under the canvas, such as the preview. */
  children?: ReactNode;
}

/**
 * The palette of field types beside the canvas of the form's rows, as in lmaa's
 * builder.
 *
 * A tile adds its field in a row of its own at the end when clicked, and where
 * it is dropped when dragged. A field moves within its row and between rows by
 * dragging, or with the arrow keys once it has the focus; a row moves by its
 * grip. While something is dragged, a line shows where it would land, worked
 * out by `dropTarget` from the boxes measured at that moment. Every change goes
 * through the model in `forms-model.ts`, so a row can never hold more than its
 * twelve columns.
 */
export function FormBuilder({ form, selected, onSelect, onChange, header, children }: FormBuilderProps) {
  const { text } = useDashboardLanguage();
  // The labels show in the language the panel's switch has chosen, as the preview does.
  const language = useTextLanguage();
  const hintId = useId();
  const builder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const rowGrids = useRef(new Map<number, HTMLElement>());
  const fieldBoxes = useRef(new Map<string, HTMLElement>());
  const fieldButtons = useRef(new Map<string, HTMLButtonElement>());
  const press = useRef<Press | null>(null);
  const pressEndedInDrag = useRef(false);
  const [drag, setDrag] = useState<DragView | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const fieldCount = formFields(form).length;

  // A field moved by the keyboard is drawn anew in its new row, so the focus is
  // handed to it again once it stands there.
  useEffect(() => {
    if (!focusKey) return;
    fieldButtons.current.get(focusKey)?.focus();
    setFocusKey(null);
  }, [focusKey]);

  const apply = (change: PlacedChange) => onChange(change.form, change.place);

  /** The rows and their fields as they stand on the screen now. */
  const measure = (): Measured | undefined => {
    const container = canvas.current;
    if (!container) return undefined;
    const box = container.getBoundingClientRect();
    // The dashboard's interface scale zooms the document, so a box on the screen
    // is this many times its size in the canvas's own pixels.
    const zoom = container.offsetWidth > 0 ? box.width / container.offsetWidth : 1;
    const x = (clientX: number) => (clientX - box.left) / zoom;
    const y = (clientY: number) => (clientY - box.top) / zoom;
    const rows = form.rows.map((row, index): RowBox => {
      const element = rowGrids.current.get(index);
      const grid = element?.getBoundingClientRect();
      const outer = element?.closest(".forms-row")?.getBoundingClientRect() ?? grid;
      return {
        top: y(grid?.top ?? 0),
        bottom: y(grid?.bottom ?? 0),
        left: x(grid?.left ?? 0),
        right: x(grid?.right ?? 0),
        outerTop: y(outer?.top ?? 0),
        outerBottom: y(outer?.bottom ?? 0),
        fields: row.fields.map((_, column) => {
          const field = fieldBoxes.current.get(`${index}:${column}`)?.getBoundingClientRect();
          return { start: x(field?.left ?? 0), end: x(field?.right ?? 0) };
        }),
        free: freeColumns(row),
      };
    });
    const firstGrid = rowGrids.current.get(0);
    const list = firstGrid?.closest(".forms-rows");
    const gaps = {
      column: firstGrid ? Number.parseFloat(getComputedStyle(firstGrid).columnGap) || 0 : 0,
      row: list ? Number.parseFloat(getComputedStyle(list).rowGap) || 0 : 0,
    };
    const builderBox = builder.current?.getBoundingClientRect() ?? box;
    return {
      rows,
      gaps,
      local: (clientX, clientY) => ({ x: x(clientX), y: y(clientY) }),
      inBuilder: (clientX, clientY) => ({
        x: (clientX - builderBox.left) / zoom,
        y: (clientY - builderBox.top) / zoom,
      }),
    };
  };

  /** What a drop at a point does to the form. */
  const dropped = (source: DragSource, target: FieldTarget): PlacedChange =>
    source.kind === "palette"
      ? insertField(form, source.type, target)
      : moveField(form, source.place, target);

  /** The pointer handlers that let a tile or a field be dragged. */
  const draggable = (source: DragSource, label: string) => ({
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0) return;
      // A browser that sends no click after a drag would otherwise leave the
      // flag standing, and the next real click would be lost.
      pressEndedInDrag.current = false;
      press.current = {
        source,
        label,
        pointer: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        dragging: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const current = press.current;
      if (!current || current.pointer !== event.pointerId) return;
      if (
        !current.dragging &&
        Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < DRAG_THRESHOLD
      )
        return;
      current.dragging = true;
      const measured = measure();
      if (!measured) return;
      const target = dropTarget(measured.rows, measured.local(event.clientX, event.clientY), source);
      setDrag({
        source,
        label,
        ...measured.inBuilder(event.clientX, event.clientY),
        marker: markerFor(measured.rows, target, source, measured.gaps, MARKER_THICKNESS),
      });
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      const current = press.current;
      press.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      setDrag(null);
      if (!current?.dragging) return;
      pressEndedInDrag.current = true;
      const measured = measure();
      if (measured)
        apply(
          dropped(source, dropTarget(measured.rows, measured.local(event.clientX, event.clientY), source)),
        );
    },
    onPointerCancel() {
      press.current = null;
      setDrag(null);
    },
  });

  /** A click handler that does nothing for the click a finished drag leaves behind. */
  const clicked =
    (action: (event: MouseEvent<HTMLButtonElement>) => void) => (event: MouseEvent<HTMLButtonElement>) => {
      if (pressEndedInDrag.current) {
        pressEndedInDrag.current = false;
        return;
      }
      action(event);
    };

  /** Moves a field one step with an arrow key and keeps the focus on it. */
  const moveByKey = (event: KeyboardEvent<HTMLButtonElement>, place: FieldPlace, key: string) => {
    const direction = ARROW_DIRECTIONS[event.key];
    if (!direction) return;
    event.preventDefault();
    const target = keyTarget(form, place, direction);
    if (!target) return;
    apply(moveField(form, place, target));
    setFocusKey(key);
  };

  /** Moves a row by its grip, keeping the selected field selected. */
  const moveRowTo = (from: number, to: number) => {
    const next = moveRow(form, from, to);
    if (!selected) return onChange(next, null);
    const row =
      selected.row === from
        ? to
        : from < selected.row && to >= selected.row
          ? selected.row - 1
          : from > selected.row && to <= selected.row
            ? selected.row + 1
            : selected.row;
    onChange(next, { row, column: selected.column });
  };

  const full = fieldCount >= FORM_FIELD_COUNT.max;
  return (
    <div ref={builder} className="forms-builder">
      {/* Escape is handled where it reaches the builder, so it clears the
          selection from wherever the focus is inside it. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: The builder only listens for Escape bubbling up from its own controls. */}
      <div
        className="forms-builder__layout"
        onKeyDown={(event) => {
          if (event.key === "Escape") onSelect(null);
        }}
      >
        <Card className="forms-palette">
          <Card.Header title={text("formPalette")} />
          <Card.Body>
            <p className="forms-palette__hint">{text("formPaletteHint")}</p>
            <div className="forms-palette__tiles">
              {FORM_FIELD_TYPES.map((type) => {
                const Icon = FIELD_TYPE_ICON[type];
                const label = text(FIELD_TYPE_TEXT[type]);
                return (
                  <button
                    key={type}
                    type="button"
                    className="forms-palette__tile"
                    disabled={full}
                    {...draggable({ kind: "palette", type }, label)}
                    onClick={clicked(() =>
                      apply(insertField(form, type, { kind: "new-row", row: form.rows.length })),
                    )}
                  >
                    <Icon aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </Card.Body>
        </Card>
        <div className="forms-builder__main">
          <Card>
            {header}
            <Card.Body>
              <p id={hintId} hidden>
                {text("formFieldMoveHint")}
              </p>
              <div ref={canvas} className="forms-canvas">
                <Reorder.List className="forms-rows" onMove={moveRowTo}>
                  {form.rows.map((row, rowIndex) => {
                    const free = freeColumns(row);
                    return (
                      <Reorder.Item key={row.fields.map((field) => field.key).join(" ")} index={rowIndex}>
                        <div className="forms-row">
                          <Reorder.Handle index={rowIndex} label={text("formRowMove", rowIndex + 1)} />
                          <div
                            ref={(element) => {
                              if (element) rowGrids.current.set(rowIndex, element);
                              else rowGrids.current.delete(rowIndex);
                            }}
                            className="forms-row__grid"
                            style={{ "--columns": FORM_COLUMNS } as CSSProperties}
                          >
                            {row.fields.map((field, column) => {
                              const place = { row: rowIndex, column };
                              const isSelected = selected?.row === rowIndex && selected.column === column;
                              const isDragged =
                                drag?.source.kind === "field" &&
                                drag.source.place.row === rowIndex &&
                                drag.source.place.column === column;
                              const Icon = FIELD_TYPE_ICON[field.type];
                              const label = field.label[language] || field.key;
                              return (
                                <div
                                  key={field.key}
                                  ref={(element) => {
                                    if (element) fieldBoxes.current.set(`${rowIndex}:${column}`, element);
                                    else fieldBoxes.current.delete(`${rowIndex}:${column}`);
                                  }}
                                  className="forms-field"
                                  data-selected={isSelected || undefined}
                                  data-dragged={isDragged || undefined}
                                  style={{ "--span": fieldSpan(field) } as CSSProperties}
                                >
                                  <button
                                    type="button"
                                    ref={(element) => {
                                      if (element) fieldButtons.current.set(field.key, element);
                                      else fieldButtons.current.delete(field.key);
                                    }}
                                    className="forms-field__select"
                                    aria-pressed={isSelected}
                                    aria-describedby={hintId}
                                    {...draggable({ kind: "field", place }, label)}
                                    onClick={clicked((event) => {
                                      // Safari leaves a clicked button without the focus, and the
                                      // arrow keys and Escape act on the focused field.
                                      event.currentTarget.focus();
                                      onSelect(place);
                                    })}
                                    onKeyDown={(event) => moveByKey(event, place, field.key)}
                                  >
                                    <Icon className="forms-field__icon" aria-hidden="true" />
                                    <span className="forms-field__label">
                                      {label}
                                      {field.required && (
                                        <span className="forms-field__required" title={text("formRequired")}>
                                          {" *"}
                                        </span>
                                      )}
                                    </span>
                                    <small className="forms-field__type">
                                      {text(FIELD_TYPE_TEXT[field.type])}
                                    </small>
                                  </button>
                                  <Button.Icon
                                    className="forms-field__remove"
                                    label={text("formFieldRemove")}
                                    icon={<XIcon />}
                                    disabled={fieldCount <= FORM_FIELD_COUNT.min}
                                    onClick={() => onChange(removeField(form, place), null)}
                                  />
                                </div>
                              );
                            })}
                            {free > 0 && (
                              <div
                                className="forms-row__free"
                                style={{ "--span": free } as CSSProperties}
                                role="img"
                                aria-label={text("formFreeColumns", free, FORM_COLUMNS)}
                              >
                                {free}/{FORM_COLUMNS}
                              </div>
                            )}
                          </div>
                        </div>
                      </Reorder.Item>
                    );
                  })}
                </Reorder.List>
                {drag?.marker && (
                  <div
                    className="forms-canvas__marker"
                    style={{
                      left: drag.marker.left,
                      top: drag.marker.top,
                      width: drag.marker.width,
                      height: drag.marker.height,
                    }}
                  />
                )}
              </div>
            </Card.Body>
          </Card>
          {children}
        </div>
      </div>
      {drag && (
        <div className="forms-builder__ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          {drag.label}
        </div>
      )}
    </div>
  );
}
