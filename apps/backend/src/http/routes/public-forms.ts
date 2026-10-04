import { ErrorCode, submitFormBody, validateFormValues } from "@layered/schemas";
import { Hono } from "hono";
import { z } from "zod";
import { database } from "../../db/connect.js";
import { formSubmissions } from "../../db/schema/index.js";
import { issueFormChallenge, verifyFormChallenge } from "../../forms/challenge.js";
import { readFormBySlug } from "../../forms/repository.js";
import { logger } from "../../logger.js";
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
    if (form.storeSubmissions) {
      await db.insert(formSubmissions).values({
        formId: form.id,
        values: checked.values,
        consents: checked.consents,
      });
    }
    return ok(c, { successMessage: form.successMessage[body.language] });
  },
);
