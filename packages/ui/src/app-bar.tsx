import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { type DivProps, join } from "./shared.js";

/**
 * The bar across the top of a workbench's content, beside its sidebar.
 *
 * Three places and nothing else: the start for the way back or where the
 * reader is, the centre for what just happened, and the end for what the
 * screen can do. The centre stays centred whatever the two sides hold, because
 * the columns either side of it share what is left equally.
 */
const AppBarRoot = forwardRef<HTMLElement, ComponentPropsWithoutRef<"header">>(
  ({ className, ...props }, ref) => <header ref={ref} className={join("app-bar", className)} {...props} />,
);
/** The start of the bar: the way back, or the name of where the reader is. */
const AppBarStart = forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={join("app-bar__start", className)} {...props} />
));
/** The centre of the bar: what just happened. */
const AppBarCenter = forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={join("app-bar__center", className)} {...props} />
));
/** The end of the bar: the screen's actions, the most important last. */
const AppBarEnd = forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={join("app-bar__end", className)} {...props} />
));
/** A bar with a start, a centre and an end. */
export const AppBar = Object.assign(AppBarRoot, {
  Start: AppBarStart,
  Center: AppBarCenter,
  End: AppBarEnd,
});
