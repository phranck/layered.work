// The design token documentation, shared by all three proposals.
//
// The values are read out of the stylesheet that is actually in force rather
// than written down a second time. A documentation page that keeps its own copy
// of the palette is a second answer to the same question, and it starts
// disagreeing with the first the day somebody changes a colour. This one cannot
// disagree, because there is nothing to keep in step.

import { siteFooter } from "./chrome.js";
import { each, html } from "./markup.js";

/**
 * Reads every custom property declared on `:root` by this document's own
 * stylesheets, in declaration order.
 *
 * Cross-origin sheets throw on `cssRules` and are skipped, which is only the
 * webfont sheet here.
 */
function declaredTokens() {
  const found = new Map();
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    collectFrom(rules, found);
  }
  return found;
}

function collectFrom(rules, found) {
  for (const rule of rules) {
    // An @import keeps its rules on `styleSheet`, never on `cssRules`.
    if (rule.styleSheet) {
      collectFrom(rule.styleSheet.cssRules, found);
      continue;
    }
    if (rule.selectorText === ":root") {
      for (const property of rule.style) {
        if (property.startsWith("--")) found.set(property, rule.style.getPropertyValue(property).trim());
      }
    }
    // Since CSS nesting, every style rule carries a `cssRules` list of its own,
    // empty but truthy. Testing the object rather than its length treats every
    // rule as a container and collects nothing at all.
    if (rule.cssRules?.length) collectFrom(rule.cssRules, found);
  }
}

/** The computed value, which is what the page actually renders. */
const computed = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const isColour = (value) => /^(#|rgb|hsl|oklab|oklch|color-mix)/.test(value);
const isLength = (value) => /^-?[\d.]+(px|rem|em|ch)$|^(clamp|calc|max|min)\(/.test(value);
const isDuration = (value) => /^[\d.]+m?s$/.test(value);
const isShadow = (value) => value.includes("px") && value.split(",").length > 1 && !value.startsWith("clamp");
const isFont = (value) => /sans-serif|monospace|system-ui/.test(value);

/**
 * Groups tokens for display.
 *
 * A group is a heading plus a test. The first group whose test matches takes the
 * token, so order decides, and anything unclaimed falls into the last group
 * rather than disappearing from the page.
 */
const GROUPS = [
  {
    title: "Farbe",
    note: "Jeder Farbwert der Oberfläche steht hier. Keine Komponente nennt eine eigene Farbe.",
    matches: (name, value) => isColour(value),
    render: (name, value) => html`
      <div class="swatch card">
        <div class="swatch__chip" style="--swatch: var(${name})"></div>
        <div class="swatch__name">${name}</div>
        <div class="swatch__value">${computed(name) || value}</div>
      </div>
    `,
    wrapper: "swatch-grid",
  },
  {
    title: "Schrift",
    note: "Zwei Familien. Code behält seinen eigenen Grad, weil Code in der Größe gelesen wird, in der er geschrieben ist.",
    matches: (name, value) => isFont(value),
    render: (name, value) => html`
      <div class="scale-row">
        <span class="scale-row__name">${name}</span>
        <span class="scale-row__sample" style="font-family: var(${name}); font-weight: 500">
          Hardware, Software und was dazwischen liegt
        </span>
      </div>
    `,
    wrapper: "stack",
  },
  {
    title: "Typografische Skala",
    note: "Fließend zwischen zwei Grenzen. Der Fließtext ist die Referenz, an der die übrigen Grade gemessen sind.",
    matches: (name) => name.startsWith("--text-") && !name.includes("primary") && !name.includes("secondary") && !name.includes("muted") && !name.includes("faint") && !name.includes("accent") && !name.includes("on-accent"),
    render: (name) => html`
      <div class="scale-row">
        <span class="scale-row__name">${name}</span>
        <span class="scale-row__sample" style="font-size: var(${name})">LAYERED.work</span>
        <span class="swatch__value" style="margin-inline-start: auto">${computed(name)}</span>
      </div>
    `,
    wrapper: "stack",
  },
  {
    title: "Abstand",
    note: "Eine Reihe auf Vierer-Basis. Gaps und Paddings greifen ausschließlich hierauf zu.",
    matches: (name, value) => name.startsWith("--space-") && isLength(value),
    render: (name) => html`
      <div class="space-row">
        <span class="scale-row__name">${name}</span>
        <span class="space-row__bar" style="width: var(${name})"></span>
        <span class="swatch__value">${computed(name)}</span>
      </div>
    `,
    wrapper: "stack",
  },
  {
    title: "Maße und Radien",
    note: "Nur die fett gesetzten Werte sind gewählt. Alles übrige ist daraus gerechnet und bewegt sich mit, sobald einer davon sich ändert.",
    matches: (name, value) => isLength(value),
    render: (name, value) => html`
      <div class="space-row">
        <span class="scale-row__name">${name}</span>
        <span class="swatch__value" style="flex: 1">${value.includes("var(") || value.includes("calc") ? value : ""}</span>
        <span class="swatch__value numeric">${computed(name)}</span>
      </div>
    `,
    wrapper: "stack",
  },
  {
    title: "Höhe",
    note: "Kantenlicht und Schatten gehören zusammen, weil sie zwei Hälften derselben Aussage über die Höhe einer Fläche sind.",
    matches: (name, value) => isShadow(value),
    render: (name) => html`
      <div class="card" style="box-shadow: var(${name}); padding: var(--space-5)">
        <span class="swatch__name">${name}</span>
      </div>
    `,
    wrapper: "grid grid--cards",
  },
  {
    title: "Bewegung",
    note: "Zeigen, nicht beschreiben: über eine Zeile fahren, um die Dauer zu sehen.",
    matches: (name, value) => isDuration(value),
    render: (name) => html`
      <div class="motion-demo card" style="--motion-duration: var(${name})">
        <span class="motion-demo__box"></span>
        <span class="scale-row__name">${name}</span>
        <span class="swatch__value numeric" style="margin-inline-start: auto">${computed(name)}</span>
      </div>
    `,
    wrapper: "stack",
  },
  {
    title: "Weitere",
    note: "Gewichte, Zeilenhöhen, Laufweiten und Kurven.",
    matches: () => true,
    render: (name, value) => html`
      <div class="space-row">
        <span class="scale-row__name">${name}</span>
        <span class="swatch__value">${value}</span>
      </div>
    `,
    wrapper: "stack",
  },
];

/**
 * Renders the token documentation.
 *
 * @param header Site chrome, placed above the main region.
 * @param intro  Markup shown above the groups, where the design says what its
 *               idea is.
 */
export function tokensView({ header, intro } = {}) {
  const tokens = declaredTokens();
  const buckets = GROUPS.map((group) => ({ group, entries: [] }));

  for (const [name, value] of tokens) {
    const bucket = buckets.find(({ group }) => group.matches(name, value));
    bucket?.entries.push([name, value]);
  }

  return html`
    ${header}
    <main>
      <div class="page stack" style="gap: var(--section-gap); padding-block: var(--space-8)">
        ${intro}
        ${each(
          buckets.filter(({ entries }) => entries.length > 0),
          ({ group, entries }) => html`
            <section class="token-section" data-reveal>
              <div class="section-head__copy">
                <p class="eyebrow">${group.title}</p>
                <p class="lede" style="font-size: var(--text-base)">${group.note}</p>
              </div>
              <div class="${group.wrapper}">
                ${each(entries, ([name, value]) => group.render(name, value))}
              </div>
            </section>
          `,
        )}
      </div>
    </main>
    ${siteFooter()}
  `;
}
