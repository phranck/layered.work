import { config } from "../config.js";
import type { database } from "../db/connect.js";
import { readSettings } from "../settings/repository.js";

type Database = ReturnType<typeof database>;

/** The key and verified sender settings are resolved together for every delivery cycle. */
export async function readMailConfiguration(
  db: Database,
): Promise<{ ready: true; apiKey: string; sender: string } | { ready: false; reason: "key" | "sender" }> {
  if (!config.SMTP2GO_API_KEY) return { ready: false, reason: "key" };
  const { mail } = await readSettings(db);
  if (!mail.senderAddress) return { ready: false, reason: "sender" };
  return {
    ready: true,
    apiKey: config.SMTP2GO_API_KEY,
    sender: `${mail.senderName} <${mail.senderAddress}>`,
  };
}
