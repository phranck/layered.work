import type { CreateFormBody } from "@layered/schemas";
import { jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { identifier, instant } from "./columns.js";

/** One editable declaration. Its JSON contains field order and both languages. */
export const forms = pgTable("forms", {
  id: identifier(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  declaration: jsonb().$type<CreateFormBody>().notNull(),
  createdAt: instant("created_at"),
  modifiedAt: instant("modified_at"),
});
