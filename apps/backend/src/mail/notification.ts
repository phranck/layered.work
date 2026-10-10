import {
  CONTENT_LOCALES,
  type ContentLanguage,
  type FormConsent,
  type FormDetail,
  type FormSubmissionValues,
  submittedValueText,
} from "@layered/schemas";

/** Values are snapshotted at submission time, independent of later form edits. */
export function formMailValues(
  form: FormDetail,
  values: FormSubmissionValues,
  language: ContentLanguage,
  consents: FormConsent[],
  now: Date = new Date(),
): Record<string, string> {
  const fields = form.fields.map(
    (field) => `${field.label[language]}: ${submittedValueText(values[field.key])}`,
  );
  return {
    formName: form.name,
    submittedAt: new Intl.DateTimeFormat(CONTENT_LOCALES[language], {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Europe/Vienna",
    }).format(now),
    fields: fields.join("\n"),
    consents: consents.map((consent) => `Consent ${consent.revision}: ${consent.notice}`).join("\n"),
  };
}
