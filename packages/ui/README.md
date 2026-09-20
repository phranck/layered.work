# Shared UI

React compounds shared by the website and the editorial dashboard. The markup and stylesheet rules come from `prototype/ui/`; component styles keep the existing token scopes and import order.

```tsx
import { Card, Row, Section } from "@layered/ui";
import "@layered/tokens/index.css";
import "@layered/ui/base.css";
import "@layered/ui/index.css";

<Section>
  <Section.Title title="Entries" />
  <Section.Body>
    <Card>
      <Card.Header title="Drafts" />
      <Card.Body>
        <Row>
          <Row.Text title="A new entry" note="Draft" />
        </Row>
      </Card.Body>
    </Card>
  </Section.Body>
</Section>;
```

`base.css` is an optional document reset and foundation. `index.css` contains the component styles. The `.workbench` scope supplied by the token package changes density without replacing components.

The package exports Button, Card, Choice, Editor, Field, Input, Logo, Row, RowList, Section, Segmented, Select, Shortcut, Sidebar and Switch. Parts use uppercase JSX names such as `Card.Body`, `Button.Link` and `Editor.Panel`. Native attributes and React event handlers belong on the component directly; text is rendered as React content, never as raw HTML.

Switch, Segmented and Choice are controlled: the caller owns the selected value and applies the change callback. Choice options compose through `Choice.Option`. Shortcut accepts an explicit platform so the server and browser render the same label. Logo uses the original SVG through its `src` prop, defaulting to `/logo.svg`. Its `inkHeight` prop accepts either a numeric pixel value or a CSS length and derives `--logo-height` on the component instance. The derivation uses the original SVG's measured ink-to-viewBox ratios: 0.489 for height and 0.824 for width.

The Astro website server-renders static compounds with its React integration and no client directive. The Vite dashboard renders the same compounds in its React application, with React Router providing navigation.

The prototype's design values remain intact. Logo derives `--logo-height` at component scope so each instance can request its own optical ink height. React and React DOM are MIT-licensed dependencies, with their license notices distributed in their packages.

## Shared assets

`assets/` holds the original logo, shared WOFF2 files, their `fonts.css` declarations and licence notices. Application build scripts call `copyUiAssets(publicRoot)` from `@layered/ui/copy-assets`, then link to the assets on their own host. Website development and builds populate `public/` automatically; those copies are generated and not committed. The dashboard copies the same assets directly into `dist/`.

Barlow and Barlow Condensed provide the design token weights. FiraCode Nerd Font supplies code text and ligatures, with patched symbols in a separate subset loaded only when needed. All faces use `font-display: swap`. The website preloads Barlow 400 and Barlow Condensed 700; other faces remain lazy.

Source revisions, licences and the regeneration command are recorded in [the font notices](assets/THIRD_PARTY_NOTICES.md).

## Icons

Import interface components from `@layered/ui/icons`, for example `MagnifyingGlassIcon`, `PlusIcon` and `SquaresFourIcon`. These are direct Phosphor React exports, with `size`, `weight` and `color` props. Their default `1em` size follows existing component tokens: a `Row.Lead` uses 17 px in the sidebar and 19 px in workbench content. Add explicit Phosphor submodule exports when screens need more icons; do not copy SVG paths or load an icon stylesheet.

`BrandMark` is separate: `<BrandMark brand="github" />` renders a decorative CSS mask from the unchanged Simple Icons asset. The surrounding social link supplies the accessible name and text colour. Only Mastodon, GitHub, YouTube, Instagram and Xing ship. CSS rules choose same-origin masks without inline styles, so the strict dashboard policy also permits them.

See [icon notices](assets/ICON_NOTICES.md) for pinned sources, licences and the steps for adding a social brand.
