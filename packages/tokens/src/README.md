# Design tokens

The token system for layered.work, in four layers. The stylesheets are the source: nothing outside this directory restates a value, and what TypeScript needs is derived from them by `scripts/derive.mjs`, which the build runs.

It came here from `prototype/tokens/` unchanged, which is why the prototype still has its own copy and why the two should be compared rather than edited apart. The prototype is a design study; this is the package that ships.

## Using it

Import the one file and the whole system is in force.

```css
@import "@layered/tokens/index.css";
```

A single stylesheet can be reached on its own where that is genuinely wanted, as `@layered/tokens/scale.css`, but the four are ordered and `index.css` is what puts them in the right order.

## What TypeScript gets

Only what has to be a closed set somewhere else. Today that is the steps of the space scale, which the content language's register offers as the permitted values for `spacing`. The pixel values are deliberately not exported: what a step is worth is this directory's business, and a component that knew it would be a component that could be wrong about it.

`src/generated/scales.ts` is written by the derivation and committed, so a type check works without a build. The gate regenerates it and refuses a tree that changed, which is what makes a stale copy a failure rather than a surprise.

Without a bundler, link `index.css` and the `@import` chain inside it resolves. With a bundler, the chain is inlined and the four files cost nothing extra.

## The four layers

`scale.css` holds every stepped series and not one colour: the thirteen lightness steps of the neutral ramp, the type scale, the space scale, the two chosen card numbers, the control radii and the motion values. These are chosen.

`palettes.css` holds the colour worlds. A palette supplies exactly four things: the chroma and hue of the neutral ramp, the five accent steps, the colour of text sitting on the accent, and the four status colours. These are chosen.

`semantic.css` holds what follows from the two above and nothing that was chosen: the ramp itself, the surfaces, the text colours, the scrims, the sheen, the emboss, the derived radii and the elevation set. This is the layer components read.

`workbench.css` holds the dashboard's density, scoped to `.workbench`. It overrides no colours and no shapes, because the dashboard takes those from the site; it states the spacing steps, the control height, the workbench card geometry and, for the content area, a type size two pixels above the site's. These are properties of the task rather than of the design.

## The one rule

**A component names a semantic token, never a colour, never a step of a ramp, never a literal.**

That is what makes switching palettes a change to one attribute, and it is the only rule that has to hold for the rest of the system to keep working. A component that reaches for `--ink-900` instead of `--surface-raised` still renders, and then stops following the design the first time a surface moves.

## A second palette

There is one palette, and nothing in the project names a colour outside it. Should a second one ever be wanted, it goes into `palettes.css` as a block of its own keyed by `data-palette` on the root element, with the same four groups as the existing one, and the bare `:root` block stays the default. Apply a stored choice before the first paint, or the page shows one palette for a frame and swaps it after it has already been read. Before settling on an accent, check that the text colour you intend to put on it clears 4.5:1 against the step a filled control sits on.

## Two traps worth knowing

**A custom property containing `var()` resolves on the element where it is declared.** What descendants inherit is the finished value, not the formula. An element that changes one input of a derivation has to restate the derivation with it, or nothing happens. That is why `--card-inner-radius` is restated in `workbench.css` and why a filled button restates `--text-emboss` beside the shade it changes.

**A property declared at the root that points at a derivation declared further down resolves to nothing.** Not to a fallback, to empty. Every derivation in this system therefore lives on `:root`, beside the values that reference it.

## Third-party material

The brand marks in `assets/brands/` come from [Simple Icons](https://simpleicons.org) 15.16.0 under CC0-1.0. No attribution is required, but the third-party notices should record it. They are deliberately separate from the interface icon set, because no general icon family carries every logo.
