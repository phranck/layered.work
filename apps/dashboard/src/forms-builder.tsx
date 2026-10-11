import {
  type ContentLanguage,
  type CreateFormBody,
  FORM_COLUMNS,
  FORM_FIELD_COUNT,
  FORM_FIELD_TYPES,
  type FormField,
  type FormFieldType,
  fieldSpan,
  formFields,
} from "@layered/schemas";
import { Card, FieldHint } from "@layered/ui";
import {
  CalendarBlankIcon,
  CaretCircleDownIcon,
  CheckSquareIcon,
  DotsSixVerticalIcon,
  EnvelopeSimpleIcon,
  HashIcon,
  type IconProps,
  ListChecksIcon,
  ShieldCheckIcon,
  TextAaIcon,
  TextAlignLeftIcon,
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
import { createPortal } from "react-dom";
import { ActionButton } from "./action-button.js";
import {
  type DragSource,
  dropTarget,
  gripSource,
  type Point,
  type RowBox,
  rowDropIndex,
} from "./forms-drag.js";
import {
  FIELD_TYPE_TEXT,
  type FieldDirection,
  type FieldPlace,
  fieldAt,
  freeColumns,
  insertField,
  keyTarget,
  moveField,
  moveRow,
  type PlacedChange,
  removeField,
} from "./forms-model.js";
import { zoomOf } from "./interface-scale.js";
import { useDashboardLanguage } from "./language-context.js";
import { MoveKeysDescription } from "./reorder.js";
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

/** The direction each arrow key moves a selected field in. */
const ARROW_DIRECTIONS: Readonly<Record<string, FieldDirection>> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

/** The step each arrow key moves a row by its grip. */
const ROW_STEPS: Readonly<Record<string, number>> = { ArrowUp: -1, ArrowDown: 1 };

/** A press on a tile, a field or a grip, which becomes a drag once the pointer has travelled. */
type Press = { source: DragSource; element: HTMLElement; pointer: number; start: Point };

/**
 * A drag in progress.
 *
 * @property rows - The rows as they stood when the drag began, in the canvas's own pixels. Every target is worked out against these, so the canvas making room while the drag lasts never moves the targets under the pointer.
 * @property grab - Where in the carried item it was taken hold of, in its own pixels, so the copy under the pointer stays held at that place.
 * @property size - The carried item's size, in its own pixels.
 * @property layer - The workbench, which the copy is drawn in, so that no scrolling column clips it and the workbench's sizes apply to it.
 * @property inLayer - Where the pointer is, in the window's pixels divided by the interface scale, which the fixed copy is placed in.
 * @property inCanvas - Where the pointer is, in the canvas's own pixels, which the rows were measured in.
 */
type Drag = {
  source: DragSource;
  pointer: number;
  rows: RowBox[];
  grab: Point;
  size: { width: number; height: number };
  layer: HTMLElement;
  inLayer: Point;
  inCanvas: Point;
};

/**
 * What the canvas shows while a drag lasts: the form as the drop would leave
 * it, and where the carried item would stand in it.
 */
type Preview = {
  form: CreateFormBody;
  landing: { kind: "field"; place: FieldPlace } | { kind: "row"; row: number };
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
 * A field as the canvas shows it: its kind's mark, its label with the mark of
 * a required field, and the name of its kind. The canvas's card and the copy
 * carried under the pointer both draw it, so the two look alike.
 */
function FieldFace({ field, language }: { field: FormField; language: ContentLanguage }) {
  const { text } = useDashboardLanguage();
  const Icon = FIELD_TYPE_ICON[field.type];
  return (
    <>
      <Icon className="forms-field__icon" aria-hidden="true" />
      <span className="forms-field__label">
        {field.label[language] || field.key}
        {field.required && (
          <span className="forms-field__required" title={text("formRequired")}>
            {" *"}
          </span>
        )}
      </span>
      <FieldHint className="forms-field__type">{text(FIELD_TYPE_TEXT[field.type])}</FieldHint>
    </>
  );
}

/**
 * The copy that follows the pointer while something is dragged, drawn as the
 * thing itself: a tile as a tile, a field as its card, a row as its fields on
 * the row's columns.
 */
function Carried({
  source,
  form,
  language,
}: {
  source: DragSource;
  form: CreateFormBody;
  language: ContentLanguage;
}) {
  const { text } = useDashboardLanguage();
  if (source.kind === "palette") {
    const Icon = FIELD_TYPE_ICON[source.type];
    return (
      <span className="forms-palette__tile">
        <Icon aria-hidden="true" />
        <span>{text(FIELD_TYPE_TEXT[source.type])}</span>
      </span>
    );
  }
  if (source.kind === "field") {
    const field = fieldAt(form, source.place);
    return field ? (
      <span className="forms-field__select">
        <FieldFace field={field} language={language} />
      </span>
    ) : null;
  }
  const row = form.rows[source.row];
  return row ? (
    <div className="forms-row">
      <span className="forms-row__grip" aria-hidden="true">
        <DotsSixVerticalIcon />
      </span>
      <div className="forms-row__grid" style={{ "--columns": FORM_COLUMNS } as CSSProperties}>
        {row.fields.map((field) => (
          <div
            key={field.key}
            className="forms-field"
            style={{ "--span": fieldSpan(field) } as CSSProperties}
          >
            <span className="forms-field__select">
              <FieldFace field={field} language={language} />
            </span>
          </div>
        ))}
      </div>
    </div>
  ) : null;
}

/**
 * The palette of field types beside the canvas of the form's rows, as in lmaa's
 * builder.
 *
 * A tile adds its field in a row of its own at the end when clicked, and where
 * it is dropped when dragged. A field moves within its row and between rows by
 * dragging its card, or with the arrow keys once it has the focus. A row moves
 * by its grip, dragged or with the arrow keys, and the grip of a row holding one
 * field carries that field, so it can also be set beside another.
 *
 * While something is dragged, a copy of it follows the pointer, and the canvas
 * shows the form as the drop would leave it, with the carried item drawn as a
 * slot where it would stand and at the width it would take. That form comes
 * from the same change `forms-model.ts` makes on the drop, so what is shown is
 * what happens. The targets are worked out against the rows as they stood when
 * the drag began, so the canvas making room does not move them.
 */
export function FormBuilder({ form, selected, onSelect, onChange, header, children }: FormBuilderProps) {
  const { text } = useDashboardLanguage();
  // The labels show in the language the panel's switch has chosen, as the preview does.
  const language = useTextLanguage();
  const hintId = useId();
  const rowKeysId = useId();
  const paletteHintId = useId();
  const builder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const rowElements = useRef(new Map<number, HTMLElement>());
  const rowGrids = useRef(new Map<number, HTMLElement>());
  const fieldBoxes = useRef(new Map<string, HTMLElement>());
  const fieldButtons = useRef(new Map<string, HTMLButtonElement>());
  const press = useRef<Press | null>(null);
  const dragging = useRef<Drag | null>(null);
  const pressEndedInDrag = useRef(false);
  const [drag, setDragState] = useState<Drag | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const fieldCount = formFields(form).length;
  const selectedKey = selected ? fieldAt(form, selected)?.key : undefined;

  // A field moved by the keyboard is drawn anew in its new row, so the focus is
  // handed to it again once it stands there.
  useEffect(() => {
    if (!focusKey) return;
    fieldButtons.current.get(focusKey)?.focus();
    setFocusKey(null);
  }, [focusKey]);

  /** Keeps the drag in a ref for the pointer handlers and in state for drawing. */
  const setDrag = (next: Drag | null) => {
    dragging.current = next;
    setDragState(next);
  };

  /** A point of the window in an element's own pixels, which the interface scale divides by its zoom. */
  const within = (element: HTMLElement, clientX: number, clientY: number): Point => {
    const box = element.getBoundingClientRect();
    const zoom = zoomOf(element);
    return { x: (clientX - box.left) / zoom, y: (clientY - box.top) / zoom };
  };

  /** The rows and their fields as they stand on the screen now, in the canvas's own pixels. */
  const measureRows = (container: HTMLElement): RowBox[] =>
    form.rows.map((row, index): RowBox => {
      const grid = rowGrids.current.get(index)?.getBoundingClientRect();
      const top = within(container, 0, grid?.top ?? 0).y;
      const bottom = within(container, 0, grid?.bottom ?? 0).y;
      return {
        top,
        bottom,
        fields: row.fields.map((_, column) => {
          const field = fieldBoxes.current.get(`${index}:${column}`)?.getBoundingClientRect();
          return {
            start: within(container, field?.left ?? 0, 0).x,
            end: within(container, field?.right ?? 0, 0).x,
          };
        }),
        free: freeColumns(row),
      };
    });

  /** The element a source is drawn by, whose size and place the carried copy takes. */
  const carriedElement = (current: Press): HTMLElement | undefined => {
    const { source } = current;
    if (source.kind === "palette") return current.element;
    if (source.kind === "field") return fieldBoxes.current.get(`${source.place.row}:${source.place.column}`);
    return rowElements.current.get(source.row);
  };

  /** The form a drag would leave, and where the carried item would stand. Nothing where the drop would change nothing. */
  const previewOf = (current: Drag): Preview | undefined => {
    const { source } = current;
    if (source.kind === "row") {
      const to = rowDropIndex(current.rows, current.inCanvas, source.row);
      return { form: moveRow(form, source.row, to), landing: { kind: "row", row: to } };
    }
    const target = dropTarget(current.rows, current.inCanvas, source);
    const change: PlacedChange =
      source.kind === "palette"
        ? insertField(form, source.type, target)
        : moveField(form, source.place, target);
    return change.form === form
      ? undefined
      : { form: change.form, landing: { kind: "field", place: change.place } };
  };

  /** Moves a row, keeping the selected field selected. */
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

  /** Applies a finished drag, as its preview showed it. */
  const drop = (current: Drag) => {
    const preview = previewOf(current);
    if (!preview) return;
    if (preview.landing.kind === "row" && current.source.kind === "row")
      return moveRowTo(current.source.row, preview.landing.row);
    if (preview.landing.kind === "field") onChange(preview.form, preview.landing.place);
  };

  /** Ends a press or a drag without dropping. */
  const release = () => {
    const current = dragging.current;
    if (current && builder.current?.hasPointerCapture(current.pointer))
      builder.current.releasePointerCapture(current.pointer);
    press.current = null;
    setDrag(null);
  };

  // The pointer is followed on the window rather than on the element pressed,
  // because the canvas redraws while the drag lasts and the element pressed
  // can move to another row or leave the canvas. The handlers read the render
  // they were last given.
  const pointer = useRef({
    move: (_event: globalThis.PointerEvent) => {},
    up: (_event: globalThis.PointerEvent) => {},
    cancel: () => {},
  });
  pointer.current = {
    move(event) {
      const current = press.current;
      if (!current || current.pointer !== event.pointerId) return;
      // A button released outside the window sends no pointerup here.
      if (event.buttons === 0) return release();
      const root = builder.current;
      const container = canvas.current;
      if (!root || !container) return;
      let active = dragging.current;
      if (!active) {
        if (Math.hypot(event.clientX - current.start.x, event.clientY - current.start.y) < DRAG_THRESHOLD)
          return;
        const element = carriedElement(current);
        if (!element) return;
        const box = element.getBoundingClientRect();
        const zoom = zoomOf(element);
        // Taken by the builder from here on, so the pointer is not lost to the
        // element pressed when the canvas redraws it.
        root.setPointerCapture(event.pointerId);
        const layer = root.closest<HTMLElement>(".workbench") ?? document.body;
        active = {
          source: current.source,
          pointer: event.pointerId,
          rows: measureRows(container),
          grab: { x: (current.start.x - box.left) / zoom, y: (current.start.y - box.top) / zoom },
          size: { width: box.width / zoom, height: box.height / zoom },
          layer,
          inLayer: { x: 0, y: 0 },
          inCanvas: { x: 0, y: 0 },
        };
      }
      const layerZoom = zoomOf(active.layer);
      setDrag({
        ...active,
        inLayer: { x: event.clientX / layerZoom, y: event.clientY / layerZoom },
        inCanvas: within(container, event.clientX, event.clientY),
      });
    },
    up(event) {
      const current = press.current;
      if (!current || current.pointer !== event.pointerId) return;
      const active = dragging.current;
      const container = canvas.current;
      release();
      if (!active || !container) return;
      pressEndedInDrag.current = true;
      drop({ ...active, inCanvas: within(container, event.clientX, event.clientY) });
    },
    cancel() {
      release();
    },
  };
  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => pointer.current.move(event);
    const up = (event: globalThis.PointerEvent) => pointer.current.up(event);
    const cancel = () => pointer.current.cancel();
    const cancelOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && dragging.current) pointer.current.cancel();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", cancelOnEscape);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", cancelOnEscape);
    };
  }, []);

  /** The press that lets a tile, a field or a grip be dragged. */
  const pressed = (source: DragSource) => (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    // A browser that sends no click after a drag would otherwise leave the
    // flag standing, and the next real click would be lost.
    pressEndedInDrag.current = false;
    press.current = {
      source,
      element: event.currentTarget,
      pointer: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
    };
  };

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
    const change = moveField(form, place, target);
    onChange(change.form, change.place);
    setFocusKey(key);
  };

  /** Moves a row one step with an arrow key on its grip. */
  const moveRowByKey = (event: KeyboardEvent<HTMLButtonElement>, row: number) => {
    const step = ROW_STEPS[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const to = row + step;
    if (to < 0 || to >= form.rows.length) return;
    moveRowTo(row, to);
  };

  const preview = drag ? previewOf(drag) : undefined;
  const shown = preview?.form ?? form;
  const landingField = preview?.landing.kind === "field" ? preview.landing.place : undefined;
  const landingRow = preview?.landing.kind === "row" ? preview.landing.row : undefined;
  const full = fieldCount >= FORM_FIELD_COUNT.max;

  return (
    <div ref={builder} className="forms-builder" data-dragging={drag ? true : undefined}>
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
            <p id={paletteHintId} hidden>
              {text("formPaletteHint")}
            </p>
            <div className="forms-palette__tiles">
              {FORM_FIELD_TYPES.map((type) => {
                const Icon = FIELD_TYPE_ICON[type];
                return (
                  <button
                    key={type}
                    type="button"
                    className="forms-palette__tile"
                    aria-describedby={paletteHintId}
                    disabled={full}
                    onPointerDown={pressed({ kind: "palette", type })}
                    onClick={clicked(() => {
                      const change = insertField(form, type, { kind: "new-row", row: form.rows.length });
                      onChange(change.form, change.place);
                    })}
                  >
                    <Icon aria-hidden="true" />
                    <span>{text(FIELD_TYPE_TEXT[type])}</span>
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
              <MoveKeysDescription id={rowKeysId} />
              <div ref={canvas} className="forms-rows">
                {shown.rows.map((row, rowIndex) => {
                  const free = freeColumns(row);
                  return (
                    <div
                      key={row.fields.map((field) => field.key).join(" ")}
                      ref={(element) => {
                        if (element) rowElements.current.set(rowIndex, element);
                        else rowElements.current.delete(rowIndex);
                      }}
                      className="forms-row"
                      data-landing={landingRow === rowIndex || undefined}
                      data-target={landingField?.row === rowIndex || undefined}
                    >
                      <ActionButton.Icon
                        action="move"
                        className="forms-row__grip"
                        label={text("formRowMove", rowIndex + 1)}
                        aria-describedby={rowKeysId}
                        onPointerDown={pressed(gripSource(form, rowIndex))}
                        onKeyDown={(event) => moveRowByKey(event, rowIndex)}
                      />
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
                          const isLanding = landingField?.row === rowIndex && landingField.column === column;
                          const isDragged =
                            !preview &&
                            drag?.source.kind === "field" &&
                            drag.source.place.row === rowIndex &&
                            drag.source.place.column === column;
                          return (
                            <div
                              key={field.key}
                              ref={(element) => {
                                if (element) fieldBoxes.current.set(`${rowIndex}:${column}`, element);
                                else fieldBoxes.current.delete(`${rowIndex}:${column}`);
                              }}
                              className="forms-field"
                              data-selected={(!drag && field.key === selectedKey) || undefined}
                              data-landing={isLanding || undefined}
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
                                aria-pressed={field.key === selectedKey}
                                aria-describedby={hintId}
                                onPointerDown={pressed({ kind: "field", place })}
                                onClick={clicked((event) => {
                                  // Safari leaves a clicked button without the focus, and the
                                  // arrow keys and Escape act on the focused field.
                                  event.currentTarget.focus();
                                  onSelect(place);
                                })}
                                onKeyDown={(event) => moveByKey(event, place, field.key)}
                              >
                                <FieldFace field={field} language={language} />
                              </button>
                              <ActionButton.Icon
                                action="remove"
                                className="forms-field__remove"
                                label={text("formFieldRemove")}
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
                  );
                })}
              </div>
            </Card.Body>
          </Card>
          {children}
        </div>
      </div>
      {drag &&
        createPortal(
          <div
            className="forms-builder__carried"
            style={{
              left: drag.inLayer.x - drag.grab.x,
              top: drag.inLayer.y - drag.grab.y,
              width: drag.size.width,
              height: drag.size.height,
            }}
            aria-hidden="true"
          >
            <Carried source={drag.source} form={form} language={language} />
          </div>,
          drag.layer,
        )}
    </div>
  );
}
