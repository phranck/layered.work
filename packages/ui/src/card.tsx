import { type ComponentPropsWithoutRef, type CSSProperties, forwardRef, type ReactNode, useId } from "react";
import { CaretDownIcon } from "./icons.js";
import { type DivProps, join } from "./shared.js";

/** Props for a card header. */
export interface CardHeaderProps extends Omit<ComponentPropsWithoutRef<"header">, "title"> {
  eyebrow?: ReactNode;
  title?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}
/** Props for a card footer. */
export interface CardFooterProps extends ComponentPropsWithoutRef<"footer"> {
  note?: ReactNode;
  actions?: ReactNode;
}
/** Props for card media. */
export interface CardMediaProps extends DivProps {
  src: string;
  alt?: string;
  ratio?: CSSProperties["aspectRatio"];
}

/** The root card surface. */
const CardRoot = forwardRef<HTMLElement, ComponentPropsWithoutRef<"section">>(
  ({ className, ...props }, ref) => <section ref={ref} className={join("card", className)} {...props} />,
);
/** A card that acts as a link. */
const CardLink = forwardRef<HTMLAnchorElement, ComponentPropsWithoutRef<"a">>(
  ({ className, ...props }, ref) => (
    <a ref={ref} className={join("card card--interactive", className)} {...props} />
  ),
);
/** The card heading and actions. */
const CardHeader = forwardRef<HTMLElement, CardHeaderProps>(
  ({ actions, children, className, eyebrow, meta, title, ...props }, ref) => (
    <header ref={ref} className={join("card__header", className)} {...props}>
      <div className="card__heading">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        {title && (
          <h2 className="card__title">
            {title}
            {meta && <span className="card__meta">{meta}</span>}
          </h2>
        )}
        {children}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  ),
);
/** Padded card content. */
const CardBody = forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={join("card__body", className)} {...props} />
));
/** Vertically stacked card content. */
const CardStack = forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={join("card__body card__body--stack", className)} {...props} />
));
/** The card note and actions. */
const CardFooter = forwardRef<HTMLElement, CardFooterProps>(
  ({ actions, children, className, note, ...props }, ref) => (
    <footer ref={ref} className={join("card__footer", className)} {...props}>
      {note && <p className="card__note">{note}</p>}
      {(actions || children) && <div className="actions">{actions ?? children}</div>}
    </footer>
  ),
);
/** Edge-to-edge card media. */
const CardMedia = forwardRef<HTMLDivElement, CardMediaProps>(
  ({ alt = "", children, className, ratio, src, style, ...props }, ref) => (
    <div
      ref={ref}
      className={join("card__media", className)}
      style={{ ...style, aspectRatio: ratio }}
      {...props}
    >
      <img src={src} alt={alt} loading="lazy" />
      {children}
    </div>
  ),
);
/** A caption for card media. */
const CardCaption = forwardRef<HTMLElement, ComponentPropsWithoutRef<"figcaption">>(
  ({ className, ...props }, ref) => (
    <figcaption ref={ref} className={join("card__caption", className)} {...props} />
  ),
);

/** Props for a card whose content opens and closes under its header. */
export interface CardCollapsibleProps extends Omit<ComponentPropsWithoutRef<"section">, "title"> {
  title: ReactNode;
  /** Beside the title, as `Card.Header` places it. */
  meta?: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
/**
 * A card whose header opens and closes what follows it.
 *
 * The whole header is the button, with a caret that turns as the content opens.
 * The content stays in the document whilst closed, so its height can animate in
 * both directions, and it is inert then, so neither the keyboard nor a screen
 * reader reaches what cannot be seen. Its children are the card's own parts,
 * such as `Card.Body` and `Card.Footer`.
 */
const CardCollapsible = forwardRef<HTMLElement, CardCollapsibleProps>(
  ({ children, className, meta, onOpenChange, open, title, ...props }, ref) => {
    const regionId = useId();
    return (
      <section
        ref={ref}
        className={join("card card--collapsible", className)}
        data-open={open || undefined}
        {...props}
      >
        <header className="card__header">
          <h2 className="card__title">
            <button
              type="button"
              className="card__toggle"
              aria-expanded={open}
              aria-controls={regionId}
              onClick={() => onOpenChange(!open)}
            >
              <CaretDownIcon className="card__caret" aria-hidden="true" />
              {title}
            </button>
            {meta && <span className="card__meta">{meta}</span>}
          </h2>
        </header>
        <div id={regionId} className="card__collapse" inert={!open}>
          {children}
        </div>
      </section>
    );
  },
);
/** A composable content surface. */
export const Card = Object.assign(CardRoot, {
  Link: CardLink,
  Header: CardHeader,
  Body: CardBody,
  Stack: CardStack,
  Footer: CardFooter,
  Media: CardMedia,
  Caption: CardCaption,
  Collapsible: CardCollapsible,
});
