/**
 * The public site.
 *
 * What stands here is a holding page, and it is the real front of layered.work
 * until the site itself is built, so it says what is happening rather than
 * looking like a deployment that went wrong.
 *
 * It answers in the visitor's language, taking German when the browser asks for
 * it and English otherwise, which is the same two-language rule the finished
 * site follows. It carries `noindex`, because a search engine indexing this
 * would replace the real entries in its results with a notice.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";

/** Which language to answer in, from the browser's own preference. */
function languageFor(header: string | undefined): "de" | "en" {
  return /(^|,)\s*de\b/i.test(header ?? "") ? "de" : "en";
}

const COPY = {
  de: {
    title: "layered.work",
    lead: "Die Seite wird gerade neu gebaut.",
    body: "Gehäuse, Platinen und Software, die Schicht für Schicht entsteht. Die Beiträge und Projekte von hier ziehen in ein neues System um und sind bald wieder da.",
    contact: "Bis dahin erreichbar über",
    place: "Bregenz, Vorarlberg",
  },
  en: {
    title: "layered.work",
    lead: "The site is being rebuilt.",
    body: "Enclosures, circuit boards and software, made layer by layer. The posts and projects from here are moving to a new system and will be back shortly.",
    contact: "Until then, reachable at",
    place: "Bregenz, Vorarlberg, Austria",
  },
} as const;

/**
 * The page.
 *
 * One document with its styles inline: a holding page that needed a second
 * request to look right would be a holding page that sometimes does not.
 */
function page(language: "de" | "en"): string {
  const copy = COPY[language];
  return `<!doctype html>
<html lang="${language}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <meta name="color-scheme" content="dark" />
    <title>${copy.title}</title>
    <meta name="description" content="${copy.lead}" />
    <style>
      :root {
        --page: oklch(0.205 0.008 250);
        --raised: oklch(0.262 0.008 250);
        --edge: rgb(255 255 255 / 7%);
        --text: oklch(0.963 0.008 250);
        --muted: oklch(0.745 0.008 250);
        --faint: oklch(0.655 0.008 250);
        --accent: oklch(0.68 0.16 253);
      }
      * { box-sizing: border-box; margin: 0; }
      body {
        display: grid;
        place-items: center;
        min-height: 100dvh;
        padding: 24px;
        font-family: ui-sans-serif, system-ui, sans-serif;
        line-height: 1.65;
        color: var(--text);
        background: var(--page);
        -webkit-font-smoothing: antialiased;
      }
      main {
        width: min(560px, 100%);
        padding: 32px;
        background: var(--raised);
        border: 1px solid var(--edge);
        border-radius: 24px;
        box-shadow: inset 0 1px 0 0 rgb(255 255 255 / 9%), 0 24px 48px -20px rgb(0 0 0 / 70%);
      }
      h1 {
        font-size: 2rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        line-height: 1.1;
      }
      .lead { margin-block-start: 12px; font-size: 1.125rem; color: var(--muted); }
      .body { margin-block-start: 20px; color: var(--muted); text-wrap: pretty; }
      .foot {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: space-between;
        margin-block-start: 28px;
        padding-block-start: 20px;
        font-size: 0.875rem;
        color: var(--faint);
        border-block-start: 1px solid var(--edge);
      }
      a { color: var(--accent); text-underline-offset: 3px; }
    </style>
  </head>
  <body>
    <main>
      <h1>${copy.title}</h1>
      <p class="lead">${copy.lead}</p>
      <p class="body">${copy.body}</p>
      <p class="foot">
        <span>${copy.contact} <a href="mailto:hello@layered.work">hello@layered.work</a></span>
        <span>${copy.place}</span>
      </p>
    </main>
  </body>
</html>
`;
}

const server = createServer((request, response) => {
  const language = languageFor(request.headers["accept-language"]);
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    // The answer differs by this header, so a cache must not hand one visitor's
    // language to another.
    vary: "Accept-Language",
    "cache-control": "public, max-age=300",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
  });
  response.end(page(language));
});

server.listen(PORT, HOST, () => {
  console.log(JSON.stringify({ message: "website listening", host: HOST, port: PORT }));
});
