import {
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ElementType,
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { type DivProps, join, moveValue } from "./shared.js";

/**
 * Props for a label standing on its own, which names a control, a group of
 * controls or a value.
 *
 * @property as - The element the label is drawn as, so it keeps the meaning
 *   its place gives it: a `legend` names a fieldset, a `dt` names the value
 *   after it, a `p` names a group that is no form control. Without it the label
 *   is a `label` where `htmlFor` names its control, and a `span` otherwise.
 * @property htmlFor - The id of the control the label names.
 */
export interface FieldLabelProps extends HTMLAttributes<HTMLElement> {
  as?: "span" | "label" | "legend" | "dt" | "p";
  htmlFor?: string;
}

/**
 * Props for a hint standing on its own: a quiet line about a field, a value, a
 * picture or an outcome.
 *
 * @property as - The element the hint is drawn as, a `span` without it: a `p`
 *   for a sentence of its own, a `figcaption` for a picture's caption, an
 *   `output` for a value a control reports as it changes.
 */
export interface FieldHintProps extends HTMLAttributes<HTMLElement> {
  as?: "span" | "p" | "figcaption" | "output";
}

/**
 * The words that name something in a form or beside a value, in the face every
 * label in the product has. A field draws its own label with it, and so does
 * anything that names controls or values without being a field, so no screen
 * styles a label by hand.
 */
export function FieldLabel({ as, className, ...props }: FieldLabelProps) {
  const Element: ElementType = as ?? (props.htmlFor ? "label" : "span");
  return <Element className={join("field__label", className)} {...props} />;
}

/**
 * The secondary text of the product: a hint under a field, a note where a
 * field holds no control, a caption, a reported value, the id beneath an error.
 * Every quiet line is this, so they all read alike. A hint that says why
 * something cannot be done takes the tone of that state through `data-tone`.
 */
export function FieldHint({ as, className, ...props }: FieldHintProps) {
  const Element: ElementType = as ?? "span";
  return <Element className={join("field__hint", className)} {...props} />;
}

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
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {children}
      {hint && <FieldHint>{hint}</FieldHint>}
    </div>
  ),
);
/** A field with its label and control on one line. */
const FieldInline = forwardRef<HTMLDivElement, FieldProps>(
  ({ children, className, hint, htmlFor, label, ...props }, ref) => (
    <div ref={ref} className={join("field field--inline", className)} {...props}>
      <FieldLabel as="label" htmlFor={htmlFor}>
        {label}
      </FieldLabel>
      {children}
      {hint && <FieldHint>{hint}</FieldHint>}
    </div>
  ),
);
/**
 * Inline fields standing one under another, whose controls line up. The labels
 * take one column as wide as the longest of them, and every control starts
 * where that column ends, so a run of switches has one left edge rather than
 * one per label. The space between the rows is the space the surrounding stack
 * keeps between its fields, so grouping moves nothing up or down.
 */
const FieldInlineGroup = forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={join("field-group", className)} {...props} />
));

/** Props for controls standing under one label. */
export interface FieldSetProps extends Omit<ComponentPropsWithoutRef<"fieldset">, "children"> {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}
/**
 * Several controls under one label, such as a run of check boxes or the
 * permissions of a token. It is a fieldset, so a screen reader names every
 * control in it by the label, and it stands in a form as a field does.
 */
const FieldSet = forwardRef<HTMLFieldSetElement, FieldSetProps>(
  ({ children, className, hint, label, ...props }, ref) => (
    <fieldset ref={ref} className={join("field field--set", className)} {...props}>
      <FieldLabel as="legend">{label}</FieldLabel>
      {children}
      {hint && <FieldHint>{hint}</FieldHint>}
    </fieldset>
  ),
);
/** A label, control and optional hint. */
export const Field = Object.assign(FieldRoot, {
  Inline: FieldInline,
  InlineGroup: FieldInlineGroup,
  Set: FieldSet,
});
/**
 * A styled native input. A check box or a radio button is a mark beside its
 * label rather than a place to write, so it takes the `check` class and not the
 * text field's box, which would stretch it across the row.
 */
export const Input = forwardRef<HTMLInputElement, ComponentPropsWithoutRef<"input">>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      className={join(type === "checkbox" || type === "radio" ? "check" : "input", className)}
      type={type}
      {...props}
    />
  ),
);

/** A styled native multi-line input, such as for a paragraph of introduction. */
export const Textarea = forwardRef<HTMLTextAreaElement, ComponentPropsWithoutRef<"textarea">>(
  ({ className, rows = 3, ...props }, ref) => (
    <textarea ref={ref} className={join("input input--area", className)} rows={rows} {...props} />
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
