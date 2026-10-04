import {
  ErrorCode,
  mailTemplateKind,
  previewMailTemplateBody,
  saveMailTemplateBody,
  testMailTemplateBody,
} from "@layered/schemas";
import { Hono } from "hono";
import { z } from "zod";
import { database } from "../../db/connect.js";
import { logger } from "../../logger.js";
import { readMailConfiguration } from "../../mail/sender.js";
import { sendThroughSmtp2go } from "../../mail/smtp2go.js";
import {
  listMailTemplates,
  mailTemplateDraft,
  readMailTemplate,
  renderMailTemplate,
  saveMailTemplate,
} from "../../mail/templates.js";
import { enforceRateLimit } from "../rate-limit.js";
import { principalOf, requireOwner, requireSession } from "../require-session.js";
import { HttpError, ok } from "../response.js";
import { validate } from "../validate.js";

const kindParam = z.object({ kind: mailTemplateKind });
const samples = {
  formName: "Contact",
  submittedAt: "5 October 2026, 10:00",
  fields: "Name: Ada\nEmail: ada@example.test",
  consents: "Consent v1: I agree",
};

function rendered(
  kind: z.infer<typeof mailTemplateKind>,
  value: z.infer<typeof saveMailTemplateBody>,
  language: "en" | "de",
) {
  try {
    return renderMailTemplate(mailTemplateDraft(kind, value), language, samples);
  } catch (error) {
    throw new HttpError(ErrorCode.InvalidRequest, (error as Error).message);
  }
}

export const mailTemplateRoutes = new Hono();
mailTemplateRoutes.use("*", requireSession);

mailTemplateRoutes.get("/", async (c) => ok(c, await listMailTemplates(database())));
mailTemplateRoutes.get("/:kind", validate("param", kindParam), async (c) =>
  ok(c, await readMailTemplate(database(), c.req.valid("param").kind)),
);
mailTemplateRoutes.put(
  "/:kind",
  requireOwner,
  validate("param", kindParam),
  validate("json", saveMailTemplateBody),
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
  async (c) => {
    enforceRateLimit(c, {
      name: "mail-template-test",
      limit: 3,
      windowSeconds: 60,
      keys: () => [`user:${principalOf(c).userId}`],
    });
    const { template, language, recipient } = c.req.valid("json");
    const message = rendered(c.req.valid("param").kind, template, language);
    const configuration = await readMailConfiguration(database());
    if (!configuration.ready)
      throw new HttpError(ErrorCode.Conflict, `Mail sending needs a configured ${configuration.reason}.`);
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
