import { ErrorCode, mailSenderLine } from "@layered/schemas";
import { config } from "../config.js";
import type { Database } from "../db/connect.js";
import { HttpError } from "../http/response.js";
import { readSettings } from "../settings/repository.js";

/** What a request that wants to send mail is told about each thing still missing. */
const NOT_READY: Record<"key" | "sender", string> = {
  key: "No SMTP2GO key is configured, so nothing can be sent.",
  sender: "Save a sender address before sending mail.",
};

/**
 * The mail configuration a request is about to send with, or the reason it
 * cannot.
 *
 * Every route that sends on a person's request asks here, so the dashboard is
 * told the same thing whichever test message was asked for.
 *
 * @param db - The database.
 * @throws `conflict`, naming what is missing, while the key or the sender is.
 */
export async function requireMailConfiguration(db: Database): Promise<{ apiKey: string; sender: string }> {
  const configuration = await readMailConfiguration(db);
  if (!configuration.ready) throw new HttpError(ErrorCode.Conflict, NOT_READY[configuration.reason]);
  return configuration;
}

/** The key and verified sender settings are resolved together for every delivery cycle. */
export async function readMailConfiguration(
  db: Database,
): Promise<{ ready: true; apiKey: string; sender: string } | { ready: false; reason: "key" | "sender" }> {
  if (!config.SMTP2GO_API_KEY) return { ready: false, reason: "key" };
  const sender = mailSenderLine((await readSettings(db)).mail);
  if (!sender) return { ready: false, reason: "sender" };
  return { ready: true, apiKey: config.SMTP2GO_API_KEY, sender };
}
