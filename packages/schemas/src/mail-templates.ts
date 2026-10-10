import { z } from "zod";
import { CONTENT_LANGUAGES, inBothLanguages } from "./entries.js";
import { body, emailAddress, MaxLength, text } from "./request.js";

export const mailTemplateKind = z.enum(["submission_notification", "submission_confirmation"]);
export type MailTemplateKind = z.infer<typeof mailTemplateKind>;

const translated = inBothLanguages(text(MaxLength.Line));
const translatedBody = inBothLanguages(text(10_000));

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
  language: z.enum(CONTENT_LANGUAGES),
});
export const renderedMail = body({ subject: z.string(), text: z.string(), html: z.string() });

/**
 * The elements a rendered mail is made of, and nothing else, which a test holds
 * the renderer to.
 */
export const MAIL_ELEMENTS = ["div", "p", "strong", "em", "ul", "ol", "li", "a", "br"] as const;

/** The addresses a link in a mail may point at: HTTP and HTTPS, and no other scheme. */
export const MAIL_LINK = /^https?:\/\//i;
export type RenderedMail = z.infer<typeof renderedMail>;
export const testMailTemplateBody = previewMailTemplateBody.extend({ recipient: emailAddress });
