/**
 * The text a reader sees in a piece of markup, and the difference between two
 * such texts as runs of words.
 *
 * `verify-migration.mjs` uses both to compare an old Publii page with the page
 * this site renders for the same entry. Kept apart from that script so the two
 * can be tested without a build.
 */

/** Elements whose content is not read as text: code that runs, styling, and drawings. */
const SILENT = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "SVG"]);

/**
 * Elements that start a new line of text.
 *
 * Adjacent text nodes are joined without a space, because `<em>NeXT</em>step`
 * is one word. Two paragraphs are not, so a block boundary inserts one.
 */
const BLOCK = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "BR",
  "DD",
  "DETAILS",
  "DIV",
  "DL",
  "DT",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "SUMMARY",
  "TABLE",
  "TD",
  "TH",
  "TR",
  "UL",
]);

/**
 * The visible text below an element, as one string.
 *
 * @param root - A DOM element, from any implementation that offers `childNodes`.
 * @param skip - Elements whose text is the page's furniture rather than the
 *   entry's, such as a code block's line numbers. Nothing is skipped by default.
 * @returns The text, with block boundaries as spaces.
 */
export function visibleText(root, skip = () => false) {
  const parts = [];
  const walk = (node) => {
    if (node.nodeType === 3) {
      parts.push(node.textContent);
      return;
    }
    if (node.nodeType !== 1) return;
    const name = node.tagName.toUpperCase();
    if (SILENT.has(name) || skip(node)) return;
    const block = BLOCK.has(name);
    if (block) parts.push(" ");
    for (const child of node.childNodes) walk(child);
    if (block) parts.push(" ");
  };
  walk(root);
  return parts.join("");
}

/**
 * A text as the words a comparison looks at.
 *
 * Unicode compatibility forms are folded and invisible characters removed, so
 * a non-breaking space and an ordinary one are the same gap. Typographic
 * quotation marks become straight ones, because Publii curled the straight
 * marks its authors typed whilst rendering, so the curl is the old renderer's
 * and not a difference in what was written. Nothing else is changed.
 *
 * @param text - Any text.
 * @returns Its words, in order.
 */
export function words(text) {
  return text
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * The difference between two word lists, as runs.
 *
 * A longest common subsequence over words, so a paragraph that moved shows as
 * one run missing and one added rather than as noise across the page. The table
 * is quadratic, which is fine for an article and would not be for a book.
 *
 * @param before - The old text's words.
 * @param after - The new text's words.
 * @returns Every run of words present on one side only, in reading order.
 */
export function wordRuns(before, after) {
  const width = after.length + 1;
  const table = new Uint32Array((before.length + 1) * width);
  for (let row = before.length - 1; row >= 0; row--) {
    for (let column = after.length - 1; column >= 0; column--) {
      table[row * width + column] =
        before[row] === after[column]
          ? table[(row + 1) * width + column + 1] + 1
          : Math.max(table[(row + 1) * width + column], table[row * width + column + 1]);
    }
  }

  const runs = [];
  const push = (kind, word) => {
    const last = runs.at(-1);
    if (last?.kind === kind && last.open) last.words.push(word);
    else runs.push({ kind, words: [word], open: true });
  };
  const close = () => {
    for (const run of runs) run.open = false;
  };

  let row = 0;
  let column = 0;
  while (row < before.length || column < after.length) {
    if (row < before.length && column < after.length && before[row] === after[column]) {
      close();
      row++;
      column++;
    } else if (
      column >= after.length ||
      (row < before.length && table[(row + 1) * width + column] >= table[row * width + column + 1])
    ) {
      push("missing", before[row++]);
    } else {
      push("added", after[column++]);
    }
  }
  return runs.map(({ kind, words: runWords }) => ({ kind, words: runWords }));
}
