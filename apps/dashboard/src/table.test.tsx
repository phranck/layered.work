import { Button, Switch } from "@layered/ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Table } from "./table.js";

afterEach(cleanup);

/** Two rows that open, one static row, and one button in an action cell. */
function draw(open: (name: string) => void, act: () => void) {
  render(
    <Table
      columns={[
        { kind: "title", label: "Title" },
        { kind: "date", label: "Date" },
        { kind: "action", label: "Action", actions: 2 },
      ]}
    >
      {["First", "Second"].map((name) => (
        <Table.Row key={name} onOpen={() => open(name)}>
          <Table.Cell kind="title">
            <Table.Title title={name} />
          </Table.Cell>
          <Table.Cell kind="date">1 Oct</Table.Cell>
          <Table.Actions>
            <Button.Icon label={`Act on ${name}`} icon={<span />} onClick={act} />
          </Table.Actions>
        </Table.Row>
      ))}
      <Table.Row>
        <Table.Cell kind="title">Static</Table.Cell>
      </Table.Row>
    </Table>,
  );
}

/** Three rows ordered by hand, each with a grip and a switch, that open on a click. */
function drawOrdered(move: (from: number, to: number) => void, open: () => void, toggle: () => void) {
  render(
    <Table
      columns={[
        { kind: "grip", label: "" },
        { kind: "title", label: "Name" },
        { kind: "switch", label: "Shown" },
      ]}
      onMove={move}
    >
      {["One", "Two", "Three"].map((name, index) => (
        <Table.Row key={name} index={index} onOpen={open}>
          <Table.Grip index={index} label={`Move ${name}`} />
          <Table.Cell kind="title">
            <Table.Title title={name} />
          </Table.Cell>
          <Table.Control kind="switch">
            <Switch aria-label={`Show ${name}`} checked={false} onCheckedChange={toggle} />
          </Table.Control>
        </Table.Row>
      ))}
    </Table>,
  );
}

it("opens a row by click, Enter and Space, and moves between rows with the arrow keys", () => {
  const open = vi.fn();
  draw(open, () => {});
  const [first, second] = screen.getAllByRole("row").slice(1);
  fireEvent.click(first as HTMLElement);
  fireEvent.keyDown(second as HTMLElement, { key: "Enter" });
  fireEvent.keyDown(second as HTMLElement, { key: " " });
  expect(open.mock.calls).toEqual([["First"], ["Second"], ["Second"]]);

  (first as HTMLElement).focus();
  fireEvent.keyDown(first as HTMLElement, { key: "ArrowDown" });
  expect(document.activeElement).toBe(second);
});

it("keeps a static row out of the tab order, and a button's click away from its row", () => {
  const open = vi.fn();
  const act = vi.fn();
  draw(open, act);
  const rows = screen.getAllByRole("row");
  expect(rows.at(-1)?.hasAttribute("tabindex")).toBe(false);
  expect(rows.at(-1)?.hasAttribute("data-opens")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Act on First" }));
  expect(act).toHaveBeenCalledOnce();
  expect(open).not.toHaveBeenCalled();
});

it("aligns dates and actions with their headings and sizes the action column by its buttons", () => {
  draw(
    () => {},
    () => {},
  );
  const headings = screen.getAllByRole("columnheader");
  expect(headings.map((heading) => heading.className)).toEqual([
    "col-title",
    "col-date align-end",
    "col-action align-end",
  ]);
  expect(headings[2]?.style.getPropertyValue("--actions")).toBe("2");
  expect(screen.getAllByText("1 Oct")[0]?.className).toBe("align-end");
});

it("draws every row on one line, with nothing under its title", () => {
  draw(
    () => {},
    () => {},
  );
  const title = screen.getByText("First");
  expect(title.className).toBe("row__title");
  expect(title.parentElement?.querySelector(".row__note")).toBeNull();
});

it("moves a row of a table ordered by hand with the arrow keys on its grip", () => {
  const move = vi.fn();
  drawOrdered(
    move,
    () => {},
    () => {},
  );
  fireEvent.keyDown(screen.getByRole("button", { name: "Move One" }), { key: "ArrowDown" });
  fireEvent.keyDown(screen.getByRole("button", { name: "Move Three" }), { key: "ArrowUp" });
  // The last row has nowhere further down to go, which the table knows from its rows alone.
  fireEvent.keyDown(screen.getByRole("button", { name: "Move Three" }), { key: "ArrowDown" });
  expect(move.mock.calls).toEqual([
    [0, 1],
    [2, 1],
  ]);
});

it("keeps a click on a grip or a switch away from the row it sits in", () => {
  const open = vi.fn();
  const toggle = vi.fn();
  drawOrdered(() => {}, open, toggle);
  fireEvent.click(screen.getByRole("button", { name: "Move Two" }));
  fireEvent.click(screen.getByRole("switch", { name: "Show Two" }));
  expect(toggle).toHaveBeenCalledOnce();
  expect(open).not.toHaveBeenCalled();
});

it("draws a state as a badge in its tone", () => {
  render(<Table.Badge tone="danger">Spam</Table.Badge>);
  expect(screen.getByText("Spam").getAttribute("data-tone")).toBe("danger");
});
