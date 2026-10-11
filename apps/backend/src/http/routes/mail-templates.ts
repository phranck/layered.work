import {
  type ContentLanguage,
  ErrorCode,
  type FormDetail,
  type FormSubmissionValues,
  mailTemplate,
  mailTemplateKind,
  mailTemplateList,
  previewMailTemplateBody,
  renderedMail,
  saveMailTemplateBody,
  testMailResult,
  testMailTemplateBody,
} from "@layered/schemas";
import { Hono } from "hono";
import { z } from "zod";
import { database } from "../../db/connect.js";
import { logger } from "../../logger.js";
import { formMailValues } from "../../mail/notification.js";
import { requireMailConfiguration } from "../../mail/sender.js";
import { sendThroughSmtp2go } from "../../mail/smtp2go.js";
import {
  listMailTemplates,
  type MailTemplateValues,
  mailTemplateDraft,
  readMailTemplate,
  renderMailTemplate,
  saveMailTemplate,
} from "../../mail/templates.js";
import { responds } from "../api-metadata.js";
import { enforceRateLimit } from "../rate-limit.js";
import { principalOf, requireOwner, requireSession } from "../require-session.js";
import { HttpError, ok } from "../response.js";
import { validate } from "../validate.js";

const kindParam = z.object({ kind: mailTemplateKind });

/**
 * The submission a preview and a test message pretend arrived. It goes through
 * the same `formMailValues` a real submission does, so the date, the field
 * labels and the consent read in the preview's language exactly as they would
 * in a real mail.
 */
const SAMPLE_FORM: Pick<FormDetail, "name" | "fields"> = {
  name: "Contact",
  fields: [
    {
      key: "name",
      type: "shortText",
      label: { en: "Name", de: "Name" },
      hint: { en: "", de: "" },
      required: true,
      minLength: 1,
      maxLength: 120,
      pattern: null,
    },
    {
      key: "email",
      type: "email",
      label: { en: "Email", de: "E-Mail" },
      hint: { en: "", de: "" },
      required: true,
      minLength: 3,
      maxLength: 254,
      pattern: null,
    },
  ],
};
const SAMPLE_VALUES: FormSubmissionValues = { name: "Ada Lovelace", email: "ada@example.test" };
const SAMPLE_CONSENT: Record<ContentLanguage, string> = {
  en: "I agree that my message is stored.",
  de: "Ich bin einverstanden, dass meine Nachricht gespeichert wird.",
};
const SAMPLE_TIME = new Date("2026-10-05T08:00:00Z");

/** What a preview fills the placeholders with, in its language. The notification uses every one there is. */
function samples(language: ContentLanguage): MailTemplateValues<"submission_notification"> {
  return formMailValues(
    SAMPLE_FORM,
    SAMPLE_VALUES,
    language,
    [{ key: "consent", revision: "1", notice: SAMPLE_CONSENT[language] }],
    SAMPLE_TIME,
  );
}

function rendered(
  kind: z.infer<typeof mailTemplateKind>,
  value: z.infer<typeof saveMailTemplateBody>,
  language: ContentLanguage,
) {
  try {
    return renderMailTemplate(mailTemplateDraft(kind, value), language, samples(language));
  } catch (error) {
    throw new HttpError(ErrorCode.InvalidRequest, (error as Error).message);
  }
}

export const mailTemplateRoutes = new Hono();
mailTemplateRoutes.use("*", requireSession);

mailTemplateRoutes.get("/", responds(mailTemplateList), async (c) =>
  ok(c, await listMailTemplates(database())),
);
mailTemplateRoutes.get("/:kind", validate("param", kindParam), responds(mailTemplate), async (c) =>
  ok(c, await readMailTemplate(database(), c.req.valid("param").kind)),
);
mailTemplateRoutes.put(
  "/:kind",
  requireOwner,
  validate("param", kindParam),
  validate("json", saveMailTemplateBody),
  responds(mailTemplate),
  async (c) => {
    const kind = c.req.valid("param").kind;
    const value = c.req.valid("json");
    rendered(kind, value, "en");
    rendered(kind, value, "de");
    return ok(c, await saveMailTemplate(database(), kind, value, principalOf(c).userId));
  },
);
mailTemplateRoutes.post(
  "/:kind/preview",
  validate("param", kindParam),
  validate("json", previewMailTemplateBody),
  responds(renderedMail),
  async (c) => {
    const { template, language } = c.req.valid("json");
    return ok(c, rendered(c.req.valid("param").kind, template, language));
  },
);
mailTemplateRoutes.post(
  "/:kind/test",
  requireOwner,
  validate("param", kindParam),
  validate("json", testMailTemplateBody),
  responds(testMailResult),
  async (c) => {
    enforceRateLimit(c, {
      name: "mail-template-test",
      limit: 3,
      windowSeconds: 60,
      keys: () => [`user:${principalOf(c).userId}`],
    });
    const { template, language, recipient } = c.req.valid("json");
    const message = rendered(c.req.valid("param").kind, template, language);
    const configuration = await requireMailConfiguration(database());
    const outcome = await sendThroughSmtp2go(configuration.apiKey, {
      sender: configuration.sender,
      to: recipient,
      ...message,
    });
    logger.info(
      {
        requestId: c.get("requestId"),
        route: c.req.routePath,
        result: outcome.accepted ? "accepted" : "refused",
      },
      "mail template test",
    );
    return ok(c, { ...outcome, recipient });
  },
);
