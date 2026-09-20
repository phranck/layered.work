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

Switch, Segmented and Choice are controlled: the caller owns the selected value and applies the change callback. Choice options compose through `Choice.Option`. Shortcut accepts an explicit platform so the server and browser render the same label. Logo uses the original SVG through its `src` prop, defaulting to `/logo.svg`.

The Astro website server-renders static compounds with its React integration and no client directive. The current dashboard build renders them to static HTML. Interactive screens can hydrate the same components when those screens are implemented.

The prototype's stylesheet values remain intact; only mechanical formatting changes. React and React DOM are MIT-licensed dependencies, with their license notices distributed in their packages.
