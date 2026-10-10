import {
  ErrorCode,
  formChallenge,
  formSlugParam,
  formSubmitted,
  submitFormBody,
  validateFormValues,
} from "@layered/schemas";
import { Hono } from "hono";
import { database } from "../../db/connect.js";
import { formSubmissions, mailJobs } from "../../db/schema/index.js";
import { issueFormChallenge, verifyFormChallenge } from "../../forms/challenge.js";
import { readFormBySlug } from "../../forms/repository.js";
import { logger } from "../../logger.js";
import { formMailValues } from "../../mail/notification.js";
import { readMailTemplate, renderMailTemplate } from "../../mail/templates.js";
import { responds } from "../api-metadata.js";
import { sourceAddress, sourceFingerprint } from "../caller.js";
import { byAddress, enforceRateLimit } from "../rate-limit.js";
import { fail, HttpError, ok } from "../response.js";
import { validate } from "../validate.js";

export const publicFormsRoutes = new Hono();

publicFormsRoutes.get(
  "/:slug/challenge",
  validate("param", formSlugParam),
  responds(formChallenge),
  async (c) => {
    const { slug } = c.req.valid("param");
    await readFormBySlug(database(), slug);
    c.header("Cache-Control", "no-store");
    return ok(c, { challenge: issueFormChallenge(slug) });
  },
);

publicFormsRoutes.post(
  "/:slug/submissions",
  validate("param", formSlugParam),
  validate("json", submitFormBody),
  responds(formSubmitted),
  async (c) => {
    const { slug } = c.req.valid("param");
    const body = c.req.valid("json");
    const db = database();
    const form = await readFormBySlug(db, slug);
    if (body.honeypot || !verifyFormChallenge(slug, body.challenge)) {
      throw new HttpError(
        ErrorCode.InvalidRequest,
        "This submission could not be accepted. Reload the page and try again.",
      );
    }
    const checked = validateFormValues(form, body.values, body.language);
    if (Object.keys(checked.errors).length > 0) {
      logger.info(
        {
          code: ErrorCode.InvalidRequest,
          errorId: c.get("requestId"),
          requestId: c.get("requestId"),
          route: c.req.routePath,
          status: 400,
          result: "field_validation_failed",
          fields: Object.keys(checked.errors),
        },
        "form submission refused",
      );
      return fail(c, ErrorCode.InvalidRequest, "Check the marked fields.", { fieldErrors: checked.errors });
    }
    enforceRateLimit(c, {
      name: "form-submission",
      limit: 1,
      windowSeconds: 10,
      keys: (context) => [`${slug}:${byAddress(context)}`],
    });
    const confirmationAddress = form.confirmationEmailField
      ? checked.values[form.confirmationEmailField]
      : null;
    const notificationTemplate = form.notificationEmail
      ? await readMailTemplate(db, "submission_notification")
      : null;
    const confirmationTemplate = confirmationAddress
      ? await readMailTemplate(db, "submission_confirmation")
      : null;
    if (form.storeSubmissions || form.notificationEmail || confirmationAddress) {
      try {
        const mailValues = formMailValues(form, checked.values, body.language, checked.consents);
        await db.transaction(async (tx) => {
          const [submission] = form.storeSubmissions
            ? await tx
                .insert(formSubmissions)
                .values({
                  formId: form.id,
                  values: checked.values,
                  consents: checked.consents,
                  sourceHash: sourceFingerprint(sourceAddress(c)),
                })
                .returning({ id: formSubmissions.id })
            : [];
          if (form.notificationEmail && notificationTemplate) {
            const rendered = renderMailTemplate(notificationTemplate, body.language, mailValues);
            await tx.insert(mailJobs).values({
              formId: form.id,
              submissionId: submission?.id,
              recipient: form.notificationEmail,
              subject: rendered.subject,
              body: rendered.text,
              htmlBody: rendered.html,
            });
          }
          if (typeof confirmationAddress === "string" && confirmationAddress && confirmationTemplate) {
            const rendered = renderMailTemplate(confirmationTemplate, body.language, mailValues);
            await tx.insert(mailJobs).values({
              formId: form.id,
              submissionId: submission?.id,
              recipient: confirmationAddress,
              subject: rendered.subject,
              body: rendered.text,
              htmlBody: rendered.html,
            });
          }
        });
      } catch {
        // A driver error may include SQL parameters with the recipient or
        // submitted text. Keep its public and logged cause free of both.
        throw new HttpError(
          ErrorCode.Internal,
          "The submission could not be saved.",
          new Error("The form and mail job transaction failed."),
        );
      }
    }
    return ok(c, { successMessage: form.successMessage[body.language] });
  },
);
