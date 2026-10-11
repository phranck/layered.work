Markdown covers prose: headings, paragraphs, lists, links, tables and code. It has no syntax for a gallery, a three-dimensional model, two columns, or a note set apart from the text, so this language adds a small vocabulary for those. An author composes a page from the same components the site is built from, rather than pasting markup into it.

## The four rules

**A line that begins with a capitalized name followed by `(` or `{` is a component.** Everything else on the page is Markdown. A line that genuinely starts that way and is meant as prose is escaped with a backslash, as in `\Grid(3) lines were enough.` The backslash keeps the line a sentence and does not appear on the page, which reads `Grid(3) lines were enough.` A backslash anywhere else is Markdown's, which only escapes punctuation.

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

A component has its line to itself. Text after its closing bracket or brace on the same line, or between its arguments and its brace, is refused, and the error points at the first character that does not belong. Put that text on a line of its own.

## Named values

A value defined once in the dashboard is written into running text as `{{ name }}`, where the name is lower case and hyphenated, such as `{{ product-name }}`. The page shows the value's text in its place, so changing the value changes every page that refers to it.

A value is a line of text and nothing more. Whatever it holds reaches the page as written, never as a link, an emphasis or a component.

A reference inside code, or inside a quoted argument such as a caption, stays as written. A reference meant as text is escaped as `\{{ name }}`. A reference to a name no value has is refused before publishing.

A line that begins with a capitalized word followed by a reference, such as `Hello {{ name }}`, is a sentence, because two braces open a reference rather than a body.

## What the Markdown is

GitHub's flavor of it: tables, task lists, struck-out text and bare addresses all work as they do in a repository.

HTML is not. A tag written in a document reaches the page as the characters that were typed, so `<script>alert(1)</script>` appears on the page as that text and runs nothing.

## Texts shorter than a page

A caption, a consent notice, a form's message and the description in the home page's hero are written in the same editor as an entry, but they stand where a sentence stands. So they hold emphasis, strong emphasis, links and line breaks, and nothing else. A heading, a list, a quote, code, a picture or a named value is refused there. A line shaped like a component is a sentence in these texts and needs no backslash.

A caption written as an argument, such as `caption: "The *front*, before painting"`, is drawn the same way, and so are the caption and the cells of a `Table`. Emphasis, strong emphasis and links show as such, and anything else shows as its words.

A mail template's body holds paragraphs, lists, emphasis, strong emphasis, links and the template's placeholders, because that is what a mail client draws. An address is written as a link there, not bare.

A listing's introduction is written in the whole language, like an entry.
