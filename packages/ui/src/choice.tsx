import {
  Children,
  type ComponentPropsWithoutRef,
  createContext,
  forwardRef,
  isValidElement,
  type ReactNode,
  useContext,
} from "react";
import { type DivProps, join, moveValue } from "./shared.js";

/** Props for an explained choice group. */
export interface ChoiceProps extends Omit<DivProps, "onChange"> {
  value: string;
  onValueChange: (value: string) => void;
  "aria-label": string;
}

/** Props for one explained choice. */
export interface ChoiceOptionProps extends Omit<ComponentPropsWithoutRef<"button">, "value"> {
  value: string;
  label: ReactNode;
  note?: ReactNode;
  tone?: "success" | "warning" | "info" | "accent" | "danger";
}

interface ChoiceContextValue {
  value: string;
  fallbackValue?: string;
  onValueChange: (value: string) => void;
}

const ChoiceContext = createContext<ChoiceContextValue | null>(null);

/** One explained radio option. */
const ChoiceOption = forwardRef<HTMLButtonElement, ChoiceOptionProps>(
  (
    {
      children,
      className,
      disabled,
      label,
      note,
      onClick,
      onKeyDown,
      tone,
      type = "button",
      value,
      ...props
    },
    ref,
  ) => {
    const choice = useContext(ChoiceContext);
    if (!choice) throw new Error("Choice.Option must be rendered inside Choice");
    const selected = value === choice.value;
    return (
      <>
        {/* biome-ignore lint/a11y/useSemanticElements: The ARIA radiogroup pattern uses roving-tabindex buttons for the prototype option surface. */}
        <button
          ref={ref}
          className={join("choice__option", className)}
          type={type}
          role="radio"
          data-value={value}
          data-tone={tone}
          aria-checked={selected}
          disabled={disabled}
          tabIndex={selected || value === choice.fallbackValue ? 0 : -1}
          onClick={(event) => {
            onClick?.(event);
            if (!event.defaultPrevented) choice.onValueChange(value);
          }}
          onKeyDown={(event) => {
            onKeyDown?.(event);
            if (event.defaultPrevented) return;
            const next = moveValue(event);
            if (next !== undefined) {
              event.preventDefault();
              choice.onValueChange(next);
            }
          }}
          {...props}
        >
          <span className="choice__mark" aria-hidden="true" />
          <span className="choice__text">
            <span className="choice__label">{label}</span>
            {note && <span className="choice__note">{note}</span>}
            {children}
          </span>
        </button>
      </>
    );
  },
);

function collectOptions(children: ReactNode, result: ChoiceOptionProps[] = []): ChoiceOptionProps[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === ChoiceOption) result.push(child.props as ChoiceOptionProps);
    else collectOptions((child.props as { children?: ReactNode }).children, result);
  });
  return result;
}

/** The explained choice group. */
const ChoiceRoot = forwardRef<HTMLDivElement, ChoiceProps>(
  ({ children, className, onValueChange, value, ...props }, ref) => {
    const enabledOptions = collectOptions(children).filter((option) => !option.disabled);
    const hasSelectedOption = enabledOptions.some((option) => option.value === value);
    const context = {
      value,
      fallbackValue: hasSelectedOption ? undefined : enabledOptions[0]?.value,
      onValueChange,
    };
    return (
      <ChoiceContext value={context}>
        <div ref={ref} className={join("choice", className)} role="radiogroup" {...props}>
          {children}
        </div>
      </ChoiceContext>
    );
  },
);

/** A controlled radiogroup for options needing explanatory text. */
export const Choice = Object.assign(ChoiceRoot, { Option: ChoiceOption });
