import { database } from "../db/connect.js";
import { deviation, logger } from "../logger.js";
import { drainDueMailJobs } from "./jobs.js";
import { readMailConfiguration } from "./sender.js";
import { sendThroughSmtp2go } from "./smtp2go.js";

const POLL_MS = 5_000;

/** Poll persisted jobs outside request handling and continue after a restart. */
export function startMailWorker(): () => void {
  let active = false;
  let disabledReason: "key" | "sender" | null = null;
  const poll = async () => {
    if (active) return;
    active = true;
    try {
      const db = database();
      const configuration = await readMailConfiguration(db);
      if (!configuration.ready) {
        if (disabledReason !== configuration.reason) {
          deviation("mail sending disabled", {
            code: "mail_configuration_missing",
            reason: configuration.reason,
          });
          disabledReason = configuration.reason;
        }
        return;
      }
      if (disabledReason) {
        logger.info({ code: "mail_configuration_ready", result: "resumed" }, "mail sending enabled");
        disabledReason = null;
      }
      await drainDueMailJobs(db, (mail) =>
        sendThroughSmtp2go(configuration.apiKey, { sender: configuration.sender, ...mail }),
      );
    } catch {
      // A database or provider exception can contain private mail or a URL.
      // The next poll retries; only the stable code leaves this boundary.
      logger.error({ code: "mail_worker_failed", result: "retry" }, "mail worker failed");
    } finally {
      active = false;
    }
  };
  void poll();
  const interval = setInterval(() => void poll(), POLL_MS);
  interval.unref();
  return () => clearInterval(interval);
}
