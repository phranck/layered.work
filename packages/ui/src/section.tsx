import { type ComponentPropsWithoutRef, forwardRef, type ReactNode } from "react";
import { type DivProps, join } from "./shared.js";

/** Props for a section title. */
export interface SectionTitleProps extends Omit<ComponentPropsWithoutRef<"header">, "title"> {
  lead?: ReactNode;
  eyebrow?: ReactNode;
  title?: ReactNode;
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  actions?: ReactNode;
}
/** Props for a page-leading section title. */
export interface SectionLeadProps extends Omit<ComponentPropsWithoutRef<"header">, "title"> {
  eyebrow?: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
}
/** The section container. */
const SectionRoot = forwardRef<HTMLElement, ComponentPropsWithoutRef<"section">>(
  ({ className, ...props }, ref) => <section ref={ref} className={join("section", className)} {...props} />,
);
/** A section with page rhythm. */
const SectionPage = forwardRef<HTMLElement, ComponentPropsWithoutRef<"section">>(
  ({ className, ...props }, ref) => (
    <section ref={ref} className={join("section section--page", className)} {...props} />
  ),
);
/** The configurable section heading. */
const SectionTitle = forwardRef<HTMLElement, SectionTitleProps>(
  ({ actions, children, className, eyebrow, lead, level = 2, title, ...props }, ref) => {
    const Heading = `h${level}` as const;
    return (
      <header ref={ref} className={join("section__title", className)} {...props}>
        <div className="section__start">
          {lead}
          <div className="section__heading">
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            {title && <Heading className="section__name">{title}</Heading>}
            {children}
          </div>
        </div>
        {actions && <div className="actions">{actions}</div>}
      </header>
    );
  },
);
/** A page-leading section heading. */
const SectionLead = forwardRef<HTMLElement, SectionLeadProps>(
  ({ actions, children, className, eyebrow, title, ...props }, ref) => (
    <header ref={ref} className={join("section__title section__title--lead", className)} {...props}>
      <div className="section__start">
        <div className="section__heading">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          {title && <h1 className="section__name">{title}</h1>}
          {children}
        </div>
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  ),
);
/** Plain section content. */
const SectionBody = forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={join("section__body", className)} {...props} />
));
/** Grid section content. */
const SectionGrid = forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={join("section__body section__body--grid", className)} {...props} />
));
/** Stacked section content. */
const SectionStack = forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={join("section__body section__body--stack", className)} {...props} />
));
/** A heading and the content belonging to it. */
export const Section = Object.assign(SectionRoot, {
  Page: SectionPage,
  Title: SectionTitle,
  Lead: SectionLead,
  Body: SectionBody,
  Grid: SectionGrid,
  Stack: SectionStack,
});
