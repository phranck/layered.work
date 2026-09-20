import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { join } from "./shared.js";

/** Only brands used by the configured social accounts are shipped. */
export type BrandName = "mastodon" | "github" | "youtube" | "instagram" | "xing";

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
