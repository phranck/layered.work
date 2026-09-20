import type { DashboardCounts } from "@layered/schemas";
import { Hono } from "hono";
import { database } from "../../db/connect.js";
import { requireSession } from "../require-session.js";
import { ok } from "../response.js";
import { readDashboardCounts } from "./dashboard-counts.js";

/** Authenticated, read-only data used by the dashboard shell. */
export const dashboard = new Hono();

dashboard.get("/counts", requireSession, async (c) => {
  const counts: DashboardCounts = await readDashboardCounts(database());
  return ok(c, counts);
});
