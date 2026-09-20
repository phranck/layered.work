import { type ComponentPropsWithoutRef, forwardRef, type ReactNode } from "react";
import { type DivProps, join, type SpanProps } from "./shared.js";

/** Props for a row text block. */
export interface RowTextProps extends Omit<SpanProps, "title"> {
  title?: ReactNode;
  note?: ReactNode;
}
/** The static row container. */
const RowRoot = forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={join("row", className)} {...props} />
));
/** An interactive button row. */
const RowButton = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<"button">>(
  ({ className, type = "button", ...props }, ref) => (
    <button ref={ref} className={join("row row--interactive", className)} type={type} {...props} />
  ),
);
/** An interactive link row. */
const RowLink = forwardRef<HTMLAnchorElement, ComponentPropsWithoutRef<"a">>(
  ({ className, ...props }, ref) => (
    <a ref={ref} className={join("row row--interactive", className)} {...props} />
  ),
);
/** An unpadded row for an existing surface. */
const RowBare = forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={join("row row--bare", className)} {...props} />
));
const makeSpan = (base: string) =>
  forwardRef<HTMLSpanElement, SpanProps>(({ className, ...props }, ref) => (
    <span ref={ref} className={join(base, className)} {...props} />
  ));
/** Leading row content. */
const RowLead = makeSpan("row__lead");
/** Framed leading row content. */
const RowTile = makeSpan("row__lead row__tile");
/** The decorative drag grip. */
const RowGrip = forwardRef<HTMLSpanElement, SpanProps>(({ className, ...props }, ref) => (
  <span ref={ref} className={join("row__lead row__grip", className)} aria-hidden="true" {...props} />
));
/** The row title and note. */
const RowText = forwardRef<HTMLSpanElement, RowTextProps>(
  ({ children, className, note, title, ...props }, ref) => (
    <span ref={ref} className={join("row__text", className)} {...props}>
      {title && <span className="row__title">{title}</span>}
      {note && <span className="row__note">{note}</span>}
      {children}
    </span>
  ),
);
/** Row metadata. */
const RowMeta = makeSpan("row__meta");
/** Row actions. */
const RowActions = makeSpan("row__actions actions");
/** A composable one-line list row. */
export const Row = Object.assign(RowRoot, {
  Button: RowButton,
  Link: RowLink,
  Bare: RowBare,
  Lead: RowLead,
  Tile: RowTile,
  Grip: RowGrip,
  Text: RowText,
  Meta: RowMeta,
  Actions: RowActions,
});
/** The row list container. */
const RowListRoot = forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={join("row-list", className)} {...props} />
));
/** A row list with separators. */
const RowListDivided = forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={join("row-list row-list--divided", className)} {...props} />
));
/** A row container with an optional divided shape. */
export const RowList = Object.assign(RowListRoot, { Divided: RowListDivided });
