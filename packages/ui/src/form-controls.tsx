import {
  type ContentLanguage,
  FORM_COLUMNS,
  type FormField,
  type FormRow,
  fieldSpan,
} from "@layered/schemas";
import type { CSSProperties, ReactNode } from "react";
import { InlineContent } from "./content-renderer.js";
import { Field, Input, Select, Textarea } from "./field.js";

export interface FormControlsProps {
  /** The form's rows, each laid out on the form's twelve columns. */
  rows: readonly FormRow[];
  language: ContentLanguage;
  values?: Record<string, string | string[]>;
  errors?: Record<string, string>;
}

function stringValue(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

/**
 * A form's fields as native controls, row by row: the same on the public site
 * and in the builder's preview. Each row lays its fields out on the form's
 * twelve columns, and on a narrow screen every field takes the whole row.
 */
export function FormControls({ rows, language, values = {}, errors = {} }: FormControlsProps) {
  return (
    <div className="form-controls">
      {rows.map((row) => (
        <div
          key={row.fields.map((field) => field.key).join(" ")}
          className="form-controls__row"
          style={{ "--columns": FORM_COLUMNS } as CSSProperties}
        >
          {row.fields.map((field) => (
            <FormFieldControl
              key={field.key}
              field={field}
              language={language}
              value={values[field.key]}
              error={errors[field.key]}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Props for one field of a form. */
interface FormFieldControlProps {
  field: FormField;
  language: ContentLanguage;
  /** What the visitor sent last time, where the form comes back with an error. */
  value?: string | string[];
  /** Why the field was refused, where it was. */
  error?: string;
}

/**
 * One field as the native control its type calls for, its label and hint, and
 * the reason it was refused. It takes as many of its row's columns as its span
 * says, which the stylesheet reads from `--span`.
 */
function FormFieldControl({ field, language, value, error }: FormFieldControlProps) {
  const id = `form-field-${field.key}`;
  const errorId = `${id}-error`;
  const hint = field.hint[language];
  const label = (
    <>
      {field.label[language]}
      {field.required && <span aria-hidden="true"> *</span>}
    </>
  );
  const common = {
    id,
    name: field.key,
    required: field.required,
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": error ? errorId : undefined,
  };
  let control: ReactNode;
  switch (field.type) {
    case "shortText":
    case "email":
      control = (
        <Input
          {...common}
          type={field.type === "email" ? "email" : "text"}
          minLength={field.minLength}
          maxLength={field.maxLength}
          pattern={field.pattern ?? undefined}
          defaultValue={stringValue(value)}
        />
      );
      break;
    case "longText":
      control = (
        <Textarea
          {...common}
          minLength={field.minLength}
          maxLength={field.maxLength}
          defaultValue={stringValue(value)}
        />
      );
      break;
    case "number":
      control = (
        <Input
          {...common}
          type="number"
          step="any"
          min={field.min ?? undefined}
          max={field.max ?? undefined}
          defaultValue={stringValue(value)}
        />
      );
      break;
    case "singleChoice":
      control = (
        <Select
          {...common}
          defaultValue={stringValue(value)}
          options={[
            { value: "", label: "—" },
            ...field.options.map((option) => ({ value: option.value, label: option.label[language] })),
          ]}
        />
      );
      break;
    case "multipleChoice": {
      const selected = Array.isArray(value) ? value : value ? [value] : [];
      control = (
        <div className="form-controls__choices">
          {field.options.map((option) => (
            <label key={option.value} htmlFor={`${id}-${option.value}`}>
              <Input
                id={`${id}-${option.value}`}
                type="checkbox"
                name={field.key}
                value={option.value}
                defaultChecked={selected.includes(option.value)}
              />
              {option.label[language]}
            </label>
          ))}
        </div>
      );
      break;
    }
    case "checkbox":
      control = (
        <Input {...common} type="checkbox" value="yes" defaultChecked={stringValue(value) === "yes"} />
      );
      break;
    case "date":
      control = (
        <Input
          {...common}
          type="date"
          min={field.min ?? undefined}
          max={field.max ?? undefined}
          defaultValue={stringValue(value)}
        />
      );
      break;
    case "consent":
      control = (
        <label className="form-controls__consent" htmlFor={id}>
          <Input {...common} type="checkbox" value="yes" defaultChecked={stringValue(value) === "yes"} />
          <span>
            <InlineContent text={field.notice[language]} language={language} />
          </span>
        </label>
      );
      break;
  }
  return (
    <div className="form-controls__field" style={{ "--span": fieldSpan(field) } as CSSProperties}>
      {field.type === "consent" || field.type === "multipleChoice" ? (
        <fieldset
          aria-describedby={error ? errorId : undefined}
          data-required-choice={field.type === "multipleChoice" && field.required ? "true" : undefined}
        >
          <legend>{label}</legend>
          {control}
          {hint && <small>{hint}</small>}
        </fieldset>
      ) : (
        <Field label={label} htmlFor={id} hint={hint}>
          {control}
        </Field>
      )}
      {error && (
        <p id={errorId} role="alert" className="form-controls__error">
          {error}
        </p>
      )}
    </div>
  );
}
