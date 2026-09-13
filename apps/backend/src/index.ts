/**
 * The API.
 *
 * At this point it answers the two questions the platform asks and nothing
 * else. Everything the product does arrives with its own issue.
 */
import { createServer } from "node:http";
import { checkReadiness } from "./db/readiness.js";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "::";

/**
 * Liveness and readiness are two questions, so they get two routes and two
 * kinds of answer.
 *
 * `/health` says the process is answering and touches nothing else. The
 * platform's continuous health check asks that one, because a check that
 * reaches the database reports a dependency that is briefly slow as a dead
 * process and takes every container down with it.
 *
 * `/health/ready` says this container can actually serve: the tables are there,
 * the role may write to them, and the schema is as new as the code. The
 * platform's readiness check asks that one, and it runs only whilst a
 * deployment is being rolled out, so a container that is not ready never
 * replaces one that is.
 */
const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ service: "backend", alive: true }));
    return;
  }

  if (request.url !== "/health/ready") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { code: "not_found" } }));
    return;
  }

  void checkReadiness().then((readiness) => {
    const body = {
      service: "backend",
      ...readiness,
      // Proves which variables arrived, without printing any of their values.
      configured: {
        database: Boolean(process.env.DATABASE_URL),
        bucket: Boolean(process.env.S3_BUCKET),
        bucketCredentials: Boolean(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY),
        sessionSecret: Boolean(process.env.SESSION_SECRET),
      },
    };
    response.writeHead(readiness.ready ? 200 : 503, { "content-type": "application/json" });
    response.end(JSON.stringify(body, null, 2));
  });
});

server.listen(PORT, HOST, () => {
  console.log(JSON.stringify({ message: "backend listening", host: HOST, port: PORT }));
});
