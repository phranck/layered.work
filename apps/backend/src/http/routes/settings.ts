import { analyticsSettings, ErrorCode, mailSettings, siteSettings } from "@layered/schemas";
import { Hono } from "hono";
import { getAccountProfile } from "../../account/repository.js";
import { config } from "../../config.js";
import { database } from "../../db/connect.js";
import { logger } from "../../logger.js";
import { sendThroughSmtp2go } from "../../mail/smtp2go.js";
import { readSettings, saveSettings } from "../../settings/repository.js";
import { principalOf, requireOwner, requireSession } from "../require-session.js";
import { HttpError, ok } from "../response.js";
import { validate } from "../validate.js";

/**
 * The site's settings: the site itself, the mail it sends, and its analytics.
 *
 * Every signed-in author may read them, because the screens show them. Only the
 * owner may change them or send a test message, because they belong to the site
 * as a whole. The SMTP2GO key is never read or written here: it arrives from the
 * environment, and this only ever says whether it did.
 */
export const settingsRoutes = new Hono();

settingsRoutes.use("*", requireSession);

settingsRoutes.get("/", async (c) => ok(c, await readSettings(database())));

settingsRoutes.put("/site", requireOwner, validate("json", siteSettings), async (c) =>
  ok(c, await saveSettings(database(), "site", c.req.valid("json"), principalOf(c).userId)),
);

settingsRoutes.put("/mail", requireOwner, validate("json", mailSettings), async (c) =>
  ok(c, await saveSettings(database(), "mail", c.req.valid("json"), principalOf(c).userId)),
);

settingsRoutes.put("/analytics", requireOwner, validate("json", analyticsSettings), async (c) =>
  ok(c, await saveSettings(database(), "analytics", c.req.valid("json"), principalOf(c).userId)),
);

/**
 * Sends one message through SMTP2GO with the saved sender, and reports what
 * SMTP2GO answered.
 *
 * It goes to the signed-in owner's own address and to nobody else, so this
 * route cannot be used to send mail to a stranger. The log line carries the
 * outcome and never the address.
 */
settingsRoutes.post("/mail/test", requireOwner, async (c) => {
  const apiKey = config.SMTP2GO_API_KEY;
  if (!apiKey)
    throw new HttpError(ErrorCode.Conflict, "No SMTP2GO key is configured, so nothing can be sent.");
  const { mail } = await readSettings(database());
  if (!mail.senderAddress) {
    throw new HttpError(ErrorCode.Conflict, "Save a sender address before sending a test message.");
  }

  const recipient = (await getAccountProfile(database(), principalOf(c).userId)).email;
  const outcome = await sendThroughSmtp2go(apiKey, {
    sender: `${mail.senderName} <${mail.senderAddress}>`,
    to: recipient,
    subject: "Test message from the layered.work dashboard",
    text: "This message was sent from the dashboard's mail settings to check that sending works.",
  });
  logger.info({ requestId: c.get("requestId"), accepted: outcome.accepted }, "test mail sent");
  return ok(c, { ...outcome, recipient });
});
