import { serve } from "@hono/node-server";
import { config } from "./config.js";
import { app } from "./http/app.js";
import { logger } from "./logger.js";

/**
 * The API.
 *
 * Importing `config` is what makes a misconfigured service fail here rather
 * than on its first real request: the environment is checked at import time and
 * an unusable one throws before anything below runs.
 */
serve({ fetch: app.fetch, port: config.PORT, hostname: config.HOST }, (address) => {
  logger.info({ host: config.HOST, port: address.port, env: config.NODE_ENV }, "backend listening");
});
