import type { FormConsent, FormDetail, FormSubmissionValues } from "@layered/schemas";

/** Snapshot the notification text when the visitor submits, independent of later form edits. */
export function formNotification(
  form: FormDetail,
  values: FormSubmissionValues,
  language: "en" | "de",
  consents: FormConsent[],
): { subject: string; body: string } {
  const fields = form.fields.map((field) => {
    const value = values[field.key];
    return `${field.label[language]}: ${Array.isArray(value) ? value.join(", ") : (value ?? "")}`;
  });
  return {
    subject: `New submission: ${form.name}`,
    body: [
      `Form: ${form.name}`,
      ...fields,
      ...consents.map((consent) => `Consent ${consent.revision}: ${consent.notice}`),
    ].join("\n\n"),
  };
}
