import type { ContentLanguage, FormSubmissionValues, PublicForm } from "@layered/schemas";
import { Button } from "./button.js";
import { Card } from "./card.js";
import { InlineContent } from "./content-renderer.js";
import { FormControls } from "./form-controls.js";

export type FormOutcome = {
  status: "success" | "error";
  message: string;
  code?: string;
  errorId?: string;
  values?: FormSubmissionValues;
  errors?: Record<string, string>;
};

export interface FormEmbedProps {
  form: PublicForm;
  language: ContentLanguage;
  challenge?: string;
  availabilityError?: { message: string; code?: string; errorId?: string };
  outcome?: FormOutcome;
  preview?: boolean;
}

/** A native form so it remains usable with scripting switched off. */
export function FormEmbed({
  form,
  language,
  challenge,
  availabilityError,
  outcome,
  preview = false,
}: FormEmbedProps) {
  const ready = !!challenge && !preview;
  if (outcome?.status === "success") {
    return (
      <div className="card form-embed" role="status" data-form-name={form.slug}>
        <Card.Body>
          <p>
            <InlineContent text={outcome.message} language={language} />
          </p>
        </Card.Body>
      </div>
    );
  }
  return (
    <form className="card form-embed" method="post" data-form-name={form.slug}>
      <input type="hidden" name="_form" value={form.slug} />
      <input type="hidden" name="_challenge" value={challenge ?? ""} />
      <input type="hidden" name="_language" value={language} />
      <div className="form-embed__trap" aria-hidden="true">
        <label htmlFor={`form-${form.slug}-website`}>Website</label>
        <input
          id={`form-${form.slug}-website`}
          name="_website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      <Card.Stack>
        <FormControls
          fields={form.fields}
          language={language}
          values={outcome?.values}
          errors={outcome?.errors}
        />
        {outcome?.status === "error" && (
          <p
            role="alert"
            className="form-controls__error"
            data-error-code={outcome.code}
            data-error-id={outcome.errorId}
          >
            {outcome.message}
          </p>
        )}
        {!ready && !preview && (
          <p
            role="status"
            data-error-code={availabilityError?.code}
            data-error-id={availabilityError?.errorId}
          >
            {availabilityError?.message ??
              (language === "de"
                ? "Das Formular ist derzeit nicht verfügbar."
                : "The form is currently unavailable.")}
          </p>
        )}
      </Card.Stack>
      <Card.Footer
        actions={
          <Button type="submit" tone="primary" disabled={!ready}>
            {preview
              ? language === "de"
                ? "Vorschau"
                : "Preview"
              : language === "de"
                ? "Absenden"
                : "Submit"}
          </Button>
        }
      />
    </form>
  );
}
