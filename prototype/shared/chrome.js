// The site chrome every proposal shares.
//
// Header, search overlay and footer are the same structure and the same class
// names in all three proposals, and only the tokens behind those names differ.
// That is the claim the three prototypes are meant to demonstrate, so it has to
// be true of the code as well: one structure, three appearances.

import { Logo, Shortcut } from "../ui/index.js";
import { each, html } from "./markup.js";
import { FOOTER_NAVIGATIONS, NAVIGATION, published, SOCIAL_ACCOUNTS } from "./proto.js";


/**
 * A brand mark.
 *
 * Applied as a CSS mask rather than as an image, so the mark takes the colour of
 * whatever it sits on, exactly as an icon font would, and the downloaded file
 * stays untouched.
 */
export const brandMark = (brand) =>
  html`<span class="brand-mark" style="--brand: url('../assets/brands/${brand}.svg')" aria-hidden="true"></span>`;

/**
 * The social accounts, shown as icons only.
 *
 * They sit apart from the footer navigation, because a list of pages and a list
 * of accounts are two different things and a row that holds both reads as
 * neither.
 */
export const socialRow = () => html`
  <ul class="social-row" aria-label="Social-Media-Konten">
    ${each(
      SOCIAL_ACCOUNTS,
      (account) => html`
        <li>
          <a class="social-row__link" href="${account.url}" rel="me noopener" title="${account.platform}">
            ${brandMark(account.brand)}
            <span class="visually-hidden">${account.platform}</span>
          </a>
        </li>
      `,
    )}
  </ul>
`;

/**
 * The site header.
 *
 * @param language    Which navigation to show, "en" or "de".
 * @param current     The id of the navigation entry that should read as current,
 *                    or nothing on a page that is in none of them.
 * @param translation Where the other language leads for the page being looked
 *                    at. Omitted on pages that are not a single entry.
 */
export const siteHeader = ({ language = "en", current = "home", translation } = {}) => html`
  <header class="site-header">
    <div class="page site-header__row">
      ${Logo()}
      <nav class="site-nav" aria-label="Hauptnavigation">
        ${each(
          NAVIGATION[language],
          (item) => html`
            <a href="#/${item.view}" ${item.id === current ? "data-current" : ""}>${item.label}</a>
          `,
        )}
      </nav>
      <div class="header-tools">
        <button class="search-trigger" type="button" data-search-open-trigger>
          <i class="ph ph-magnifying-glass" aria-hidden="true"></i>
          <span>${language === "de" ? "Suchen" : "Search"}</span>
          ${Shortcut({ key: "K" })}
        </button>
        ${languageSwitch({ language, translation })}
      </div>
    </div>
  </header>
`;

/**
 * The language switch.
 *
 * This is where a translation is offered, rather than in a notice inside the
 * article. A reader who wants the other language looks for the language control,
 * and a site that can hold both languages properly has no reason to interrupt
 * the text to say so.
 *
 * On an entry that has no counterpart the other side is disabled and says why,
 * which is more honest than a switch that silently lands somewhere else.
 */
const languageSwitch = ({ language, translation }) => {
  const other = language === "de" ? "en" : "de";
  const missing = translation === undefined ? null : translation === null;
  return html`
    <div class="lang-switch" role="group" aria-label="Sprache">
      ${each(["en", "de"], (code) => {
        const isCurrent = code === language;
        const unavailable = !isCurrent && missing;
        return html`
          <button
            type="button"
            aria-pressed="${String(isCurrent)}"
            ${unavailable ? "disabled" : ""}
            title="${unavailable
              ? code === "de"
                ? "Dieser Beitrag liegt nicht auf Deutsch vor"
                : "This entry is not available in English"
              : code === "de"
                ? "Deutsch"
                : "English"}"
          >
            ${code.toUpperCase()}
          </button>
        `;
      })}
    </div>
  `;
};

/**
 * The search overlay.
 *
 * Results are real entries filtered by a fixed query, so the overlay shows what
 * the site actually holds rather than invented rows.
 */
export const searchOverlay = ({ query = "next" } = {}) => {
  const matches = published
    .filter((entry) => entry.title.toLowerCase().includes(query))
    .slice(0, 5);
  return html`
    <div class="search-overlay" data-search-overlay role="dialog" aria-label="Suche">
      <div class="search-overlay__panel">
        <input class="input" type="search" value="${query}" placeholder="Beiträge und Projekte durchsuchen" />
        <div class="search-overlay__results">
          ${each(
            matches,
            (entry) => html`
              <a class="search-result" href="#/${entry.kind === "page" ? "project" : "post"}">
                <span class="lang-tag" data-language="${entry.language}">${entry.language}</span>
                <span class="search-result__title">${entry.title}</span>
                <span class="search-result__kind">${entry.kind === "page" ? "Projekt" : "Beitrag"}</span>
              </a>
            `,
          )}
        </div>
      </div>
    </div>
  `;
};

/** The site footer. */
export const siteFooter = ({ language = "en" } = {}) => html`
  <footer class="site-footer">
    <div class="page site-footer__row">
      <div class="site-footer__brand">
        ${Logo({ inkHeight: "34px" })}
        <p class="site-footer__note">
          ${language === "de"
            ? "Hardware, Software und was dazwischen liegt. Aus Bregenz."
            : "Hardware, software, and what sits between them. Made in Bregenz."}
        </p>
        ${socialRow()}
      </div>
      <div class="footer-navs">
        ${each(
          FOOTER_NAVIGATIONS[language],
          (navigation) => html`
            <nav class="footer-nav" aria-label="${navigation.title}">
              <p class="footer-nav__title">${navigation.title}</p>
              <ul>
                ${each(navigation.items, (label) => html`<li><a href="#/home">${label}</a></li>`)}
              </ul>
            </nav>
          `,
        )}
      </div>
    </div>
    <div class="page site-footer__baseline">
      <span>© ${new Date().getFullYear()} Frank Gregor</span>
      <span>${language === "de" ? "Gebaut in Bregenz, Vorarlberg" : "Built in Bregenz, Austria"}</span>
    </div>
  </footer>
`;
