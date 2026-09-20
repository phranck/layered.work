// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Button,
  Card,
  Choice,
  Editor,
  Field,
  Input,
  Logo,
  Row,
  RowList,
  Section,
  Segmented,
  Select,
  Shortcut,
  Sidebar,
  Switch,
} from "./index.js";

afterEach(cleanup);

describe("static compounds", () => {
  it("server-renders composed card, row and section markup and escapes content", () => {
    const markup = renderToStaticMarkup(
      <Section.Page data-page="home">
        <Section.Title title={<>News &lt;script&gt;</>} actions={<Button icon={<b>+</b>}>Add</Button>} />
        <Section.Body>
          <Card>
            <Card.Header title={<span>Card</span>} meta="2" />
            <Card.Body>
              <Row data-row="one">
                <Row.Text title={'A "safe" row'} note="Note" />
              </Row>
            </Card.Body>
            <Card.Footer note="Done">Footer child</Card.Footer>
          </Card>
        </Section.Body>
      </Section.Page>,
    );

    expect(markup).toContain('class="section section--page"');
    expect(markup).toContain('class="card__body"');
    expect(markup).toContain('data-row="one"');
    expect(markup).toContain("News &lt;script&gt;");
    expect(markup).not.toContain("<script>");
  });

  it("renders every structural compound part with prototype class names", () => {
    const markup = renderToStaticMarkup(
      <>
        <Button.Link href="/go" icon={<i />}>
          Go
        </Button.Link>
        <Button.Icon label="Edit" icon={<i />} />
        <Button.Inert>Read</Button.Inert>
        <Card.Link href="/card">
          <Card.Media src="/photo.jpg" alt="Photo" ratio="4 / 3" />
          <Card.Caption>Caption</Card.Caption>
          <Card.Stack>Stack</Card.Stack>
        </Card.Link>
        <RowList.Divided>
          <Row.Button>
            <Row.Lead>L</Row.Lead>
            <Row.Tile>T</Row.Tile>
            <Row.Grip>G</Row.Grip>
            <Row.Meta>M</Row.Meta>
            <Row.Actions>A</Row.Actions>
          </Row.Button>
          <Row.Link href="/row">Link</Row.Link>
          <Row.Bare>Bare</Row.Bare>
        </RowList.Divided>
        <Section>
          <Section.Lead title="Lead" />
          <Section.Grid>Grid</Section.Grid>
          <Section.Stack>Stack</Section.Stack>
        </Section>
        <Sidebar>
          <Sidebar.Header>H</Sidebar.Header>
          <Sidebar.Body>B</Sidebar.Body>
          <Sidebar.Footer>F</Sidebar.Footer>
          <Sidebar.Handle aria-label="Resize" />
        </Sidebar>
        <Editor>
          <Editor.Main>
            <Editor.Toolbar
              groups={[
                [<Editor.Tool key="b" label="Bold" />],
                [<Editor.Tool key="i" label="Italic" icon={<i />} />],
              ]}
            />
            <Editor.Surface>S</Editor.Surface>
            <Editor.Actions destructive="Delete">Save</Editor.Actions>
          </Editor.Main>
          <Editor.Panel title="Panel">Fields</Editor.Panel>
        </Editor>
      </>,
    );

    for (const className of [
      "button--icon",
      "card--interactive",
      "card__media",
      "row-list--divided",
      "row--bare",
      "section__body--grid",
      "sidebar__handle",
      "editor__divider",
      "editor__panel",
    ]) {
      expect(markup).toContain(className);
    }
  });

  it("forwards native props and refs", () => {
    const ref = createRef<HTMLButtonElement>();
    const onClick = vi.fn();
    render(
      <Button ref={ref} name="save" disabled onClick={onClick}>
        Save
      </Button>,
    );
    expect(ref.current).toBe(screen.getByRole("button", { name: "Save" }));
    expect(ref.current?.disabled).toBe(true);
    expect(ref.current?.getAttribute("name")).toBe("save");
  });
});

describe("controlled form components", () => {
  it("renders labelled native input and select values", () => {
    const onInput = vi.fn();
    const onSelect = vi.fn();
    render(
      <>
        <Field label="Name" hint="Public" htmlFor="name">
          <Input id="name" value="Ada" onChange={onInput} />
        </Field>
        <Field label="Role" htmlFor="role">
          <Select
            id="role"
            aria-label="Role"
            value="editor"
            onChange={onSelect}
            options={[
              { value: "reader", label: "Reader" },
              { value: "editor", label: "Editor" },
            ]}
          />
        </Field>
      </>,
    );
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Grace" } });
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "reader" } });
    expect(onInput).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("forwards disabled state to native select options", () => {
    render(
      <Select
        aria-label="Role"
        value="editor"
        onChange={() => undefined}
        options={[
          { value: "reader", label: "Reader", disabled: true },
          { value: "editor", label: "Editor" },
        ]}
      />,
    );
    expect((screen.getByRole("option", { name: "Reader" }) as HTMLOptionElement).disabled).toBe(true);
  });

  it("keeps inline field-only props off the div and associates its label", () => {
    const { container } = render(
      <Field.Inline label="Published" hint="Visible to everyone" htmlFor="published">
        <Switch id="published" checked={false} aria-label="Published" onCheckedChange={() => undefined} />
      </Field.Inline>,
    );
    expect(container.querySelector(".field")?.hasAttribute("hint")).toBe(false);
    expect(container.querySelector(".field")?.hasAttribute("htmlfor")).toBe(false);
    expect(container.querySelector("label")?.htmlFor).toBe("published");
    expect(container.querySelector(".field__hint")?.textContent).toBe("Visible to everyone");
  });

  it("switch delegates native button activation without mutating controlled state", () => {
    const onCheckedChange = vi.fn();
    const { rerender } = render(
      <Field.Inline label="Published">
        <Switch checked={false} aria-label="Published" onCheckedChange={onCheckedChange} />
      </Field.Inline>,
    );
    const control = screen.getByRole("switch", { name: "Published" });
    fireEvent.click(control);
    expect(onCheckedChange).toHaveBeenNthCalledWith(1, true);
    expect(control.getAttribute("aria-checked")).toBe("false");
    rerender(
      <Field.Inline label="Published">
        <Switch checked aria-label="Published" onCheckedChange={onCheckedChange} />
      </Field.Inline>,
    );
    expect(control.getAttribute("aria-checked")).toBe("true");
  });

  it("segmented and choice expose controlled selection and keyboard navigation", () => {
    const onSegment = vi.fn();
    const onChoice = vi.fn();
    render(
      <>
        <Segmented
          aria-label="View"
          value="list"
          onValueChange={onSegment}
          options={[
            { value: "list", label: "List" },
            { value: "grid", label: "Grid" },
          ]}
        />
        <Choice aria-label="Status" value="draft" onValueChange={onChoice}>
          <Choice.Option value="draft" label="Draft" />
          <Choice.Option value="public" label="Public" note="Everyone can see it" tone="success" />
        </Choice>
      </>,
    );
    const list = screen.getByRole("button", { name: "List" });
    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(onSegment).toHaveBeenCalledWith("grid");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Grid" }));
    const draft = screen.getByRole("radio", { name: "Draft" });
    fireEvent.keyDown(draft, { key: "End" });
    expect(onChoice).toHaveBeenCalledWith("public");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: /Public/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Public/ }));
    expect(onChoice).toHaveBeenLastCalledWith("public");
  });

  it("keeps a fallback option tabbable and skips disabled radio options", () => {
    const onSegment = vi.fn();
    const onChoice = vi.fn();
    const Wrapper = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
    render(
      <>
        <Segmented
          aria-label="View"
          value="missing"
          onValueChange={onSegment}
          options={[
            { value: "list", label: "List", disabled: true },
            { value: "grid", label: "Grid" },
          ]}
        />
        <Choice aria-label="Status" value="missing" onValueChange={onChoice}>
          <Fragment key="disabled-options">
            <Choice.Option value="draft" label="Draft" disabled />
            <Choice.Option value="private" label="Private" disabled />
          </Fragment>
          <Wrapper>
            <Choice.Option value="review" label="Review" />
          </Wrapper>
          <Choice.Option value="public" label="Public" tone="danger" />
        </Choice>
      </>,
    );
    const grid = screen.getByRole("button", { name: "Grid" });
    expect(grid.tabIndex).toBe(0);
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    expect(onSegment).toHaveBeenCalledWith("grid");
    const review = screen.getByRole("radio", { name: "Review" });
    expect(review.tabIndex).toBe(0);
    fireEvent.keyDown(review, { key: "ArrowLeft" });
    expect(onChoice).toHaveBeenCalledWith("public");
  });

  it("selects an empty radio value and respects prevented option keyboard events", () => {
    const onValueChange = vi.fn();
    render(
      <Choice aria-label="Status" value="public" onValueChange={onValueChange}>
        <Choice.Option value="" label="Unset" />
        <Choice.Option value="public" label="Public" onKeyDown={(event) => event.preventDefault()} />
      </Choice>,
    );
    const publicOption = screen.getByRole("radio", { name: "Public" });
    publicOption.focus();
    fireEvent.keyDown(publicOption, { key: "Home" });
    expect(onValueChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(publicOption);

    render(
      <Choice aria-label="Visibility" value="public" onValueChange={onValueChange}>
        <Choice.Option value="" label="No visibility" />
        <Choice.Option value="public" label="Visible" />
      </Choice>,
    );
    fireEvent.keyDown(screen.getByRole("radio", { name: "Visible" }), { key: "Home" });
    expect(onValueChange).toHaveBeenCalledWith("");
  });
});

describe("small primitives", () => {
  it("renders Shortcut during SSR without navigator and allows a platform override", () => {
    expect(renderToStaticMarkup(<Shortcut shortcutKey="K" platform="control" />)).toContain("Strg K");
    expect(renderToStaticMarkup(<Shortcut shortcutKey="K" platform="apple" />)).toContain("⌘K");
  });

  it("updates Shortcut when an explicit platform prop changes", () => {
    const { rerender } = render(<Shortcut shortcutKey="K" platform="control" />);
    expect(screen.getByText("Strg K")).toBeTruthy();
    rerender(<Shortcut shortcutKey="K" platform="apple" />);
    expect(screen.getByText("⌘K")).toBeTruthy();
  });

  it("uses a caller supplied logo asset and /logo.svg by default", () => {
    expect(renderToStaticMarkup(<Logo />)).toContain('src="/logo.svg"');
    expect(renderToStaticMarkup(<Logo src="/brand.svg" />)).toContain('src="/brand.svg"');
  });
});
