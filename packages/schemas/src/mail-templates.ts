import { z } from "zod";
import { body, emailAddress, MaxLength, text } from "./request.js";

export const mailTemplateKind = z.enum(["submission_notification", "submission_confirmation"]);
export type MailTemplateKind = z.infer<typeof mailTemplateKind>;

const translated = body({ en: text(MaxLength.Line), de: text(MaxLength.Line) });
const translatedBody = body({ en: text(10_000), de: text(10_000) });

/** The two site messages share the same editing and delivery path. */
export const mailTemplate = body({
  kind: mailTemplateKind,
  name: translated,
  subject: translated,
  body: translatedBody,
  allowedVariables: z.array(z.string()),
});
export type MailTemplate = z.infer<typeof mailTemplate>;
export const mailTemplateList = z.array(mailTemplate);
export const saveMailTemplateBody = mailTemplate.omit({ kind: true, allowedVariables: true });
export type SaveMailTemplateBody = z.infer<typeof saveMailTemplateBody>;
export const previewMailTemplateBody = body({
  template: saveMailTemplateBody,
  language: z.enum(["en", "de"]),
});
export const renderedMail = body({ subject: z.string(), text: z.string(), html: z.string() });
export type RenderedMail = z.infer<typeof renderedMail>;
export const testMailTemplateBody = previewMailTemplateBody.extend({ recipient: emailAddress });
