// The dashboard, identical in all three proposals.
//
// It is not part of any proposal, so it lives here once rather than three times.
// Its look follows the workbench in lmaa and musiccloud; `dashboard.css` carries
// the token scope that makes that true.

import {
  Button,
  Card,
  Choice,
  Editor,
  Field,
  Input,
  Logo,
  Row,
  RowList,
  Section,
  Segmented,
  Select,
  selectChoice,
  selectSegment,
  Shortcut,
  Sidebar,
  Switch,
} from "../ui/index.js";
import { brandMark } from "./chrome.js";
import { DASHBOARD_LANGUAGES, dashboardLanguage, setDashboardLanguage, t } from "./dashboard-i18n.js";
import { READING_WIDTHS, readingWidthOf, setReadingWidthOf } from "./site-settings.js";
import { attrs, each, html } from "./markup.js";
import {
  allEntries,
  AVAILABLE_BLOCKS,
  contentStats,
  FOOTER_NAVIGATIONS,
  formatDate,
  LANDING_BLOCKS,
  SOCIAL_ACCOUNTS,
} from "./proto.js";

/**
 * Everything the dashboard manages, in the order the sidebar lists it.
 *
 * Groups and entries carry keys rather than words, so the stored order survives
 * a change of language: what is remembered is which group, not what it was
 * called at the time.
 */
const SECTIONS = [
  {
    key: "group.content",
    items: [
      { key: "area.posts", icon: "ph-article", count: contentStats.posts },
      { key: "area.pages", icon: "ph-files", count: contentStats.pages },
      { key: "area.tags", icon: "ph-tag", count: contentStats.tags },
      { key: "area.media", icon: "ph-images", count: 17 },
    ],
  },
  {
    key: "group.landing",
    items: [{ key: "area.blocks", icon: "ph-stack-simple", count: LANDING_BLOCKS.length }],
  },
  {
    key: "group.structure",
    items: [
      { key: "area.mainNav", icon: "ph-list", count: 5 },
      { key: "area.footerNav", icon: "ph-list-dashes", count: FOOTER_NAVIGATIONS.de.length },
      { key: "area.social", icon: "ph-share-network", count: SOCIAL_ACCOUNTS.length },
    ],
  },
  {
    key: "group.forms",
    items: [
      { key: "area.forms", icon: "ph-textbox", count: 3 },
      { key: "area.submissions", icon: "ph-tray", count: 12 },
      { key: "area.mailTemplates", icon: "ph-envelope-simple", count: 6 },
    ],
  },
  {
    key: "group.system",
    items: [
      { key: "area.smtp", icon: "ph-paper-plane-tilt", count: null },
      { key: "area.analytics", icon: "ph-chart-line", count: null },
      { key: "area.settings", icon: "ph-gear", count: null },
    ],
  },
];

/** Status words come from the catalogue, so a badge speaks the reader's language. */
const statusLabel = (status) => t(`status.${status}`);

/**
 * Which panels each sidebar entry opens.
 *
 * The dashboard is a set of areas rather than one long page, so the sidebar
 * switches between them exactly as the real one would. An entry with no panels
 * yet shows the placeholder, which is honest about what the prototype covers.
 *
 * Content areas list their entries and nothing else. The editor is a second
 * state reached by opening one of them, not a panel underneath the list, because
 * nobody edits a post whilst looking at a table of all the others.
 */
const AREAS = {
  "area.posts": ["statistics", "entryTable"],
  "area.pages": ["statistics", "entryTable"],
  "area.blocks": ["landingBuilder"],
  "area.footerNav": ["footerNavigations"],
  "area.social": ["socialAccounts"],
};

const DEFAULT_AREA = "area.posts";

/**
 * The icon of each action, stated once so that saving looks the same on every
 * screen. Keyed by the catalogue key of the action's label.
 */
const ACTION_ICONS = {
  filter: "ph ph-funnel",
  new: "ph ph-plus",
  save: "ph ph-floppy-disk",
  cancel: "ph ph-x",
  preview: "ph ph-eye",
  delete: "ph ph-trash",
  publish: "ph ph-globe",
  saveDraft: "ph ph-floppy-disk-back",
  edit: "ph ph-pencil-simple",
  navigation: "ph ph-plus",
  account: "ph ph-plus",
};

/**
 * A button for one of the dashboard's actions: the label from the catalogue,
 * the icon from the table above, and the workbench size.
 *
 * @param key     The action, as in `action.<key>` of the catalogue.
 * @param options Tone and attributes, passed on to the Button.
 */
const action = (key, options = {}) =>
  Button({ label: t(`action.${key}`), icon: ACTION_ICONS[key], size: "small", ...options });

/**
 * The signed-in user, at the foot of the sidebar.
 *
 * The dashboard sits behind a login, so it has to say who is signed in and offer
 * the way out. It belongs at the bottom because it is the least frequent thing
 * anybody reaches for here, and because that is where it sits in lmaa and
 * musiccloud.
 */
const userSection = () =>
  Row.button(
    { "data-open-account": true, title: t("heading.accountTitle") },
    Row.Tile(html`<img src="../assets/img/portrait.jpg" alt="" />`),
    Row.Text({ title: "Frank Gregor", note: t("account.roleAdmin") }),
    Row.Actions(html`<i class="ph ph-caret-up-down" aria-hidden="true"></i>`),
  );

/** Where the reader's own order of the sidebar groups is kept. */
const SECTION_ORDER_KEY = "layered.dashboard.sectionOrder";

/**
 * The groups in the order this reader put them.
 *
 * The stored value is a list of labels rather than indices, so adding a group to
 * SECTIONS or renaming one degrades gracefully: anything stored but unknown is
 * dropped, anything known but unstored keeps its place at the end.
 */
function orderedSections() {
  let stored;
  try {
    stored = JSON.parse(localStorage.getItem(SECTION_ORDER_KEY) ?? "[]");
  } catch {
    stored = [];
  }
  const byKey = new Map(SECTIONS.map((section) => [section.key, section]));
  const ordered = stored.map((key) => byKey.get(key)).filter(Boolean);
  const rest = SECTIONS.filter((section) => !ordered.includes(section));
  return [...ordered, ...rest];
}

/** Records a new order. Called once on release, never during the drag. */
function storeSectionOrder(labels) {
  localStorage.setItem(SECTION_ORDER_KEY, JSON.stringify(labels));
}

const sidebar = (activeArea) =>
  Sidebar(
    Sidebar.Header(Logo({ href: "#/dashboard", inkHeight: "26px" })),
    Sidebar.Body(
      each(orderedSections(), (section) =>
        html`
          <div class="section" data-section="${section.key}">
            ${Section.Title({
              attributes: { "data-section-handle": true },
              lead: html`<i class="ph ph-dots-six-vertical section__grip" aria-hidden="true"></i>`,
              title: t(section.key),
            })}
            ${Section.Body(
              RowList(
                each(section.items, (item) =>
                  Row.button(
                    { "data-area": item.key, title: t(item.key), "data-current": item.key === activeArea },
                    Row.Lead(html`<i class="ph-duotone ${item.icon}"></i>`),
                    Row.Text({ title: t(item.key) }),
                    item.count !== null ? Row.Meta(item.count) : "",
                  ),
                ),
              ),
            )}
          </div>
        `,
      ),
    ),
    Sidebar.Footer(userSection()),
    Sidebar.Handle({ label: t("sidebar.resize") }),
  );

/** The entries a content area lists. */
const entriesFor = (area) =>
  allEntries.filter((entry) => (area === "area.pages" ? entry.kind === "page" : entry.kind === "post"));

/**
 * The counts above a content list.
 *
 * They count what the list below them shows, because a number that describes a
 * different set than the table underneath it is worse than no number.
 */
const statistics = (area) => {
  const rows = entriesFor(area);
  const counted = (predicate) => rows.filter(predicate).length;
  return html`
    <div class="stat-row">
      ${each(
        [
          [t("stat.published"), counted((entry) => entry.status === "public"), t("stat.publishedNote")],
          [t("stat.drafts"), counted((entry) => entry.status === "draft"), t("stat.draftsNote")],
          [t("stat.hidden"), counted((entry) => entry.status === "hidden"), t("stat.hiddenNote")],
          [t("stat.translated"), counted((entry) => entry.translationOf), t("stat.translatedNote", rows.length)],
        ],
        ([label, value, note]) => html`
          <div class="card stat">
            <span class="stat__label">${label}</span>
            <span class="stat__value">${value}</span>
            <span class="stat__note">${note}</span>
          </div>
        `,
      )}
    </div>
  `;
};

/**
 * The entry list for a content area.
 *
 * A row is the way into the editor, so the whole row is the target rather than
 * a pencil at its right edge, and the pencil stays as the visible affordance.
 */
const entryTable = (area) => {
  const rows = entriesFor(area);
  return Card(
    Card.Header({
      title: t(area),
      meta: rows.length,
      actions: html`
        <label class="search-field">
          <i class="ph ph-magnifying-glass" aria-hidden="true"></i>
          <input class="input" type="search" placeholder="${t("table.search")}" />
          ${Shortcut({ key: "K" })}
        </label>
      `,
    }),
    html`
      <table class="data-table">
        <thead>
          <tr>
            <th class="col-title">${t("table.title")}</th>
            <th class="col-status">${t("table.status")}</th>
            <th class="col-language">${t("table.language")}</th>
            <th class="col-date align-end">${t("table.created")}</th>
            <th class="col-actions"><span class="align-end" style="display: block">${t("table.action")}</span></th>
          </tr>
        </thead>
        <tbody>
          ${each(
            rows,
            (entry) => html`
              <tr data-entry="${entry.id}" tabindex="0">
                <td class="col-title">
                  ${Row.bare(
                    Row.Tile(entry.image ? html`<img src="${entry.image}" alt="" loading="lazy" />` : ""),
                    Row.Text({ title: entry.title }),
                  )}
                </td>
                <td><span class="badge" data-status="${entry.status}">${statusLabel(entry.status)}</span></td>
                <td><span class="lang-tag" data-language="${entry.language}">${entry.language}</span></td>
                <td class="align-end">${formatDate(entry.date)}</td>
                <td>
                  <div class="actions">
                    ${Button.icon({ label: t("action.edit"), icon: ACTION_ICONS.edit })}
                  </div>
                </td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    `,
  );
};

/**
 * One setting of a block, as the control its type calls for.
 *
 * The same renderer serves every block, so a new block type needs an entry in
 * LANDING_BLOCKS and no new editor. A type this does not know falls through to a
 * text field rather than rendering nothing, which would hide the setting instead
 * of showing it is unfinished.
 */
const blockField = (setting) => {
  const label = t(setting.key);
  const id = `block-${setting.key.replace(".", "-")}`;
  if (setting.type === "switch") {
    return Field.Inline({ label, control: Switch({ on: setting.value, label }) });
  }
  // A dropdown rather than a segmented control: these options are two words
  // each, and a segmented control that has to shorten them leaves the reader
  // choosing between names they cannot read.
  if (setting.type === "select") {
    return Field({
      label,
      htmlFor: id,
      control: Select({
        id,
        value: setting.value,
        options: setting.options.map((option) => ({ value: option, label: t(`option.${option}`) })),
      }),
    });
  }
  if (setting.type === "textarea") {
    return Field({ label, control: html`<div class="input input--area">${setting.value}</div>` });
  }
  if (setting.type === "media") {
    return Field({
      label,
      control: html`
        <div class="media-field">
          <img src="../assets/img/${setting.value}" alt="" />
          <span class="media-field__name">${setting.value}</span>
          ${action("edit")}
        </div>
      `,
    });
  }
  return Field({
    label,
    htmlFor: id,
    control: Input({ id, value: setting.value, type: setting.type === "number" ? "number" : "text" }),
  });
};

/**
 * The landing page builder.
 *
 * The list on the left says what the page is made of and in what order, the
 * panel on the right sets up whichever block is open. Both at once, because
 * arranging and adjusting are the same task here: you move a block to see where
 * it belongs and then set it up for that place.
 *
 * @param area    Unused, present so every panel has the same signature.
 * @param blockId The block whose settings are open.
 */
const landingBuilder = (area, blockId) => {
  const open = LANDING_BLOCKS.find((block) => block.id === blockId) ?? LANDING_BLOCKS[0];
  return Editor(
    {},
    Editor.Main(
      Card(
        Card.Header({
          title: t("heading.blocks"),
          meta: LANDING_BLOCKS.length,
          actions: action("preview"),
        }),
        Card.Body(
          RowList(
            each(LANDING_BLOCKS, (block) =>
              Row.button(
                { "data-block": block.id, "data-active": block.id === open.id },
                Row.Grip(html`<i class="ph ph-dots-six-vertical"></i>`),
                Row.Tile(html`<i class="ph-duotone ${block.icon}"></i>`),
                Row.Text({ title: t(block.typeKey), note: t(block.summaryKey) }),
                Row.Actions(
                  block.locked
                    ? html`<span class="chip" title="${t("block.locked")}"><i class="ph ph-lock-simple"></i></span>`
                    : html`<span class="chip chip--quiet"><i class="ph ph-x"></i></span>`,
                ),
              ),
            ),
          ),
        ),
        Card.Footer({
          note: t("block.pickHint"),
          actions: html`
            <div class="cluster">
              ${each(
                AVAILABLE_BLOCKS,
                (block) => html`<button class="chip" type="button"><i class="ph ${block.icon}"></i>${t(block.typeKey)}</button>`,
              )}
            </div>
          `,
        }),
      ),
    ),
    Editor.Panel(
      {
        eyebrow: t("heading.landing"),
        title: t(open.typeKey),
        actions: action("save", { tone: "primary" }),
      },
      ...open.settings.map(blockField),
    ),
  );
};

/**
 * The account, shown over the page rather than in it.
 *
 * It is not a place in the dashboard but a thing you open, deal with and close,
 * so it takes an overlay rather than an area: the workbench behind it stays put
 * and comes back untouched.
 *
 * The portrait is the subject of this card, so it is large and its control sits
 * beneath it, centred under the thing it changes. A label over a picture and a
 * hint under a button would only name what both already show.
 */
const accountOverlay = () => html`
  <div class="card-overlay" data-open data-account-overlay>
    ${Card(
      Card.Header({ title: t("heading.accountTitle") }),
      Card.Body(html`
        <div class="account">
          <div class="account__portrait">
            <img class="account__avatar" src="../assets/img/portrait.jpg" alt="" />
            ${Button({ label: t("account.avatarChange"), icon: "ph ph-image", size: "small" })}
          </div>

          <div class="account__fields">
            ${Field({
              label: t("account.name"),
              htmlFor: "account-name",
              control: Input({ id: "account-name", value: "Frank Gregor" }),
            })}

            ${Field({
              label: t("account.email"),
              htmlFor: "account-email",
              control: Input({ id: "account-email", type: "email", value: "phranck@layered.work" }),
            })}

            ${Field({
              label: t("account.role"),
              control: html`<span class="badge" data-status="public">${t("account.roleAdmin")}</span>`,
            })}

            ${Field({
              label: t("account.language"),
              control: Segmented({
                name: "account-language",
                value: dashboardLanguage(),
                options: DASHBOARD_LANGUAGES.map((language) => ({ value: language.id, label: language.label })),
              }),
            })}
          </div>
        </div>
      `),
      Card.Footer({
        note: t("account.languageHint"),
        actions: [
          action("cancel", { attributes: { "data-close-account": true } }),
          action("save", { tone: "primary", attributes: { "data-save-account": true } }),
        ],
      }),
    )}
  </div>
`;

const footerNavigations = () =>
  Card(
    Card.Header({
      title: t("area.footerNav"),
      meta: FOOTER_NAVIGATIONS.de.length,
      actions: action("navigation", { tone: "primary" }),
    }),
    Card.Body(html`
      <div class="nav-manager">
        ${each(
          FOOTER_NAVIGATIONS.de,
          (navigation, index) => html`
            <div class="nav-manager__group" ${attrs({ "data-active": index === 0 })}>
              ${Row.bare(
                Row.Grip(html`<i class="ph ph-dots-six-vertical"></i>`),
                Row.Text({ title: navigation.title }),
                Row.Meta(navigation.items.length),
                Row.Actions(html`
                  ${Button.icon({ label: t("action.edit"), icon: ACTION_ICONS.edit })}
                `),
              )}
              <ul class="nav-manager__items">
                ${each(navigation.items, (label) => html`<li>${label}</li>`)}
              </ul>
            </div>
          `,
        )}
      </div>
    `),
  );

const socialAccounts = () =>
  Card(
    Card.Header({
      title: t("area.social"),
      meta: SOCIAL_ACCOUNTS.length,
      actions: action("account", { tone: "primary" }),
    }),
    Card.Body(
      RowList.divided(
        each(SOCIAL_ACCOUNTS, (account) =>
          Row(
            Row.Tile(brandMark(account.brand)),
            Row.Text({ title: account.platform, note: account.handle }),
            Row.Actions(
              Switch({ on: true }),
              html`
                ${Button.icon({ label: t("action.edit"), icon: ACTION_ICONS.edit })}
              `,
            ),
          ),
        ),
      ),
    ),
  );

/**
 * What the writing surface shows.
 *
 * A sample rather than the entry's real body, because the prototype has no
 * editor behind it: this is what an author sees, in the syntax colours of the
 * markdown editor in lmaa and musiccloud. The lines start at the margin, since
 * the surface preserves whitespace and an indent here would show on screen.
 */
const SAMPLE_BODY = html`## <span class="md">Prerequisites</span>

Before starting, make sure the Pi has a current firmware and enough space on the
card. The emulator itself is small, the disk images are not.

<span class="sc">{{</span> <span class="sc-name">model</span> <span class="sc-attr">src</span>=<span class="sc-str">"next-soundbox.glb"</span> <span class="sc">}}</span>

<span class="sc">{{</span> <span class="sc-name">gallery</span> <span class="sc-attr">columns</span>=<span class="sc-str">"3"</span> <span class="sc">}}</span>
  ![Front](img_0528.webp)
  ![Innen](banner-pandadock.jpeg)
<span class="sc">{{ /gallery }}</span>

<span class="sc">{{</span> <span class="sc-name">note</span> <span class="sc-attr">tone</span>=<span class="sc-str">"warning"</span> <span class="sc">}}</span>
Das Image braucht eine Karte mit mindestens 16 GB.
<span class="sc">{{ /note }}</span>`;

/**
 * The entry editor: the text on the left, its publication on the right.
 *
 * The panel holds everything that is decided about the entry rather than
 * written into it, so an author never has to leave the text to change how it is
 * published.
 */
const editor = (entry) =>
  Editor(
    { "data-editing": entry.id },
    Editor.Main(
      Editor.Toolbar(
        ["H2", "B", "I"].map((label) => Editor.Tool({ label })),
        [
          ["ph ph-quotes", "Zitat"],
          ["ph ph-link", "Link"],
          ["ph ph-image", "Bild"],
          ["ph ph-code", "Code"],
          ["ph ph-cube", "3D"],
          ["ph ph-play-circle", "Video"],
          ["ph ph-file-pdf", "PDF"],
          ["ph ph-graph", "Mermaid"],
          ["ph ph-table", "Table"],
        ].map(([icon, label]) => Editor.Tool({ label, icon })),
        Editor.Tool({ label: t("editor.shortcodes") }),
      ),
      Editor.Surface(SAMPLE_BODY),
      Editor.Actions({
        destructive: action("delete", { tone: "danger" }),
        actions: [action("preview"), action("saveDraft"), action("publish", { tone: "primary" })],
      }),
    ),
    Editor.Panel(
      { title: t("editor.publication"), note: t("editor.translationHint") },
      Choice({
        name: "entry-status",
        value: entry.status,
        options: [
          { value: "public", label: t("status.public"), note: t("status.publicNote"), tone: "success" },
          { value: "draft", label: t("status.draft"), note: t("status.draftNote"), tone: "warning" },
          { value: "hidden", label: t("status.hidden"), note: t("status.hiddenNote"), tone: "info" },
          { value: "secret", label: t("status.secret"), note: t("status.secretNote"), tone: "accent" },
        ],
      }),
      Field({
        label: t("editor.language"),
        control: Segmented({
          name: "entry-language",
          value: entry.language,
          options: [
            { value: "en", label: "EN" },
            { value: "de", label: "DE" },
          ],
        }),
      }),
      Field.Inline({
        label: t("editor.showInOther"),
        control: Switch({ on: true, label: t("editor.showInOther") }),
      }),
      Field({
        label: t("editor.translation"),
        htmlFor: "translation",
        control: Input({
          id: "translation",
          value: entry.translationOf
            ? (allEntries.find((candidate) => candidate.id === entry.translationOf)?.title ?? "")
            : "",
          placeholder: t("editor.noTranslation"),
        }),
      }),
      Field({
        label: t("setting.reading"),
        hint: t(
          "setting.readingHint",
          READING_WIDTHS.find((width) => width.id === readingWidthOf(entry.id))?.characters ?? null,
        ),
        control: Segmented({
          name: "reading-width",
          value: readingWidthOf(entry.id),
          options: READING_WIDTHS.map((width) => ({ value: width.id, label: width.label })),
        }),
      }),
      Field({
        label: t("editor.tags"),
        control: html`
          <div class="cluster">
            ${each(entry.tags, (tag) => html`<span class="chip" data-current>${tag.name}</span>`)}
            <button class="chip" type="button" aria-label="${t("editor.addTag")}"><i class="ph ph-plus"></i></button>
          </div>
        `,
      }),
    ),
  );

/** The panels, by the name the area list refers to them by. */
const PANELS = { statistics, entryTable, landingBuilder, footerNavigations, socialAccounts };

const AREA_HEADINGS = {
  "area.posts": ["heading.editorial", "area.posts"],
  "area.pages": ["heading.editorial", "area.pages"],
  "area.blocks": ["heading.landing", "heading.blocks"],
  "area.footerNav": ["heading.structure", "area.footerNav"],
  "area.social": ["heading.structure", "area.social"],
};

/** Shown for an area the prototype does not cover, rather than an empty page. */
const placeholder = (area) => html`
  <div class="card" style="display: grid; place-items: center; gap: var(--space-3); padding: var(--space-8)">
    <i class="ph-duotone ph-wrench" style="font-size: 32px; color: var(--text-faint)"></i>
    <p style="color: var(--text-muted)">${t("placeholder.notBuilt", t(area))}</p>
  </div>
`;

/**
 * The whole dashboard.
 *
 * @param area      Which sidebar entry is open.
 * @param editingId The entry being edited, if the editor is open. Editing is a
 *                  state of an area rather than an area of its own, so opening a
 *                  different area leaves it.
 */
export const dashboardView = (area = DEFAULT_AREA, editingId = null, openBlockId = null, accountOpen = false) => {
  const entry = editingId === null ? null : allEntries.find((candidate) => candidate.id === editingId);
  const headings = AREA_HEADINGS[area] ?? ["heading.editorial", area];
  const eyebrow = entry ? t(headings[1]) : t(headings[0]);
  const heading = entry ? entry.title : t(headings[1]);
  const panels = AREAS[area];

  return html`
    <div class="workbench" data-area="${area}">
      ${sidebar(area)}
      <div class="workbench__main">
        ${Section.Title({
          level: 1,
          // The way back stands in the eyebrow's place, so the heading under it
          // does not move when the editor opens.
          eyebrow: entry
            ? html`
                <button class="workbench-back" type="button" data-close-editor>
                  <i class="ph ph-arrow-left"></i>${eyebrow}
                </button>
              `
            : eyebrow,
          title: heading,
          actions: entry
            ? [action("cancel", { attributes: { "data-close-editor": true } }), action("save", { tone: "primary" })]
            : [action("filter"), action("new", { tone: "primary" })],
        })}
        ${entry
          ? editor(entry)
          : panels
            ? each(panels, (name) => PANELS[name](area, openBlockId))
            : placeholder(area)}
      </div>
      ${accountOpen ? accountOverlay() : ""}
    </div>
  `;
};

/**
 * Wires the sidebar, the entry rows and the way back out of the editor.
 *
 * Called after the dashboard is rendered. Re-rendering the whole workbench on
 * every change is right here: it is one screen, it is cheap, and it keeps the
 * state in exactly one place instead of spreading it across panels that each
 * remember whether they are shown.
 */
/** The escape handler currently installed, so a re-render replaces it. */
let activeEscapeHandler = () => {};

export function wireDashboard(root, rerender) {
  const currentArea = () => root.querySelector(".workbench").dataset.area;

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-open-account]")) {
      rerender(currentArea(), null, null, true);
      return;
    }

    if (event.target.closest("[data-close-account]")) {
      rerender(currentArea(), null, null, false);
      return;
    }

    // Clicking the dimmed area behind the card closes it, as any overlay does.
    if (event.target.matches("[data-account-overlay]")) {
      rerender(currentArea(), null, null, false);
      return;
    }

    const areaButton = event.target.closest("button[data-area]");
    if (areaButton) {
      rerender(areaButton.dataset.area, null, null, false);
      return;
    }

    if (event.target.closest("[data-close-editor]")) {
      rerender(currentArea(), null, null);
      return;
    }

    // Saving the account applies the language at once. A setting that needs a
    // reload to take effect is a setting the reader cannot tell they changed.
    if (event.target.closest("[data-save-account]")) {
      const chosen = root.querySelector("[data-account-language] [aria-pressed='true']");
      if (chosen) setDashboardLanguage(chosen.dataset.value);
      rerender(currentArea(), null, null, false);
      return;
    }

    const statusChoice = event.target.closest("[data-entry-status] .choice__option");
    if (statusChoice) {
      selectChoice(statusChoice);
      return;
    }

    const entryLanguage = event.target.closest("[data-entry-language] button");
    if (entryLanguage) {
      selectSegment(entryLanguage);
      return;
    }

    const widthChoice = event.target.closest("[data-reading-width] button");
    if (widthChoice) {
      const open = root.querySelector("[data-editing]");
      if (!open) return;
      const chosen = selectSegment(widthChoice);
      setReadingWidthOf(open.dataset.editing, chosen);

      // Only the sentence under the control changes, so only it is rewritten.
      const hint = widthChoice.closest(".field")?.querySelector(".field__hint");
      if (hint) {
        hint.textContent = t(
          "setting.readingHint",
          READING_WIDTHS.find((width) => width.id === chosen)?.characters ?? null,
        );
      }
      return;
    }

    // The language buttons only mark a choice, and marking it is a state change
    // like any other, so the pill travels to it. Nothing is applied until the
    // card is saved, which is what makes Cancel mean something.
    const languageChoice = event.target.closest("[data-account-language] button");
    if (languageChoice) {
      selectSegment(languageChoice);
      return;
    }

    const block = event.target.closest("[data-block]");
    if (block) {
      rerender(currentArea(), null, block.dataset.block, false);
      return;
    }

    const row = event.target.closest("[data-entry]");
    if (row) rerender(currentArea(), Number(row.dataset.entry), null, false);
  });

  // Escape belongs on the document: a key event travels from whatever has focus
  // up to the document, so a listener on the view only hears it whilst focus is
  // inside the view. The previous one is removed first, or every re-render would
  // leave another behind.
  document.removeEventListener("keydown", activeEscapeHandler);
  activeEscapeHandler = (event) => {
    if (event.key !== "Escape") return;
    if (!root.querySelector("[data-account-overlay]")) return;
    rerender(currentArea(), null, null, false);
  };
  document.addEventListener("keydown", activeEscapeHandler);

  // A row is a link in everything but name, so the keyboard has to reach it too.
  root.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest("[data-entry]");
    if (!row) return;
    event.preventDefault();
    rerender(currentArea(), Number(row.dataset.entry), null, false);
  });

  const workbench = root.querySelector(".workbench");
  if (workbench) {
    applyStoredSidebarWidth(workbench);
    wireSidebarResize(workbench);
    wireSectionReorder(workbench, () => rerender(workbench.dataset.area, null, null, false));
  }
}

/**
 * Lets the sidebar groups be dragged into another order.
 *
 * Pointer driven rather than HTML5 drag and drop, because the groups have to
 * move out of the way of the one being dragged, and a drag image plus dragover
 * cannot do that smoothly.
 *
 * Everything that can be measured is measured once, when the drag starts. Per
 * frame the only work is writing a transform on each group, which keeps the
 * whole gesture on the compositor.
 */
function wireSectionReorder(workbench, onReorder) {
  const aside = workbench.querySelector(".sidebar");

  // The outline that shows where the group will land. One element, reused for
  // every drag, so nothing is created whilst a gesture is running.
  const slot = document.createElement("div");
  slot.className = "drop-slot";
  slot.setAttribute("aria-hidden", "true");
  workbench.querySelector(".sidebar__body").append(slot);

  aside.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest("[data-section-handle]");
    if (!handle) return;
    const dragged = handle.closest("[data-section]");
    if (!dragged) return;
    event.preventDefault();

    const groups = [...aside.querySelectorAll(".sidebar__body [data-section]")];
    // One read of the layout, before anything moves. Reading a rect again whilst
    // dragging would measure the transform we just wrote and feed it back in.
    const asideBox = aside.getBoundingClientRect();
    const boxes = groups.map((group) => group.getBoundingClientRect());
    const heights = boxes.map((box, index) => {
      const next = boxes[index + 1];
      return next ? next.top - box.top : box.height;
    });
    const from = groups.indexOf(dragged);
    const originY = event.clientY;
    let to = from;

    handle.setPointerCapture(event.pointerId);
    workbench.setAttribute("data-reordering", "");
    dragged.setAttribute("data-dragging", "");

    slot.style.height = `${boxes[from].height}px`;
    slot.toggleAttribute("data-visible", true);

    /**
     * Where the gap opens for a given target index, in the sidebar's own
     * coordinates. Derived from the measurements taken above rather than read
     * back off the page, which would measure the shift being applied.
     */
    const gapTop = (index) => {
      if (index === from) return boxes[from].top - asideBox.top;
      if (index > from) return boxes[index].top + heights[index] - heights[from] - asideBox.top;
      return boxes[index].top - asideBox.top;
    };

    const place = (index) => {
      for (const [position, group] of groups.entries()) {
        if (group === dragged) continue;
        let shift = 0;
        if (position > from && position <= index) shift = -heights[from];
        if (position < from && position >= index) shift = heights[from];
        group.style.transform = shift ? `translateY(${shift}px)` : "";
      }
      slot.style.transform = `translateY(${gapTop(index)}px)`;
    };

    place(from);

    const onMove = (moveEvent) => {
      const offset = moveEvent.clientY - originY;
      dragged.style.transform = `translateY(${offset}px)`;

      // The swap happens when the dragged group's middle passes the middle of
      // the group it is moving towards, so half of a group has to be covered
      // before the order changes.
      //
      // The comparison is against the neighbour's middle, never against the
      // dragged group's own starting middle: that one is already crossed at the
      // first pixel of travel, which made the target jump as soon as the drag
      // began.
      const middle = boxes[from].top + boxes[from].height / 2 + offset;
      let index = from;
      while (index > 0 && middle < boxes[index - 1].top + boxes[index - 1].height / 2) index -= 1;
      while (index < boxes.length - 1 && middle > boxes[index + 1].top + boxes[index + 1].height / 2) index += 1;
      if (index !== to) {
        to = index;
        place(to);
      }
    };

    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      workbench.removeAttribute("data-reordering");
      dragged.removeAttribute("data-dragging");
      slot.removeAttribute("data-visible");
      for (const group of groups) group.style.transform = "";

      if (to !== from) {
        const labels = groups.map((group) => group.dataset.section);
        labels.splice(to, 0, labels.splice(from, 1)[0]);
        storeSectionOrder(labels);
        onReorder();
      }
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  });
}

/** Where the chosen sidebar width is kept between visits. */
const SIDEBAR_WIDTH_KEY = "layered.dashboard.sidebarWidth";

/** Reads the bounds off the element, so the drag cannot disagree with the CSS. */
const sidebarBounds = (workbench) => {
  const styles = getComputedStyle(workbench);
  return {
    min: Number.parseFloat(styles.getPropertyValue("--sidebar-min")) || 180,
    max: Number.parseFloat(styles.getPropertyValue("--sidebar-max")) || 420,
  };
};

function applyStoredSidebarWidth(workbench) {
  const stored = Number.parseFloat(localStorage.getItem(SIDEBAR_WIDTH_KEY) ?? "");
  if (!Number.isFinite(stored)) return;
  const { min, max } = sidebarBounds(workbench);
  workbench.style.setProperty("--sidebar-width", `${Math.min(Math.max(stored, min), max)}px`);
}

/**
 * Lets the sidebar be dragged wider or narrower, and remembers the result.
 *
 * Only one custom property changes per pointer move, and the grid track reads
 * it, so the browser does the arithmetic rather than script running per frame.
 * The width is written to storage once, on release, because writing on every
 * move would hit storage a hundred times for one gesture.
 */
function wireSidebarResize(workbench) {
  const handle = workbench.querySelector("[data-resize-handle]");
  if (!handle) return;

  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const { min, max } = sidebarBounds(workbench);
    const originX = event.clientX;
    const originWidth = workbench.querySelector(".sidebar").getBoundingClientRect().width;
    let finalWidth = originWidth;

    handle.setPointerCapture(event.pointerId);
    workbench.setAttribute("data-resizing", "");

    const onMove = (moveEvent) => {
      finalWidth = Math.min(Math.max(originWidth + (moveEvent.clientX - originX), min), max);
      workbench.style.setProperty("--sidebar-width", `${finalWidth}px`);
    };

    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      workbench.removeAttribute("data-resizing");
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(finalWidth)));
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  });
}
