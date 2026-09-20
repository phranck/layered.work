import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { type DivProps, join } from "./shared.js";

/** The sidebar container. */
const SidebarRoot = forwardRef<HTMLElement, ComponentPropsWithoutRef<"aside">>(
  ({ className, ...props }, ref) => <aside ref={ref} className={join("sidebar", className)} {...props} />,
);
/** The sidebar logo area. */
const SidebarHeader = forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={join("sidebar__header", className)} {...props} />
));
/** The scrollable sidebar navigation. */
const SidebarBody = forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={join("sidebar__body", className)} {...props} />
));
/** The sidebar footer. */
const SidebarFooter = forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={join("sidebar__footer", className)} {...props} />
));
/**
 * The sidebar separator, static until a consumer supplies resizing behavior.
 * Interactive consumers must supply tabIndex, aria-valuenow and keyboard handlers.
 * @see https://www.w3.org/TR/wai-aria/#separator
 */
const SidebarHandle = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    // biome-ignore lint/a11y/useSemanticElements: Native hr margins and borders change the prototype resize handle geometry.
    // biome-ignore lint/a11y/useFocusableInteractive: WAI-ARIA also defines a non-focusable structural separator.
    <div
      ref={ref}
      className={join("sidebar__handle", className)}
      data-resize-handle
      // biome-ignore lint/a11y/useAriaPropsForRole: aria-valuenow is required only when the separator is focusable.
      role="separator"
      aria-orientation="vertical"
      {...props}
    />
  ),
);
/** A fixed-shape navigation sidebar. */
export const Sidebar = Object.assign(SidebarRoot, {
  Header: SidebarHeader,
  Body: SidebarBody,
  Footer: SidebarFooter,
  Handle: SidebarHandle,
});
