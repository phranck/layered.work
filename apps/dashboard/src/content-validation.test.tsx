import { type Finding, validateContent } from "@layered/content";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ContentFindings } from "./content-findings.js";
import { contentIsPublishable } from "./content-validation.js";
import { DashboardLanguageProvider } from "./language-context.js";

afterEach(cleanup);
it("refuses stale results and distinguishes clickable warnings from blocking errors", () => {
  const source = "Carousel { Text. }";
  const validation = validateContent(source);
  const warning: Finding = {
    code: "deprecated-component",
    severity: "warning",
    message: "Use Note.",
    component: "Note",
    from: 0,
    to: 1,
    line: 1,
    column: 1,
  };
  const onSelect = vi.fn();
  render(
    <DashboardLanguageProvider language="de">
      <ContentFindings
        source={source}
        checked={{ source, validation: { ...validation, findings: [...validation.findings, warning] } }}
        onSelect={onSelect}
      />
    </DashboardLanguageProvider>,
  );
  expect(screen.getByText("Veröffentlichung gesperrt: Carousel ist keine Komponente.")).toBeTruthy();
  const error = screen.getByRole("button", { name: /Fehler: Carousel/ });
  const warn = screen.getByRole("button", { name: /Warnung: Note/ });
  expect(error.closest("li")?.dataset.severity).toBe("error");
  expect(warn.closest("li")?.dataset.severity).toBe("warning");
  fireEvent.click(error);
  expect(onSelect).toHaveBeenCalledWith(validation.findings[0]);
  const valid = { source: "Prose", validation: validateContent("Prose") };
  expect(contentIsPublishable("Prose", valid)).toBe(true);
  expect(contentIsPublishable(source, valid)).toBe(false);
  expect(
    contentIsPublishable("Prose", {
      source: "Prose",
      validation: { publishable: true, findings: [warning] },
    }),
  ).toBe(true);
});
