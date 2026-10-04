import { ErrorCode, submitFormBody, validateFormValues } from "@layered/schemas";
import { Hono } from "hono";
import { z } from "zod";
import { database } from "../../db/connect.js";
import { formSubmissions, mailJobs } from "../../db/schema/index.js";
import { issueFormChallenge, verifyFormChallenge } from "../../forms/challenge.js";
import { readFormBySlug } from "../../forms/repository.js";
import { logger } from "../../logger.js";
import { formNotification } from "../../mail/notification.js";
import { sourceAddress, sourceFingerprint } from "../caller.js";
import { byAddress, enforceRateLimit } from "../rate-limit.js";
import { HttpError, ok } from "../response.js";
import { validate } from "../validate.js";

const slugParam = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/)
    .max(120),
});
export const publicFormsRoutes = new Hono();

publicFormsRoutes.get("/:slug/challenge", validate("param", slugParam), async (c) => {
  const { slug } = c.req.valid("param");
  await readFormBySlug(database(), slug);
  c.header("Cache-Control", "no-store");
  return ok(c, { challenge: issueFormChallenge(slug) });
});

publicFormsRoutes.post(
  "/:slug/submissions",
  validate("param", slugParam),
  validate("json", submitFormBody),
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
      return c.json(
        {
          error: {
            code: ErrorCode.InvalidRequest,
            message: "Check the marked fields.",
            id: c.get("requestId"),
          },
          fieldErrors: checked.errors,
        },
        400,
      );
    }
    enforceRateLimit(c, {
      name: "form-submission",
      limit: 1,
      windowSeconds: 10,
      keys: (context) => [`${slug}:${byAddress(context)}`],
    });
    if (form.storeSubmissions || form.notificationEmail) {
      try {
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
          if (form.notificationEmail) {
            await tx.insert(mailJobs).values({
              formId: form.id,
              submissionId: submission?.id,
              recipient: form.notificationEmail,
              ...formNotification(form, checked.values, body.language, checked.consents),
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
