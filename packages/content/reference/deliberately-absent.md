The vocabulary above is the whole language. These are the things it does not have, and why.

**No logic.** No conditions, no loops, no variables, no expressions. A document says what is on the page, and that is all it says. Anything that decides what is on a page belongs in the code that renders it, where it can be read and tested.

**No styling arguments.** A component takes a step of a scale, a tone, or a number of columns, and never a colour, a pixel measurement, or a class name. Authors compose; they do not restyle. That is the line between this and putting HTML in a body, and it is what keeps the site looking like one site.

**Not MDX.** MDX turns content into code: a typo becomes a build failure, arbitrary JavaScript can be written in from wherever the content is edited, and checking a document would need a JSX parser. This grammar is a closed vocabulary with three forms, and it is small on purpose.

**No component nobody has asked for.** The register above is what exists. Adding to it is one entry in one file, and everything reads from there.
