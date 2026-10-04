import { createFormBody, formIdParam, saveFormBody } from "@layered/schemas";
import { Hono } from "hono";
import { database } from "../../db/connect.js";
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
