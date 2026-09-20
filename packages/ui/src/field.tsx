import { type ComponentPropsWithoutRef, type CSSProperties, forwardRef, type ReactNode } from "react";
import { type DivProps, join, moveValue } from "./shared.js";

/** Props for a labelled field. */
export interface FieldProps extends DivProps {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
}
/** A stacked labelled field. */
const FieldRoot = forwardRef<HTMLDivElement, FieldProps>(
  ({ children, className, hint, htmlFor, label, ...props }, ref) => (
    <div ref={ref} className={join("field", className)} {...props}>
      {htmlFor ? (
        <label className="field__label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="field__label">{label}</span>
      )}
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </div>
  ),
);
/** A field with its label and control on one line. */
const FieldInline = forwardRef<HTMLDivElement, FieldProps>(
  ({ children, className, hint, htmlFor, label, ...props }, ref) => (
    <div ref={ref} className={join("field field--inline", className)} {...props}>
      <label className="field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </div>
  ),
);
/** A label, control and optional hint. */
export const Field = Object.assign(FieldRoot, { Inline: FieldInline });
/** A styled native input. */
export const Input = forwardRef<HTMLInputElement, ComponentPropsWithoutRef<"input">>(
  ({ className, type = "text", ...props }, ref) => (
    <input ref={ref} className={join("input", className)} type={type} {...props} />
  ),
);

/** Props for a controlled switch. */
export interface SwitchProps extends Omit<ComponentPropsWithoutRef<"button">, "onChange" | "role"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  "aria-label": string;
}
/** A controlled, keyboard-accessible switch. */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, className, onCheckedChange, onClick, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      className={join("switch", className)}
      type={type}
      role="switch"
      data-on={checked || undefined}
      aria-checked={checked}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onCheckedChange(!checked);
      }}
      {...props}
    />
  ),
);

/** A value and label used by select and segmented controls. */
export interface ControlOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}
/** Props for a controlled native select. */
export interface SelectProps extends Omit<ComponentPropsWithoutRef<"select">, "children"> {
  options: readonly ControlOption[];
}
/** A styled native select. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(({ className, options, ...props }, ref) => (
  <span className="select">
    <select ref={ref} className={join("input", className)} {...props}>
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  </span>
));

/** Props for a controlled segmented control. */
export interface SegmentedProps extends Omit<DivProps, "onChange"> {
  value: string;
  options: readonly ControlOption[];
  onValueChange: (value: string) => void;
  "aria-label": string;
}
/** A controlled group of toggle buttons for short labels. */
export const Segmented = forwardRef<HTMLDivElement, SegmentedProps>(
  ({ className, onValueChange, options, style, value, ...props }, ref) => {
    const chosen = Math.max(
      options.findIndex((option) => option.value === value),
      0,
    );
    const customStyle = {
      ...style,
      "--segment-count": options.length,
      "--segment-index": chosen,
    } as CSSProperties;
    const selectedEnabled = options.some((option) => option.value === value && !option.disabled);
    const fallbackValue = options.find((option) => !option.disabled)?.value;
    return (
      <>
        {/* biome-ignore lint/a11y/useSemanticElements: This is a styled toggle-button group, while fieldset adds browser layout that breaks the prototype contract. */}
        <div ref={ref} className={join("segmented", className)} role="group" style={customStyle} {...props}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={option.value === value}
              disabled={option.disabled}
              tabIndex={
                option.value === value || (!selectedEnabled && option.value === fallbackValue) ? 0 : -1
              }
              data-value={option.value}
              onClick={() => onValueChange(option.value)}
              onKeyDown={(event) => {
                const next = moveValue(event);
                if (next !== undefined) {
                  event.preventDefault();
                  onValueChange(next);
                }
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </>
    );
  },
);
