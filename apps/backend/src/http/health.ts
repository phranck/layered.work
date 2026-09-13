import { Hono } from "hono";
import { config } from "../config.js";
import { checkReadiness } from "../db/readiness.js";

/**
 * Liveness and readiness, which are two questions and get two answers.
 *
 * Neither goes through the success envelope the rest of the API uses. The
 * platform reads the status and nothing else, and a person reading the body
 * wants what is wrong rather than a wrapper around it.
 */
export const health = new Hono();

/**
 * Whether the process is answering, and nothing more.
 *
 * Zerops asks this continuously and takes a container out of service when it
 * fails, so it must not touch the database: a dependency that is briefly slow
 * would be reported as a dead process and every container would go with it.
 */
health.get("/", (c) => c.json({ service: "backend", alive: true }));

/**
 * Whether this container can actually serve.
 *
 * Asked by the platform's readiness check, which runs only whilst a deployment
 * rolls out, so a container in a state that would fail every real request never
 * replaces the one already running.
 *
 * The `configured` block proves which variables arrived without printing any of
 * their values, which is the question actually being asked after a deployment.
 */
health.get("/ready", async (c) => {
  const readiness = await checkReadiness();
  return c.json(
    {
      service: "backend",
      ...readiness,
      configured: {
        database: Boolean(config.DATABASE_URL),
        bucket: Boolean(config.S3_BUCKET),
        bucketCredentials: Boolean(config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY),
        sessionSecret: Boolean(config.SESSION_SECRET),
        mail: Boolean(config.SMTP2GO_API_KEY),
      },
    },
    readiness.ready ? 200 : 503,
  );
});
