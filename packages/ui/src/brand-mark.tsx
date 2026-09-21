import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { join } from "./shared.js";

/** Only brands the interface actually shows are shipped: the social accounts, and the languages a code block names. */
export type BrandName =
  | "mastodon"
  | "github"
  | "youtube"
  | "instagram"
  | "xing"
  | "swift"
  | "gnubash"
  | "html5";

/** A decorative brand mark; its surrounding link supplies the accessible name. */
export interface BrandMarkProps extends Omit<ComponentPropsWithoutRef<"span">, "children"> {
  brand: BrandName;
}

/** An unchanged Simple Icons asset, coloured by its parent's text through a CSS mask. */
export const BrandMark = forwardRef<HTMLSpanElement, BrandMarkProps>(
  ({ brand, className, ...props }, ref) => (
    <span
      {...props}
      ref={ref}
      className={join("brand-mark", className)}
      data-brand={brand}
      aria-hidden="true"
    />
  ),
);
