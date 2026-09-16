Markdown covers prose: headings, paragraphs, lists, links, tables and code. It has no syntax for a gallery, a three-dimensional model, two columns, or a note set apart from the text, so this language adds a small vocabulary for those. An author composes a page from the same components the site is built from, rather than pasting markup into it.

## The four rules

**A line that begins with a capitalised name followed by `(` or `{` is a component.** Everything else on the page is Markdown. A line that genuinely starts that way and is meant as prose is escaped with a backslash, as in `\Grid(3) lines were enough.`

**Arguments read as they do in Swift.** The first value may be written without a name, for the principal thing, and everything after it is written as `name: value`. Text goes in quotes, numbers and keywords go bare.

```
Image("front-panel", caption: "The front, before painting")
```

**A body sits between `{` and `}`, and is Markdown again.** It holds headings, paragraphs, lists, and further components.

```
Note(tone: info) {
  The firmware lives on the releases page.
}
```

**Indentation is free.** Whatever the first line of a body is indented by is removed from the whole body before Markdown reads it, so four spaces of indentation do not turn a paragraph into a code block.

## What the parser does with the awkward cases

Fenced code is read before anything else, so a component written inside a fence is an example rather than a component.

Quotation marks separate a value inside an argument list, and nowhere else. Inside a body a quotation mark is a quotation mark, so `He said "look }" and left.` behaves exactly as the same sentence without the quotes. A closing brace that genuinely belongs in a body is escaped as `\}`.

A component may hold another component, to any depth, because a body is Markdown and Markdown is where components are found.

## What the Markdown is

GitHub's flavour of it: tables, task lists, struck-out text and bare addresses all work as they do in a repository.

HTML is not. A tag written in a document reaches the page as the characters that were typed, so `<script>alert(1)</script>` appears on the page as that text and runs nothing.
