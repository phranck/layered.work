import { type Diagnostic, linter } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";
import { type Finding, validateContent } from "@layered/content";
import type { CheckedContent } from "./content-validation.js";
export const CONTENT_VALIDATION_DELAY = 250;
/** One shared validator, after typing pauses; offsets belong to the exact reported source. */
export function contentValidation(
  report: (checked: CheckedContent) => void,
  message: (finding: Finding) => string,
): Extension {
  return linter(
    (view) => {
      const source = view.state.doc.toString();
      const validation = validateContent(source);
      report({ source, validation });
      return validation.findings.map(
        (finding): Diagnostic => ({
          from: finding.from,
          to: finding.to,
          severity: finding.severity,
          message: message(finding),
        }),
      );
    },
    { delay: CONTENT_VALIDATION_DELAY },
  );
}
