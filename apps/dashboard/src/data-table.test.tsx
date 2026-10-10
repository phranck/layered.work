import { Button } from "@layered/ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DataTable } from "./data-table.js";

afterEach(cleanup);

/** Two rows that open, one static row, and one button in an action cell. */
function draw(open: (name: string) => void, act: () => void) {
  render(
    <DataTable
      columns={[
        { kind: "title", label: "Title" },
        { kind: "date", label: "Date" },
        { kind: "action", label: "Action", actions: 2 },
      ]}
    >
      {["First", "Second"].map((name) => (
        <DataTable.Row key={name} onOpen={() => open(name)}>
          <DataTable.Cell kind="title">
            <DataTable.Title title={name} note={`${name} note`} />
          </DataTable.Cell>
          <DataTable.Cell kind="date">1 Oct</DataTable.Cell>
          <DataTable.Actions>
            <Button.Icon label={`Act on ${name}`} icon={<span />} onClick={act} />
          </DataTable.Actions>
        </DataTable.Row>
      ))}
      <DataTable.Row>
        <DataTable.Cell kind="title">Static</DataTable.Cell>
      </DataTable.Row>
    </DataTable>,
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
