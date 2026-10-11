import type { ContentLanguage, FormField } from "@layered/schemas";
import type { ReactNode } from "react";
import { InlineContent } from "./content-renderer.js";
import { Field, Input, Select, Textarea } from "./field.js";

export interface FormControlsProps {
  fields: readonly FormField[];
  language: ContentLanguage;
  values?: Record<string, string | string[]>;
  errors?: Record<string, string>;
}

function stringValue(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

/** The same native controls in the builder preview and on the public site. */
export function FormControls({ fields, language, values = {}, errors = {} }: FormControlsProps) {
  return (
    <div className="form-controls">
      {fields.map((field) => {
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
          "aria-invalid": errors[field.key] ? (true as const) : undefined,
          "aria-describedby": errors[field.key] ? errorId : undefined,
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
                defaultValue={stringValue(values[field.key])}
              />
            );
            break;
          case "longText":
            control = (
              <Textarea
                {...common}
                minLength={field.minLength}
                maxLength={field.maxLength}
                defaultValue={stringValue(values[field.key])}
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
                defaultValue={stringValue(values[field.key])}
              />
            );
            break;
          case "singleChoice":
            control = (
              <Select
                {...common}
                defaultValue={stringValue(values[field.key])}
                options={[
                  { value: "", label: "—" },
                  ...field.options.map((option) => ({ value: option.value, label: option.label[language] })),
                ]}
              />
            );
            break;
          case "multipleChoice": {
            const chosen = values[field.key];
            const selected = Array.isArray(chosen) ? chosen : chosen ? [chosen] : [];
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
              <Input
                {...common}
                type="checkbox"
                value="yes"
                defaultChecked={stringValue(values[field.key]) === "yes"}
              />
            );
            break;
          case "date":
            control = (
              <Input
                {...common}
                type="date"
                min={field.min ?? undefined}
                max={field.max ?? undefined}
                defaultValue={stringValue(values[field.key])}
              />
            );
            break;
          case "consent":
            control = (
              <label className="form-controls__consent" htmlFor={id}>
                <Input
                  {...common}
                  type="checkbox"
                  value="yes"
                  defaultChecked={stringValue(values[field.key]) === "yes"}
                />
                <span>
                  <InlineContent text={field.notice[language]} language={language} />
                </span>
              </label>
            );
            break;
        }
        return (
          <div key={field.key} className="form-controls__field">
            {field.type === "consent" || field.type === "multipleChoice" ? (
              <fieldset
                aria-describedby={errors[field.key] ? errorId : undefined}
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
            {errors[field.key] && (
              <p id={errorId} role="alert" className="form-controls__error">
                {errors[field.key]}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
