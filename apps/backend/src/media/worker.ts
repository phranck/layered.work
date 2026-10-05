import { randomUUID } from "node:crypto";
import { database } from "../db/connect.js";
import { logger } from "../logger.js";
import { processMediaDeletion } from "./deletion.js";
import { processMediaJob } from "./jobs.js";

/** Run image work outside HTTP requests, recovering persisted leases after a restart. */
export function startMediaWorker(): () => void {
  let active = false;
  const poll = async () => {
    if (active) return;
    active = true;
    try {
      for (let count = 0; count < 10 && (await processMediaJob(database())); count++) {}
      await processMediaDeletion(database());
    } catch (cause) {
      logger.error(
        {
          code: "media_worker_failed",
          errorId: randomUUID(),
          operation: "media.poll",
          status: 500,
          result: "poll_failed",
          cause: cause instanceof Error ? cause.name : "unknown",
        },
        "media worker failed",
      );
    } finally {
      active = false;
    }
  };
  void poll();
  const interval = setInterval(() => void poll(), 5_000);
  interval.unref();
  return () => clearInterval(interval);
}
