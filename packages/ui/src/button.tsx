import { type ComponentPropsWithoutRef, forwardRef, type ReactNode } from "react";
import { join } from "./shared.js";

type Tone = "primary" | "secondary" | "danger";
type Size = "small";

function buttonClasses(tone: Tone, size?: Size, className?: string): string {
  return join("button", `button--${tone}`, size === "small" && "button--small", className);
}

/** Props shared by labelled button shapes. */
export interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  /** Optional icon rendered before the label. */
  icon?: ReactNode;
  /** Visual emphasis. */
  tone?: Tone;
  /** Compact workbench size. */
  size?: Size;
}

/** Props for a button-shaped link. */
export interface ButtonLinkProps extends ComponentPropsWithoutRef<"a"> {
  /** Optional icon rendered before the label. */
  icon?: ReactNode;
  /** Visual emphasis. */
  tone?: Tone;
  /** Compact workbench size. */
  size?: Size;
}

/** Props for an icon-only button. */
export interface ButtonIconProps extends Omit<ComponentPropsWithoutRef<"button">, "children"> {
  /** Accessible name and native tooltip. */
  label: string;
  /** Icon content hidden from assistive technology. */
  icon: ReactNode;
}

/** Props for a non-interactive button-shaped mark. */
export interface ButtonInertProps extends ComponentPropsWithoutRef<"span"> {
  /** Optional icon rendered before the label. */
  icon?: ReactNode;
  /** Visual emphasis. */
  tone?: Tone;
  /** Compact workbench size. */
  size?: Size;
}

/** The standard action button. */
const ButtonRoot = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, className, icon, size, tone = "secondary", type = "button", ...props }, ref) => (
    <button ref={ref} className={buttonClasses(tone, size, className)} type={type} {...props}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </button>
  ),
);
/** A button-shaped navigation link. */
const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(
  ({ children, className, icon, size, tone = "secondary", ...props }, ref) => (
    <a ref={ref} className={buttonClasses(tone, size, className)} {...props}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </a>
  ),
);
/** An icon-only action button. */
const ButtonIcon = forwardRef<HTMLButtonElement, ButtonIconProps>(
  ({ className, icon, label, title = label, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      className={join("button button--ghost button--icon", className)}
      type={type}
      aria-label={label}
      title={title}
      {...props}
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  ),
);
/** A non-interactive button-shaped mark. */
const ButtonInert = forwardRef<HTMLSpanElement, ButtonInertProps>(
  ({ children, className, icon, size, tone = "secondary", ...props }, ref) => (
    <span ref={ref} className={buttonClasses(tone, size, className)} {...props}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  ),
);

/** An action button with link, icon-only and inert compound shapes. */
export const Button = Object.assign(ButtonRoot, { Link: ButtonLink, Icon: ButtonIcon, Inert: ButtonInert });
