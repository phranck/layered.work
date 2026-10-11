import {
  CONTENT_LOCALES,
  type ContentLanguage,
  type FormConsent,
  type FormDetail,
  type FormSubmissionValues,
  formFields,
  submittedValueText,
} from "@layered/schemas";
import type { MailTemplateValues } from "./templates.js";

/**
 * What a form's mails are filled with: every placeholder the notification may
 * use, which the confirmation's are a part of. Snapshotted at submission time,
 * independent of later form edits.
 */
export function formMailValues(
  form: Pick<FormDetail, "name" | "rows">,
  values: FormSubmissionValues,
  language: ContentLanguage,
  consents: FormConsent[],
  now: Date = new Date(),
): MailTemplateValues<"submission_notification"> {
  const fields = formFields(form).map(
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
