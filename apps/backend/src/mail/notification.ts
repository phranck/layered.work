import type { FormConsent, FormDetail, FormSubmissionValues } from "@layered/schemas";

/** Values are snapshotted at submission time, independent of later form edits. */
export function formMailValues(
  form: FormDetail,
  values: FormSubmissionValues,
  language: "en" | "de",
  consents: FormConsent[],
  now: Date = new Date(),
): Record<string, string> {
  const fields = form.fields.map((field) => {
    const value = values[field.key];
    return `${field.label[language]}: ${Array.isArray(value) ? value.join(", ") : (value ?? "")}`;
  });
  return {
    formName: form.name,
    submittedAt: new Intl.DateTimeFormat(language === "de" ? "de-AT" : "en-GB", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Europe/Vienna",
    }).format(now),
    fields: fields.join("\n"),
    consents: consents.map((consent) => `Consent ${consent.revision}: ${consent.notice}`).join("\n"),
  };
}
