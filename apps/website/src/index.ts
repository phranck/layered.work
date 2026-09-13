/**
 * The public site.
 *
 * A placeholder that proves the runtime starts and that the service can reach
 * the backend over the internal network rather than over the public one. The
 * real site arrives with its own epic.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "::";
const API_URL = process.env.API_URL ?? "http://backend:3000";

/** Whether the backend answers from inside the project. */
async function reachBackend(): Promise<string> {
  try {
    const response = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(4000) });
    return `${response.status}`;
  } catch (error) {
    return String((error as Error).message).split("\n")[0] ?? "unreachable";
  }
}

const server = createServer((_request, response) => {
  void reachBackend().then((backend) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>layered.work</title>
  </head>
  <body>
    <h1>layered.work</h1>
    <p>The site is being built. This page exists to prove the runtime starts and that the services can reach each other.</p>
    <p>The backend answered <code>${backend}</code> over the internal network.</p>
  </body>
</html>
`);
  });
});

server.listen(PORT, HOST, () => {
  console.log(JSON.stringify({ message: "website listening", host: HOST, port: PORT }));
});
