import { type ComponentPropsWithoutRef, type CSSProperties, forwardRef } from "react";
import { join } from "./shared.js";

/** Props for the shared logo link. */
export interface LogoProps extends ComponentPropsWithoutRef<"a"> {
  src?: string;
  label?: string;
  inkHeight?: CSSProperties["height"];
  imageProps?: Omit<ComponentPropsWithoutRef<"img">, "src" | "alt">;
}
/** The shared wordmark, with its asset supplied by the caller or `/logo.svg`. */
export const Logo = forwardRef<HTMLAnchorElement, LogoProps>(
  (
    {
      children,
      className,
      href = "/",
      imageProps,
      inkHeight,
      label = "LAYERED.work",
      src = "/logo.svg",
      style,
      ...props
    },
    ref,
  ) => (
    <a
      ref={ref}
      className={join("logo", className)}
      href={href}
      aria-label={label}
      style={
        {
          ...style,
          "--logo-ink-height": typeof inkHeight === "number" ? `${inkHeight}px` : inkHeight,
        } as CSSProperties
      }
      {...props}
    >
      <img {...imageProps} className={join("logo__image", imageProps?.className)} src={src} alt={label} />
      {children}
    </a>
  ),
);
