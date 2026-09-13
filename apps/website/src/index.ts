/**
 * The public site.
 *
 * Until the site itself is built, what stands here is a countdown to the day it
 * opens. It is the real front of layered.work, so it is made from the project's
 * own design: its wordmark, its typefaces, its colours, and a web of nodes
 * behind it that turns slowly and answers the pointer.
 *
 * English only. The finished site is bilingual, and this page is not the place
 * to start that: one notice in two languages is two things to keep in step for
 * the few days it stands.
 */
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { COUNTDOWN_SCRIPT } from "./countdown.js";
import { SCENE_SCRIPT } from "./scene.js";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";

/**
 * When the site opens.
 *
 * Written with its offset rather than as a bare local time, because a countdown
 * whose target depends on the reader's own clock counts to a different moment
 * for every reader. Bregenz is UTC+2 in September.
 */
const LAUNCH = "2026-09-20T20:20:00+02:00";

const PUBLIC_DIR = resolve(fileURLToPath(new URL("../public/", import.meta.url)));

const CONTENT_TYPES: Record<string, string> = {
  ".woff2": "font/woff2",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

const COPY = {
  eyebrow: "Bregenz, Austria",
  lead: "The new site arrives on",
  date: "20 September 2026, 20:20",
  body: [
    "Enclosures, circuit boards and software, made layer by layer.",
    "The posts and projects are moving into a new home.",
  ],
  units: ["Days", "Hours", "Minutes", "Seconds"],
  open: "It is time.",
  contact: "Until then, I'm reachable at",
  logoLabel: "layered.work",
} as const;

/**
 * One digit of the countdown, as the four faces the fold needs.
 *
 * Each face is half a card tall and clips a glyph that is a whole card tall, so
 * the top faces show the upper half of the figure and the bottom faces the
 * lower half. That is what makes one figure split rather than two shapes meet.
 */
const digit = (): string =>
  `<span class="digit" data-digit>
            <span class="face front"><span class="glyph">0</span></span>
            <span class="face back"><span class="glyph">0</span></span>
            <span class="face fold-top"><span class="glyph">0</span></span>
            <span class="face fold-bottom"><span class="glyph">0</span></span>
          </span>`;

/** One unit: two digits and the word beneath them. */
const unit = (label: string): string =>
  `<div class="unit">
          <span class="pair">${digit()}${digit()}</span>
          <span class="label">${label}</span>
        </div>`;

/**
 * The page.
 *
 * The styles and the scripts are inline: this is one document, and a second
 * request for something decorative is a request the reader waits on. The
 * typefaces and the wordmark are the exceptions, because both are files.
 */
function page(): string {
  const copy = COPY;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <title>layered.work</title>
    <meta name="description" content="${copy.lead} ${copy.date}." />
    <meta property="og:title" content="layered.work" />
    <meta property="og:description" content="${copy.lead} ${copy.date}." />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://layered.work/" />
    <link rel="icon" href="/logo.svg" type="image/svg+xml" />
    <link rel="preload" href="/fonts/barlow-condensed-700-latin.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="/fonts.css" />
    <style>
      :root {
        --page: oklch(0.205 0.008 250);
        --raised: oklch(0.262 0.008 250);
        --sunken: oklch(0.232 0.008 250);
        --edge: rgb(255 255 255 / 7%);
        --edge-lit: rgb(255 255 255 / 9%);
        --text: oklch(0.963 0.008 250);
        --muted: oklch(0.845 0.008 250);
        --faint: oklch(0.655 0.008 250);
        --accent: #65adf6;
        --ease: cubic-bezier(0.22, 1, 0.36, 1);
      }
      *, *::before, *::after { box-sizing: border-box; }
      * { margin: 0; }
      body {
        display: grid;
        place-items: center;
        min-height: 100dvh;
        padding: clamp(20px, 5vw, 44px);
        font-family: "Barlow", ui-sans-serif, system-ui, sans-serif;
        font-size: 1.0625rem;
        line-height: 1.65;
        color: var(--text);
        background: var(--page);
        -webkit-font-smoothing: antialiased;
      }

      /* --- The web ---------------------------------------------------------
         A fixed layer behind everything. Fixed rather than a background with
         fixed attachment, which the browser repositions on every scroll frame. */
      #sky {
        position: fixed;
        z-index: -2;
        inset: 0;
        display: block;
      }
      /* A wash over the web, so the corner it fills is not evenly lit. */
      body::before {
        position: fixed;
        z-index: -1;
        inset: 0;
        content: "";
        background:
          radial-gradient(75vw 55vh at 14% -6%, color-mix(in oklab, #0d70d3 9%, transparent), transparent 60%),
          radial-gradient(65vw 45vh at 90% 6%, color-mix(in oklab, oklch(0.5 0.008 250) 22%, transparent), transparent 56%);
        pointer-events: none;
      }

      /*
       * The card and its shadow share a place on the page. Only the card turns.
       *
       * The viewing point sits here rather than on the page, because perspective
       * reaches a direct child and no further: with it on the page it applied to
       * this wrapper and the card inside it turned flat, which is a squash
       * rather than a thing moving in space. On this element the vanishing point
       * also lands exactly on the card's own middle, which is where it is pinned.
       */
      .stage {
        position: relative;
        width: min(640px, 100%);
        perspective: 1100px;
        perspective-origin: 50% 50%;
      }

      /*
       * The shadow, cast onto what is behind rather than drawn on the card.
       *
       * It moves, turns and grows as the card leans, and it does all of that
       * through transform and opacity alone. Animating the blur radius instead
       * would be truer still and would re-rasterise a blurred layer the size of
       * the card on every frame; scaling an already blurred shape says the same
       * thing about distance and costs nothing.
       */
      .shadow {
        position: absolute;
        z-index: -1;
        inset: 0;
        border-radius: 24px;
        background: #000000;
        opacity: 0.5;
        filter: blur(26px);
        transform: translate3d(0, 22px, 0) scale(0.96);
        will-change: transform, opacity;
        pointer-events: none;
      }

      main {
        width: 100%;
        padding: clamp(24px, 5vw, 40px);
        text-align: center;
        /* Enough of the web shows through to place the card in front of it,
           not so much that the text has to compete with what is behind. The
           blur below does the rest of that work. */
        background: color-mix(in oklab, var(--raised) 72%, transparent);
        border: 1px solid var(--edge);
        border-radius: 24px;
        box-shadow: inset 0 1px 0 0 var(--edge-lit);
        backdrop-filter: blur(14px);
        /* The pointer pulls at the corners and the whole plane leans, so only
           transform changes and the work stays on the compositor. */
        transform-style: preserve-3d;
        /* Stated rather than left to the default, because the whole effect is
           about where the card is pinned. */
        transform-origin: 50% 50%;
        will-change: transform;
      }

      /* Asked for less motion, the card holds still. The script skips it too;
         this is the belt to that brace. */
      @media (prefers-reduced-motion: reduce) {
        main { transform: none !important; }
        .shadow { transform: translate3d(0, 22px, 0) scale(0.96) !important; }
      }

      /* The wordmark is used as the file is. It carries empty margin above and
         below the mark, which is 48.9 per cent of the file's height, so the
         element height is derived from the optical height wanted rather than
         the file being edited. */
      .mark {
        display: block;
        width: auto;
        height: calc(44px / 0.489);
        margin-inline: auto;
      }
      .eyebrow {
        margin-block-start: 4px;
        font-size: 0.8125rem;
        font-weight: 600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--faint);
      }
      .lead { margin-block-start: 28px; color: var(--muted); }
      .date {
        margin-block-start: 6px;
        font-family: "Barlow Condensed", ui-sans-serif, system-ui, sans-serif;
        font-size: clamp(1.5rem, 4vw, 2rem);
        font-weight: 700;
        line-height: 1.1;
        letter-spacing: -0.008em;
        text-shadow: 0 -1px 0 rgb(0 0 0 / 42%);
      }

      /* --- The flip clock --------------------------------------------------
         Each digit is a card split across the middle. On a change the old top
         half folds down and the new bottom half rises to meet it. Only
         transform and opacity move. */

      .clock {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: clamp(6px, 2vw, 12px);
        margin-block-start: 28px;
      }
      .unit { display: flex; flex-direction: column; align-items: center; gap: 8px; }
      .pair { display: flex; gap: 3px; }

      .digit {
        --h: clamp(46px, 11vw, 64px);
        --r: 7px;
        --flap: oklch(0.168 0.006 250);

        position: relative;
        display: block;
        width: calc(var(--h) * 0.68);
        height: var(--h);
        font-family: "Barlow Condensed", ui-sans-serif, system-ui, sans-serif;
        font-size: calc(var(--h) * 0.72);
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        line-height: 1;
        color: #ffffff;
        /* Near enough that the falling half foreshortens visibly. Further away
           and the two halves appear to slide past each other rather than to
           turn, which is what a flat projection looks like. */
        perspective: calc(var(--h) * 1.7);
      }
      /* The groove, in the colour of what lies behind the figures rather than in
         a shade of black laid over them. That is the difference between a gap
         and a veil: an opaque line in the flap's own colour interrupts the
         figure, which is what the gap between two physical flaps does, whilst a
         transparent one darkens it and reads as ink on the card.

         It fades out at both ends so it stops rather than meeting the edge. */
      .digit::after {
        position: absolute;
        z-index: 3;
        inset-inline: 0;
        top: calc(50% - 1.5px);
        height: 3px;
        content: "";
        background: linear-gradient(
          90deg,
          oklch(0.168 0.006 250 / 0%),
          var(--flap) 15%,
          var(--flap) 85%,
          oklch(0.168 0.006 250 / 0%)
        );
        pointer-events: none;
      }
      .face {
        position: absolute;
        inset-inline: 0;
        display: block;
        height: 50%;
        overflow: hidden;
        /* Darker than anything else on the card. A flap is a physical thing in
           front of the surface it sits on, and white figures need something to
           be white against. */
        background: var(--flap);
        backface-visibility: hidden;
      }
      /* A whole figure, clipped by the half-height face around it.
         Centring the line box is not centring the figure. Measured on the
         rendered card at 64px: the ink of a numeral ran from 16.25 to 49.75,
         so its middle sat at 33 whilst the seam sat at 32. The lift puts the
         two together, and it is stated in em so it holds as the card scales. */
      .glyph {
        display: block;
        height: var(--h);
        line-height: var(--h);
        text-align: center;
        transform: translateY(-0.0727em);

        /* The figure itself shades towards the groove, white at the outer edge
           of each flap and very light grey where the two meet. One gradient
           over the whole figure does both halves, because each face clips the
           half it shows.

           The grey sits at 53.5 rather than 50 per cent: the figure is lifted
           onto the groove and the face has a hairline border, so the groove
           falls a little below the middle of the figure's own box. */
        background: linear-gradient(
          180deg,
          #ffffff 20%,
          #c9d1dd 53.5%,
          #ffffff 87%
        );
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }
      .front, .fold-top {
        top: 0;
        border: 1px solid var(--edge);
        border-bottom: 0;
        border-radius: var(--r) var(--r) 0 0;
      }
      .back, .fold-bottom {
        bottom: 0;
        border: 1px solid var(--edge);
        border-top: 0;
        border-radius: 0 0 var(--r) var(--r);
      }
      /* The lower faces show the lower half, so their figure is lifted by half
         a card and the clip does the rest. */
      .back .glyph, .fold-bottom .glyph { margin-block-start: calc(var(--h) / -2); }
      .fold-top, .fold-bottom { z-index: 2; }
      .fold-top { transform-origin: bottom; }
      .fold-bottom { transform-origin: top; transform: rotateX(90deg); }

      /* The two halves are two movements, not one split in the middle. The top
         falls, so it accelerates; the bottom lands, so it slows and settles
         with a small bounce. Giving both the same curve over one duration is
         what made it read as a slide. */
      .turning .fold-top {
        animation: fold-away 250ms cubic-bezier(0.45, 0, 0.9, 0.5) forwards;
      }
      .turning .fold-bottom {
        animation: fold-in 290ms cubic-bezier(0.33, 0, 0.2, 1) 250ms forwards;
      }
      @keyframes fold-away {
        from { transform: rotateX(0deg); }
        to { transform: rotateX(-90deg); }
      }
      @keyframes fold-in {
        0% { transform: rotateX(90deg); }
        66% { transform: rotateX(-7deg); }
        84% { transform: rotateX(3deg); }
        100% { transform: rotateX(0deg); }
      }

      /* Light comes from in front, so a face turning away from the reader loses
         it and a face turning towards them gains it. Without this the halves
         stay evenly lit throughout, which no physical flap does. */
      .fold-top::after, .fold-bottom::after {
        position: absolute;
        inset: 0;
        content: "";
        background: #000000;
        opacity: 0;
        pointer-events: none;
      }
      .turning .fold-top::after {
        animation: shade-away 250ms cubic-bezier(0.45, 0, 0.9, 0.5) forwards;
      }
      .turning .fold-bottom::after {
        animation: shade-in 290ms cubic-bezier(0.33, 0, 0.2, 1) 250ms forwards;
      }
      @keyframes shade-away {
        from { opacity: 0; }
        to { opacity: 0.62; }
      }
      @keyframes shade-in {
        from { opacity: 0.62; }
        to { opacity: 0; }
      }

      .label {
        font-size: 0.6875rem;
        font-weight: 600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--faint);
      }

      /* The two sentences are two lines because the author says so, and each
         still wraps on its own when the window is too narrow for it. */
      .body { margin-block-start: 28px; color: var(--muted); text-wrap: pretty; }
      .foot {
        margin-block-start: 28px;
        padding-block-start: 20px;
        font-size: 0.875rem;
        color: var(--faint);
        border-block-start: 1px solid var(--edge);
      }
      /* Undecorated until it is pointed at. The address reads as part of the
         sentence, and the colour already says it is a link. */
      a {
        color: var(--accent);
        text-decoration: none;
        text-underline-offset: 3px;
        transition: text-decoration-color var(--duration, 160ms) var(--ease);
      }
      a:hover, a:focus-visible {
        text-decoration: underline;
      }
      .open {
        margin-block-start: 28px;
        padding: 14px;
        font-weight: 600;
        background: color-mix(in oklab, #0d70d3 14%, transparent);
        border: 1px solid color-mix(in oklab, #0d70d3 60%, transparent);
        border-radius: 12px;
      }
      [hidden] { display: none !important; }

      /* Asked for less motion: the web holds still, and a digit changes without
         turning. The durations do not go to zero, because an instant change
         reads as a glitch rather than as a response. */
      @media (prefers-reduced-motion: reduce) {
        .turning .fold-top, .turning .fold-bottom,
        .turning .fold-top::after, .turning .fold-bottom::after { animation: none; }
      }
    </style>
  </head>
  <body>
    <canvas id="sky" aria-hidden="true"></canvas>

    <div class="stage">
      <!-- The shadow the card throws. It is a separate layer because a shadow
           belongs to the surface behind, not to the card: one drawn on the card
           turns with it, which is the one thing a real shadow never does. -->
      <div class="shadow" id="shadow" aria-hidden="true"></div>
      <main>
      <img class="mark" src="/logo.svg" alt="${copy.logoLabel}" width="900" height="450" />
      <p class="eyebrow">${copy.eyebrow}</p>

      <p class="lead">${copy.lead}</p>
      <p class="date"><time datetime="${LAUNCH}">${copy.date}</time></p>

      <!-- The digits read zero until the script fills them, and a reader
           without it sees the date above, which is the same information. -->
      <div class="clock" id="clock" data-target="${LAUNCH}" aria-hidden="true">
        ${copy.units.map(unit).join("\n        ")}
      </div>
      <p class="open" id="open" hidden>${copy.open}</p>

      <p class="body">${copy.body.join("<br />")}</p>
      <p class="foot">${copy.contact} <a href="mailto:hello@layered.work">hello@layered.work</a></p>
      </main>
    </div>

    <script>${SCENE_SCRIPT}</script>
    <script>${COUNTDOWN_SCRIPT}</script>
  </body>
</html>
`;
}

/** Serves a file from public/, refusing anything that leaves it. */
async function servePublic(path: string): Promise<{ body: Buffer; type: string } | null> {
  const type = CONTENT_TYPES[extname(path)];
  if (!type) return null;
  // Resolve first, then check containment. A path is only safe once it has been
  // through the resolver, because that is where dot segments are removed.
  const target = resolve(join(PUBLIC_DIR, normalize(path)));
  if (!target.startsWith(PUBLIC_DIR)) return null;
  try {
    return { body: await readFile(target), type };
  } catch {
    return null;
  }
}

const server = createServer((request, response) => {
  const path = (request.url ?? "/").split("?")[0] ?? "/";

  if (path !== "/") {
    void servePublic(path).then((file) => {
      if (!file) {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }
      response.writeHead(200, {
        "content-type": file.type,
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      });
      response.end(file.body);
    });
    return;
  }

  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "public, max-age=300",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
  });
  response.end(page());
});

server.listen(PORT, HOST, () => {
  console.log(JSON.stringify({ message: "website listening", host: HOST, port: PORT }));
});
