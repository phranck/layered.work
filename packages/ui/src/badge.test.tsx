import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Badge } from "./badge.js";

afterEach(cleanup);

it("draws a state in its tone, and a neutral one in none", () => {
  render(
    <>
      <Badge tone="danger">Spam</Badge>
      <Badge tone="neutral">Read</Badge>
    </>,
  );
  expect(screen.getByText("Spam").getAttribute("data-tone")).toBe("danger");
  expect(screen.getByText("Read").hasAttribute("data-tone")).toBe(false);
});
