// Schichtung. The five views.
//
// Every view is a function of the shared content, so nothing on these pages is
// invented: the titles, the excerpts, the prose, the dates, the tags and the
// images all come out of the Publii database.

import { Button, Card, Section } from "../ui/index.js";
import { searchOverlay, siteFooter, siteHeader } from "../shared/chrome.js";
import { each, html, render } from "../shared/markup.js";
import {
  featured,
  formatDate,
  mountSwitcher,
  observeReveals,
  posts,
  projects,
  readingTime,
  recentPosts,
  showcasePost,
  showcaseProject,
  showcaseTranslation,
  startRouter,
  tagsInUse,
  wireSearch,
} from "../shared/proto.js";
import { dashboardView, wireDashboard } from "../shared/dashboard-view.js";
import { applyReadingWidth } from "../shared/site-settings.js";
import { tokensView } from "../shared/tokens-view.js";

/** How far apart the items of a revealed group arrive. */
const STAGGER_MS = 55;

const stagger = (index) => `--reveal-delay: ${index * STAGGER_MS}ms`;

// --- Shared pieces ---------------------------------------------------------

/**
 * The one card used for posts and projects alike.
 *
 * It is a compound rather than a card with flags: the caller composes media,
 * body and foot, so a card that needs no image simply leaves the media out
 * instead of switching a boolean.
 */
const entryCard = (entry, index) => html`
  <div data-reveal style="${stagger(index)}">
    ${Card.link(
      "#/post",
      entry.image && Card.Media({ src: entry.image }),
      Card.Body(html`
        <div class="stack" style="gap: var(--space-3)">
          <div class="meta">
            <span class="numeric">${formatDate(entry.date)}</span>
            <span class="meta__dot"></span>
            <span>${readingTime(entry)}</span>
            ${entry.language === "de" && html`<span class="lang-tag" data-language="de">de</span>`}
          </div>
          <h3 class="title-card">${entry.title}</h3>
          <p style="font-size: var(--text-base); color: var(--text-muted)">${entry.excerpt}</p>
        </div>
      `),
      Card.Footer({
        note: html`
          <span class="cluster">
            ${each(entry.tags.slice(0, 2), (tag) => html`<span class="chip">${tag.name}</span>`)}
          </span>
        `,
        actions: html`<span class="chip chip--action" aria-hidden="true"><i class="ph ph-arrow-right"></i></span>`,
      }),
    )}
  </div>
`;

/**
 * A section heading on the site.
 *
 * The shared Section.Title, wrapped only to add the reveal. Everything about how
 * it looks comes from the page's token scope, which is why the site needs no
 * heading component of its own.
 */
const sectionHead = (eyebrow, title, action) => html`
  <div data-reveal>
    ${Section.Title({
      eyebrow,
      title,
      actions: action && Button.link({ href: "#/home", label: action, icon: "ph ph-arrow-right", size: "small" }),
    })}
  </div>
`;

// --- Home ------------------------------------------------------------------

const homeView = () => html`
  ${siteHeader()}
  ${searchOverlay()}
  <main>
    <section class="page hero">
      <div class="hero__copy" data-reveal>
        <p class="eyebrow" style="align-self: stretch">Bregenz, Vorarlberg</p>
        <h1 class="title-hero">Gehäuse, Platinen und Software, die <em>Schicht für Schicht</em> entsteht.</h1>
        <p class="lede">
          Nachbauten der NeXT-Hardware in klein, Raspberry-Pi-Gehäuse aus dem eigenen Drucker und das,
          was beim Bauen an Software anfällt. Alles dokumentiert, damit es jemand nachbauen kann.
        </p>
        <div class="actions" style="justify-content: flex-start">
          ${Button.link({ href: "#/project", label: "Projekte ansehen", icon: "ph ph-stack", tone: "primary" })}
          ${Button.link({ href: "#/post", label: "Beiträge lesen", icon: "ph ph-article" })}
        </div>
      </div>
      <div class="plate-stack" data-reveal style="--reveal-delay: 120ms">
        <div class="plate plate--back"></div>
        <div class="plate plate--middle"></div>
        <div class="plate plate--front">
          <img src="../assets/img/NeXTcube-mini.jpg" alt="Der NeXTcube mini auf einer Holzplatte" />
          <div class="plate__caption">
            <span class="stack" style="gap: 2px">
              <strong>NeXTcube mini</strong>
              <span>Gehäuse, Netzteil, Lüfter, alles im Würfel</span>
            </span>
          </div>
        </div>
      </div>
    </section>

    <section class="page section section--page">
      ${sectionHead("Im Vordergrund", "Woran gerade gearbeitet wird")}
      <article data-reveal>
        ${Card.link(
          "#/post",
          html`
            <div class="feature">
              <div class="feature__media"><img src="${featured.image}" alt="" /></div>
              <div class="feature__body">
                <div class="meta">
                  <span class="numeric">${formatDate(featured.date)}</span>
                  <span class="meta__dot"></span>
                  <span>${readingTime(featured)}</span>
                </div>
                <h3 class="title-page" style="font-size: var(--text-2xl)">${featured.title}</h3>
                <p class="lede" style="font-size: var(--text-base)">${featured.excerpt}</p>
                <div class="cluster">
                  ${each(featured.tags, (tag) => html`<span class="chip">${tag.name}</span>`)}
                </div>
                ${Button.inert({ label: "Weiterlesen", icon: "ph ph-arrow-right", tone: "primary", size: "small" })}
              </div>
            </div>
          `,
        )}
      </article>
    </section>

    <section class="page section section--page">
      ${sectionHead("Projekte", "Gebaut, gedruckt, gelötet", "Alle Projekte")}
      <div class="grid grid--cards">
        ${each(projects.slice(0, 6), entryCard)}
      </div>
    </section>

    <section class="page section section--page">
      ${sectionHead("Beiträge", "Notizen aus der Werkstatt", "Alle Beiträge")}
      <div class="grid grid--cards">
        ${each(recentPosts.slice(0, 6), entryCard)}
      </div>
    </section>

    <section class="page section section--page">
      ${sectionHead("Themen", "Wonach sich das Archiv sortieren lässt")}
      <div class="tag-rail" data-reveal>
        ${each(
          tagsInUse,
          (tag) => html`
            <a class="chip" href="#/home">${tag.name}<span class="chip__count">${tag.count}</span></a>
          `,
        )}
      </div>
    </section>
  </main>
  ${siteFooter()}
`;

// --- Project ---------------------------------------------------------------

const projectView = () => html`
  ${siteHeader({ current: "projects" })}
  ${searchOverlay()}
  <main>
    <div class="page">
      <section class="project-hero" data-reveal>
        <img src="${showcaseProject.image}" alt="" />
        <div class="project-hero__scrim"></div>
        <div class="project-hero__copy">
          <div class="cluster">
            <span class="badge" data-status="public">Öffentlich</span>
            ${each(showcaseProject.tags.slice(0, 3), (tag) => html`<span class="chip">${tag.name}</span>`)}
          </div>
          <h1 class="title-page">${showcaseProject.title}</h1>
          <p class="lede" style="font-size: var(--text-base)">${showcaseProject.excerpt}</p>
        </div>
      </section>
    </div>

    <div class="page section--page stack" style="gap: var(--space-8)">
      <div class="spec-grid" data-reveal>
        ${each(
          [
            ["Status", "In Arbeit"],
            ["Begonnen", formatDate(showcaseProject.date)],
            ["Fertigung", "FDM, PETG"],
            ["Elektronik", "USB-C, ESD-Schutz"],
          ],
          ([label, value]) => html`
            <div class="spec">
              <span class="spec__label">${label}</span>
              <span class="spec__value">${value}</span>
            </div>
          `,
        )}
      </div>

      <div class="prose" data-reveal>
        ${each(showcaseProject.paragraphs.slice(0, 2), (paragraph) => html`<p>${paragraph}</p>`)}
      </div>

      <section class="stack" data-reveal>
        <p class="eyebrow">3D-Modell</p>
        <div class="model-frame">
          <span class="model-frame__badge">{{ model src="next-soundbox.glb" }}</span>
          <div class="model-frame__hint">
            <i class="ph-duotone ph-cube" style="font-size: 44px; color: var(--accent-400)"></i>
            <span>Drehbares Modell, wie es heute schon in vier Beiträgen steht</span>
          </div>
        </div>
      </section>

      ${each(
        showcaseProject.headings.slice(0, 2),
        (heading, index) => html`
          <section class="stack" data-reveal>
            <h2 class="title-section" style="padding-inline-start: var(--card-text-inset)">${heading}</h2>
            <div class="prose">
              <p>${showcaseProject.paragraphs[index + 2] ?? showcaseProject.excerpt}</p>
            </div>
          </section>
        `,
      )}

      <section class="stack" data-reveal>
        <p class="eyebrow">Galerie</p>
        <div class="gallery">
          ${each(
            projects.filter((entry) => entry.image).slice(0, 4),
            (entry) => html`
              <figure><img src="${entry.image}" alt="${entry.title}" loading="lazy" /></figure>
            `,
          )}
        </div>
      </section>

      <section class="stack" data-reveal>
        ${sectionHead("Weiter", "Andere Projekte")}
        <div class="grid grid--cards">
          ${each(projects.filter((entry) => entry !== showcaseProject).slice(0, 3), entryCard)}
        </div>
      </section>
    </div>
  </main>
  ${siteFooter()}
`;

// --- Post ------------------------------------------------------------------

const postView = () => html`
  ${siteHeader({ current: "writing", translation: showcaseTranslation ?? null })}
  ${searchOverlay()}
  <main class="page">
    <article>
      <header class="article-head" data-reveal>
        <div class="cluster">
          ${each(showcasePost.tags.slice(0, 4), (tag) => html`<span class="chip">${tag.name}</span>`)}
        </div>
        <h1 class="title-page">${showcasePost.title}</h1>
        <div class="meta">
          <span class="numeric">${formatDate(showcasePost.date)}</span>
          <span class="meta__dot"></span>
          <span>${readingTime(showcasePost)}</span>
          <span class="meta__dot"></span>
          <span class="lang-tag" data-language="en">en</span>
        </div>
      </header>


      <div class="article-body">
        <div class="prose" data-reveal>
          ${each(showcasePost.paragraphs.slice(0, 2), (paragraph) => html`<p>${paragraph}</p>`)}
        </div>

        <figure data-reveal>
          ${Card(
            Card.Media({ src: showcasePost.image, ratio: "21 / 9" }),
            Card.Caption("NeXTSTEP 3.3 unter dem Previous-Emulator auf einem Raspberry Pi 5"),
          )}
        </figure>

        <div class="prose" data-reveal>
          <h2>${showcasePost.headings[0] ?? "Vorbereitung"}</h2>
          ${each(showcasePost.paragraphs.slice(2, 4), (paragraph) => html`<p>${paragraph}</p>`)}
        </div>

        <div class="code-block" data-reveal>
          <div class="code-block__gutter">1<br />2<br />3<br />4<br />5</div>
          <pre class="code-block__code"><span class="com"># Previous auf dem Raspberry Pi bauen</span>
<span class="kw">sudo</span> apt install cmake libsdl2-dev libcapstone-dev
<span class="kw">git</span> clone https://git.code.sf.net/p/previous/code previous
<span class="kw">cmake</span> -B build -DCMAKE_BUILD_TYPE=<span class="str">Release</span>
<span class="kw">cmake</span> --build build -j4</pre>
        </div>

        <blockquote class="pull-quote" data-reveal>
          ${showcasePost.paragraphs[1] ?? showcasePost.excerpt}
        </blockquote>

        <div class="prose" data-reveal>
          <h2>${showcasePost.headings[1] ?? "Hardware"}</h2>
          ${each(showcasePost.paragraphs.slice(4, 6), (paragraph) => html`<p>${paragraph}</p>`)}
        </div>

        <div class="actions" data-reveal>
          ${Button.link({ href: "#/post", label: "Teilen", icon: "ph ph-share-network", size: "small" })}
          ${Button.link({ href: "#/post", label: "Nächster Beitrag", icon: "ph ph-arrow-right", size: "small" })}
        </div>
      </div>
    </article>

    <section class="section section--page">
      ${sectionHead("Weiterlesen", "Verwandte Beiträge")}
      <div class="grid grid--cards">
        ${each(posts.filter((entry) => entry !== showcasePost).slice(0, 3), entryCard)}
      </div>
    </section>
  </main>
  ${siteFooter()}
`;

// --- Tokens ----------------------------------------------------------------

const tokensIntro = () => html`
  <section class="stack" data-reveal style="padding-block-start: var(--space-6)">
    <p class="eyebrow">Design-System</p>
    <h1 class="title-page">Schichtung</h1>
    <p class="lede">
      Der Name der Site ist die Gestaltung. Inhalte liegen als Schichten über der Seite, und eine Schicht
      sagt ihre Höhe auf drei Weisen zugleich: Sie ist heller als das, worauf sie liegt, sie trägt oben
      eine Lichtkante dort wo das Licht sie fasst, und sie wirft einen Schatten. Dieser Dreiklang ist es,
      was eine Fläche als Material lesbar macht statt als farbiges Rechteck.
    </p>
    <p class="lede">
      Die Farbe steht nicht hier, sondern in <code>palettes.css</code>. Alles Übrige liest von dort, und
      keine Komponente nennt je eine Farbe selbst, weshalb ein Palettenwechsel achtzehn Werte bewegt und
      sonst nichts anfasst. Unten in der Leiste lässt sich das an dieser Seite ausprobieren.
    </p>
    <p class="lede">
      Die Liste ist nicht abgetippt, sondern aus dem laufenden Stylesheet gelesen, und zwar aus der
      gerade aktiven Palette. Sie kann deshalb nicht davon abweichen, was die Seite tatsächlich zeigt.
    </p>
  </section>
`;

// --- Mount -----------------------------------------------------------------

const VIEW_RENDERERS = {
  home: homeView,
  project: projectView,
  post: postView,
  dashboard: dashboardView,
  tokens: () => tokensView({ header: siteHeader(), intro: tokensIntro() }),
};

const root = document.querySelector("#app");

/** Renders a view and wires whatever that view needs. */
/** Which entry each view renders, for the settings that belong to an entry. */
const VIEW_ENTRY = { post: () => showcasePost.id, project: () => showcaseProject.id };

function show(view, dashboardArea, editingId, openBlockId, accountOpen) {
  // The reading measure belongs to the entry being shown, so it is put in force
  // for the page about to render rather than once at start-up.
  const shown = VIEW_ENTRY[view]?.();
  if (shown === undefined) document.documentElement.style.removeProperty("--reading-measure");
  else applyReadingWidth(shown);

  render(
    root,
    view === "dashboard"
      ? dashboardView(dashboardArea, editingId, openBlockId, accountOpen)
      : VIEW_RENDERERS[view](),
  );
  wireSearch(root);
  observeReveals(root);
  if (view === "dashboard") {
    wireDashboard(root, (area, entryId, blockId, account) =>
      show("dashboard", area, entryId, blockId, account),
    );
  }
}

startRouter((view) => show(view));

mountSwitcher();
