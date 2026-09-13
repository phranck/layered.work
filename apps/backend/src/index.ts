/**
 * The API.
 *
 * At this point it answers one route, and that route exists to prove the things
 * that either work or do not: the runtime starts, the port is reachable from
 * outside, and the connection string Zerops hands over actually opens a session
 * on the database. Everything else arrives with its own issue.
 */
import { createServer } from "node:http";
import postgres from "postgres";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "::";

/**
 * Asks the database whether it is there.
 *
 * A TCP check would prove that something is listening, which is not the same
 * question. This one authenticates and runs a statement, so a wrong credential
 * fails here rather than at the first real query.
 *
 * @returns What to report, never including the connection string.
 */
async function checkDatabase(): Promise<{ reachable: boolean; detail: string }> {
  const url = process.env.DATABASE_URL;
  if (!url) return { reachable: false, detail: "DATABASE_URL is not set" };

  const sql = postgres(url, { max: 1, idle_timeout: 2, connect_timeout: 5 });
  try {
    const [row] = await sql<{ version: string }[]>`select version() as version`;
    return { reachable: true, detail: row?.version.split(" ").slice(0, 2).join(" ") ?? "connected" };
  } catch (error) {
    // The message can name a host and a user, so only its first line goes out.
    return { reachable: false, detail: String((error as Error).message).split("\n")[0] ?? "failed" };
  } finally {
    await sql.end({ timeout: 2 });
  }
}

/**
 * Liveness and readiness are two questions and they get two routes.
 *
 * The platform's health check asks the first one, so a database that is down
 * produces a readable 503 from this service rather than an opaque 502 from the
 * gateway, which would take the container out of rotation and hide the reason.
 * Whatever watches the service asks the second one.
 */
const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ service: "backend", alive: true }));
    return;
  }

  if (request.url !== "/health/db") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { code: "not_found" } }));
    return;
  }

  void checkDatabase().then((database) => {
    const body = {
      service: "backend",
      ready: database.reachable,
      database,
      // Proves which variables arrived, without printing any of their values.
      configured: {
        database: Boolean(process.env.DATABASE_URL),
        bucket: Boolean(process.env.S3_BUCKET),
        bucketCredentials: Boolean(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY),
        sessionSecret: Boolean(process.env.SESSION_SECRET),
      },
    };
    response.writeHead(database.reachable ? 200 : 503, { "content-type": "application/json" });
    response.end(JSON.stringify(body, null, 2));
  });
});

server.listen(PORT, HOST, () => {
  console.log(JSON.stringify({ message: "backend listening", host: HOST, port: PORT }));
});
