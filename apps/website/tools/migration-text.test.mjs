import assert from "node:assert/strict";
import { test } from "node:test";
import { Window } from "happy-dom";
import { visibleText, wordRuns, words } from "./migration-text.mjs";

/** Parses markup into a document whose scripts never run. */
function parse(html) {
  const window = new Window({ settings: { disableJavaScriptEvaluation: true } });
  return new window.DOMParser().parseFromString(`<body>${html}</body>`, "text/html").body;
}

test("inline markup does not split a word, and a block boundary does", () => {
  const text = visibleText(parse("<p><em>NeXT</em>step</p><p>Second</p>"));
  assert.deepEqual(words(text), ["NeXTstep", "Second"]);
});

test("scripts, styles and drawings are not text", () => {
  const text = visibleText(
    parse("<p>Kept</p><script>dropped()</script><style>p{}</style><svg><title>x</title></svg>"),
  );
  assert.deepEqual(words(text), ["Kept"]);
});

test("a non-breaking space separates words like any other", () => {
  assert.deepEqual(words("one\u00A0two\u200Bthree"), ["one", "twothree"]);
});

test("curled quotation marks read as the straight ones they were typed as", () => {
  assert.deepEqual(words("Apple\u2019s \u201CNext\u201D"), ["Apple's", '"Next"']);
});

test("an element the caller names as furniture is not text", () => {
  const root = parse('<p>Kept</p><pre aria-hidden="true">1 2 3</pre>');
  const text = visibleText(root, (element) => element.getAttribute("aria-hidden") === "true");
  assert.deepEqual(words(text), ["Kept"]);
});

test("identical texts have no runs", () => {
  assert.deepEqual(wordRuns(["a", "b"], ["a", "b"]), []);
});

test("a lost paragraph is one missing run", () => {
  const runs = wordRuns(["a", "lost", "words", "b"], ["a", "b"]);
  assert.deepEqual(runs, [{ kind: "missing", words: ["lost", "words"] }]);
});

test("a changed word is one run each way", () => {
  const runs = wordRuns(["a", "old", "b"], ["a", "new", "b"]);
  assert.deepEqual(
    runs.map((run) => [run.kind, run.words.join(" ")]),
    [
      ["missing", "old"],
      ["added", "new"],
    ],
  );
});
