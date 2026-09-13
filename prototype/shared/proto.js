// Shared machinery for all three design proposals.
//
// The proposals differ in look, never in data or structure, so everything that
// is not a design decision lives here exactly once: the content selectors, the
// formatters, the hash router and the bar that switches between proposals.

import { content } from "./content.js";
import { append, each, html } from "./markup.js";

/** Locale for every date on the prototypes. The site language is en-gb. */
const DISPLAY_LOCALE = "en-GB";

/**
 * One formatter, constructed once.
 *
 * Constructing an Intl formatter inside a render function is the commonest
 * per-frame allocation in a list view. It is hoisted even for a prototype,
 * because the prototypes exist to show how the real thing behaves.
 */
const dateFormatter = new Intl.DateTimeFormat(DISPLAY_LOCALE, { day: "numeric", month: "short", year: "numeric" });
const monthFormatter = new Intl.DateTimeFormat(DISPLAY_LOCALE, { month: "short", year: "numeric" });

/** The views every proposal renders, in navigation order. */
export const VIEWS = [
  { id: "home", label: "Startseite" },
  { id: "project", label: "Projektseite" },
  { id: "post", label: "Blogbeitrag" },
  { id: "dashboard", label: "Dashboard" },
  { id: "tokens", label: "Tokens" },
];

/**
 * The site navigation agreed for the new site, in both languages.
 *
 * `id` is what decides which entry reads as current, never `view`. Three of
 * these have no view of their own in the prototype and would all point at the
 * start page, and comparing views would then mark all three at once.
 */
export const NAVIGATION = {
  en: [
    { id: "projects", label: "Projects", view: "project" },
    { id: "writing", label: "Writing", view: "post" },
    { id: "uses", label: "Uses", view: "home" },
    { id: "now", label: "Now", view: "home" },
    { id: "about", label: "About", view: "home" },
  ],
  de: [
    { id: "projects", label: "Projekte", view: "project" },
    { id: "writing", label: "Beiträge", view: "post" },
    { id: "uses", label: "Ausrüstung", view: "home" },
    { id: "now", label: "Werkstatt", view: "home" },
    { id: "about", label: "Über mich", view: "home" },
  ],
};

/**
 * The footer navigations.
 *
 * The footer holds several of them rather than one, each with its own heading
 * and its items stacked vertically underneath. They are managed separately in
 * the dashboard, which is why this is a list of lists and not one flat row.
 *
 * Social accounts are in none of them. They are a different kind of thing with a
 * different shape, and a row that holds both reads as neither.
 */
export const FOOTER_NAVIGATIONS = {
  en: [
    { title: "Work", items: ["Projects", "Writing", "Uses", "Now"] },
    { title: "About", items: ["About me", "Contact", "Colophon"] },
    { title: "Legal", items: ["Imprint", "Privacy", "security.txt"] },
    { title: "Follow", items: ["RSS", "JSON Feed"] },
  ],
  de: [
    { title: "Arbeit", items: ["Projekte", "Beiträge", "Ausrüstung", "Werkstatt"] },
    { title: "Über", items: ["Über mich", "Kontakt", "Impressum der Site"] },
    { title: "Rechtliches", items: ["Impressum", "Datenschutz", "security.txt"] },
    { title: "Folgen", items: ["RSS", "JSON Feed"] },
  ],
};

/**
 * The social accounts, managed in the dashboard and shown as icons in the
 * footer, apart from the navigation.
 *
 * These are the accounts actually configured on the current site. The marks come
 * from Simple Icons 15.16.0 (CC0-1.0) rather than from the interface icon set,
 * because a brand mark is the property of that brand and no general icon family
 * carries all of them. Phosphor has no Xing, which is what made the split
 * necessary.
 *
 * `brand` names a file in assets/brands. It is applied as a CSS mask, so the
 * mark takes the colour of whatever it sits on and the downloaded file itself is
 * never edited.
 */
export const SOCIAL_ACCOUNTS = [
  { platform: "Mastodon", brand: "mastodon", url: "https://oldbytes.space/@LAYERED", handle: "@LAYERED@oldbytes.space" },
  { platform: "GitHub", brand: "github", url: "https://github.com/LAYEREDwork", handle: "LAYEREDwork" },
  { platform: "YouTube", brand: "youtube", url: "https://www.youtube.com/@LAYEREDwork", handle: "@LAYEREDwork" },
  { platform: "Instagram", brand: "instagram", url: "https://www.instagram.com/layered.work/", handle: "layered.work" },
  { platform: "Xing", brand: "xing", url: "https://www.xing.com/profile/Frank_Gregor063742", handle: "Frank_Gregor063742" },
];

// --- Content selectors -----------------------------------------------------

/** Everything publicly visible, newest first. */
export const published = content.entries.filter((entry) => entry.status === "public");

/** Project pages, which carry the portfolio. The overview page is not one. */
export const projects = published.filter((entry) => entry.kind === "page" && entry.slug !== "projects");

/** Blog posts. */
export const posts = published.filter((entry) => entry.kind === "post");

/** The post phranck marked as featured in Publii. */
export const featured = posts.find((entry) => entry.featured) ?? posts[0];

/** Posts below the featured one, so the hero is never repeated in the list. */
export const recentPosts = posts.filter((entry) => entry !== featured);

/** Every entry the dashboard lists, drafts and hidden ones included. */
export const allEntries = content.entries;

/**
 * The project shown on the project view.
 *
 * The SoundBox is the richest of the eight: it carries a 3D model, a schematic,
 * a component breakdown and its own headings, so it exercises every shortcode
 * the new site will have to render.
 */
export const showcaseProject = projects.find((entry) => entry.slug === "next-soundbox") ?? projects[0];

/**
 * The post shown on the post view.
 *
 * This one exists in both languages, which is what makes it the right subject:
 * the translation notice only has something to say on a post that has a
 * counterpart.
 */
export const showcasePost = posts.find((entry) => entry.slug === "nextstep-on-rpi5-en") ?? posts[0];

/** The German counterpart of the showcase post, if there is one. */
export const showcaseTranslation = allEntries.find((entry) => entry.translationOf === showcasePost?.id);

/**
 * The blocks the landing page is assembled from.
 *
 * The landing page is the one page that is composed rather than written, so it
 * has a builder instead of a text body. Every block here is a block that
 * actually renders on the prototype's own start page, which keeps the builder
 * honest.
 *
 * Each block carries the settings it accepts. The shape is the same for all of
 * them, so the panel that edits one is written once and works for every type,
 * and a new block type needs an entry here rather than a new editor.
 *
 * A setting is `{ key, type, value, options? }`. `key` names its label in the
 * dashboard catalogue, `type` decides the control.
 */
export const LANDING_BLOCKS = [
  {
    id: "hero",
    typeKey: "blockType.hero",
    summaryKey: "blockSummary.hero",
    icon: "ph-crop",
    locked: true,
    settings: [
      { key: "field.headline", type: "text", value: "Gehäuse, Platinen und Software, die Schicht für Schicht entsteht." },
      { key: "field.intro", type: "textarea", value: "Nachbauten der NeXT-Hardware in klein, Raspberry-Pi-Gehäuse aus dem eigenen Drucker und das, was beim Bauen an Software anfällt." },
      { key: "field.eyebrow", type: "text", value: "Bregenz, Vorarlberg" },
      { key: "field.image", type: "media", value: "NeXTcube-mini.jpg" },
      { key: "field.primaryAction", type: "text", value: "Projekte ansehen" },
      { key: "field.secondaryAction", type: "text", value: "Beiträge lesen" },
      { key: "field.showStack", type: "switch", value: true },
    ],
  },
  {
    id: "featured",
    typeKey: "blockType.featured",
    summaryKey: "blockSummary.featured",
    icon: "ph-star",
    settings: [
      { key: "field.heading", type: "text", value: "Woran gerade gearbeitet wird" },
      { key: "field.source", type: "select", value: "flagged", options: ["flagged", "newest", "pinned"] },
      { key: "field.entry", type: "entry", value: "NeXT mini Replica Interest" },
      { key: "field.showExcerpt", type: "switch", value: true },
    ],
  },
  {
    id: "projects",
    typeKey: "blockType.projects",
    summaryKey: "blockSummary.projects",
    icon: "ph-squares-four",
    settings: [
      { key: "field.heading", type: "text", value: "Gebaut, gedruckt, gelötet" },
      { key: "field.count", type: "number", value: 6 },
      { key: "field.sort", type: "select", value: "date", options: ["date", "title", "manual"] },
      { key: "field.withImageOnly", type: "switch", value: true },
      { key: "field.showAllLink", type: "switch", value: true },
    ],
  },
  {
    id: "posts",
    typeKey: "blockType.posts",
    summaryKey: "blockSummary.posts",
    icon: "ph-cards",
    settings: [
      { key: "field.heading", type: "text", value: "Notizen aus der Werkstatt" },
      { key: "field.count", type: "number", value: 6 },
      { key: "field.topicFilter", type: "select", value: "all", options: ["all", "electronics", "software"] },
      { key: "field.excludeFeatured", type: "switch", value: true },
    ],
  },
  {
    id: "tags",
    typeKey: "blockType.tags",
    summaryKey: "blockSummary.tags",
    icon: "ph-tag",
    settings: [
      { key: "field.heading", type: "text", value: "Wonach sich das Archiv sortieren lässt" },
      { key: "field.minCount", type: "number", value: 1 },
      { key: "field.showCounts", type: "switch", value: true },
    ],
  },
];

/** Blocks that can be added but are not currently placed. */
export const AVAILABLE_BLOCKS = [
  { id: "text", typeKey: "blockType.text", icon: "ph-text-align-left" },
  { id: "gallery", typeKey: "blockType.gallery", icon: "ph-images" },
  { id: "form", typeKey: "blockType.form", icon: "ph-textbox" },
  { id: "model", typeKey: "blockType.model", icon: "ph-cube" },
  { id: "divider", typeKey: "blockType.divider", icon: "ph-minus" },
];

/** Tags that are actually in use, with how often, most used first. */
export const tagsInUse = (() => {
  const counts = new Map();
  for (const entry of content.entries) {
    for (const tag of entry.tags) {
      counts.set(tag.slug, { ...tag, count: (counts.get(tag.slug)?.count ?? 0) + 1 });
    }
  }
  return [...counts.values()].sort((left, right) => right.count - left.count);
})();

/** Counts the dashboard overview shows, derived rather than written down. */
export const contentStats = {
  total: allEntries.length,
  posts: allEntries.filter((entry) => entry.kind === "post").length,
  pages: allEntries.filter((entry) => entry.kind === "page").length,
  drafts: allEntries.filter((entry) => entry.status === "draft").length,
  hidden: allEntries.filter((entry) => entry.status === "hidden").length,
  german: allEntries.filter((entry) => entry.language === "de").length,
  translated: allEntries.filter((entry) => entry.translationOf).length,
  tags: content.tags.length,
};

// --- Formatting ------------------------------------------------------------

export const formatDate = (value) => dateFormatter.format(new Date(value));
export const formatMonth = (value) => monthFormatter.format(new Date(value));

/** Reading time as the label the site shows. */
export const readingTime = (entry) => `${entry.readTime} min`;

// --- Router ----------------------------------------------------------------

/**
 * Minimal hash router shared by all three prototypes.
 *
 * A prototype that reloads the document on every navigation cannot show how a
 * transition feels, which is a large part of what is being judged, so views swap
 * in place.
 *
 * @param renderView Called with the view id whenever the route changes.
 */
export function startRouter(renderView) {
  const currentView = () => {
    const requested = window.location.hash.replace(/^#\/?/, "");
    return VIEWS.some((view) => view.id === requested) ? requested : VIEWS[0].id;
  };

  const apply = () => {
    const view = currentView();
    document.documentElement.dataset.view = view;
    renderView(view);
    for (const link of document.querySelectorAll("[data-view-link]")) {
      link.toggleAttribute("data-current", link.dataset.viewLink === view);
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  window.addEventListener("hashchange", apply);
  apply();
}

// --- Proposal switcher -----------------------------------------------------

/**
 * The bar pinned to the bottom of the prototype.
 *
 * Prototype chrome, not part of the design: it exists so the five views can be
 * reached without a navigation the real site will not have.
 */
export function mountSwitcher() {
  const bar = document.createElement("nav");
  bar.className = "proto-bar";
  bar.setAttribute("aria-label", "Ansichten");
  append(
    bar,
    html`
      <span class="proto-bar__label">Ansicht</span>
      <div class="proto-bar__views">
        ${each(
          VIEWS,
          (view) => html`<a class="proto-bar__view" data-view-link="${view.id}" href="#/${view.id}">${view.label}</a>`,
        )}
      </div>
    `,
  );
  document.body.append(bar);
}

/**
 * Reveals elements as they enter the viewport.
 *
 * Only `opacity` and `transform` are animated, so the work stays on the
 * compositor. Elements are unobserved once revealed, because an observer still
 * firing for the rest of the session costs for nothing.
 */
export function observeReveals(root = document) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    for (const element of root.querySelectorAll("[data-reveal]")) element.setAttribute("data-revealed", "");
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute("data-revealed", "");
        observer.unobserve(entry.target);
      }
    },
    // Positive bottom margin, so an element begins arriving before it is on
    // screen. A reveal that waits for the element to be visible leaves a fast
    // scroller looking at empty space, which reads as a broken page rather than
    // as an animation.
    { rootMargin: "0px 0px 20% 0px", threshold: 0 },
  );
  for (const element of root.querySelectorAll("[data-reveal]:not([data-revealed])")) observer.observe(element);
}

/**
 * Wires search, wherever the current view has one.
 *
 * There is one shortcut for searching in this product and it is Cmd+K, so the
 * key is handled in one place rather than being taught to every screen that
 * happens to have a field. What the shortcut does depends on what the screen
 * offers: a page opens its overlay, the dashboard focuses the field that filters
 * the list in front of you. Both are "search here", which is why they share a
 * key.
 *
 * Ctrl+K is the same key on a keyboard without a command key.
 */
export function wireSearch(rootElement) {
  const overlay = rootElement.querySelector("[data-search-overlay]");
  const field = overlay?.querySelector("input");

  const setOverlayOpen = (open) => {
    overlay.toggleAttribute("data-open", open);
    document.documentElement.toggleAttribute("data-search-open", open);
    if (open) field?.focus();
  };

  if (overlay) {
    for (const trigger of rootElement.querySelectorAll("[data-search-open-trigger]")) {
      trigger.addEventListener("click", () => setOverlayOpen(true));
    }
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) setOverlayOpen(false);
    });
  }

  /** Whatever "search" means on the screen currently rendered. */
  const openSearch = () => {
    if (overlay) {
      setOverlayOpen(true);
      return;
    }
    const inlineField = rootElement.querySelector('input[type="search"]');
    if (!inlineField) return;
    inlineField.focus();
    inlineField.select();
  };

  // It has to work whilst a field has focus, which is why it is not guarded by
  // the active element the way a bare letter key would have to be.
  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      if (overlay) setOverlayOpen(false);
      else if (document.activeElement?.matches?.('input[type="search"]')) document.activeElement.blur();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openSearch();
    }
  };

  // The listener belongs to the rendered view, so the previous one goes when the
  // view does. Without this every navigation would leave another behind.
  document.removeEventListener("keydown", activeSearchKeyHandler);
  activeSearchKeyHandler = onKeyDown;
  document.addEventListener("keydown", onKeyDown);
}

/** The key handler currently installed, so it can be replaced on re-render. */
let activeSearchKeyHandler = () => {};
