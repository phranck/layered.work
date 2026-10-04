import { createFormBody, formIdParam, saveFormBody, updateFormSubmission } from "@layered/schemas";
import { Hono } from "hono";
import { z } from "zod";
import { database } from "../../db/connect.js";
import {
  deleteFormSubmission,
  listFormSubmissions,
  setFormSubmissionStatus,
  submissionsCsv,
} from "../../forms/inbox.js";
import { createForm, listForms, readForm, saveForm } from "../../forms/repository.js";
import { principalOf, requireSession } from "../require-session.js";
import { ok } from "../response.js";
import { validate } from "../validate.js";

export const formsRoutes = new Hono();
formsRoutes.use("*", requireSession);

formsRoutes.get("/", async (c) => ok(c, await listForms(database())));
formsRoutes.post("/", validate("json", createFormBody), async (c) =>
  ok(c, await createForm(database(), c.req.valid("json"), principalOf(c).userId)),
);
formsRoutes.get("/:id", validate("param", formIdParam), async (c) =>
  ok(c, await readForm(database(), c.req.valid("param").id)),
);
formsRoutes.put("/:id", validate("param", formIdParam), validate("json", saveFormBody), async (c) =>
  ok(c, await saveForm(database(), c.req.valid("param").id, c.req.valid("json"), principalOf(c).userId)),
);

const submissionParam = z.object({ id: z.uuid(), submissionId: z.uuid() });

formsRoutes.get("/:id/submissions", validate("param", formIdParam), async (c) =>
  ok(c, await listFormSubmissions(database(), c.req.valid("param").id)),
);
formsRoutes.get("/:id/submissions/export", validate("param", formIdParam), async (c) => {
  const db = database();
  const { id } = c.req.valid("param");
  const form = await readForm(db, id);
  const rows = await listFormSubmissions(db, id);
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="${form.slug}-submissions.csv"`);
  c.header("Cache-Control", "no-store");
  return c.body(
    submissionsCsv(
      form.fields.map((field) => field.key),
      rows,
    ),
  );
});
formsRoutes.patch(
  "/:id/submissions/:submissionId",
  validate("param", submissionParam),
  validate("json", updateFormSubmission),
  async (c) => {
    const { id, submissionId } = c.req.valid("param");
    return ok(
      c,
      await setFormSubmissionStatus(
        database(),
        id,
        submissionId,
        c.req.valid("json").status,
        principalOf(c).userId,
      ),
    );
  },
);
formsRoutes.delete("/:id/submissions/:submissionId", validate("param", submissionParam), async (c) => {
  const { id, submissionId } = c.req.valid("param");
  await deleteFormSubmission(database(), id, submissionId, principalOf(c).userId);
  return ok(c, { deleted: true });
});
